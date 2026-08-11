/**
 * Fleet simulator.
 *
 * The SRS calls for a bus simulator as the demo centrepiece (§12): "a script
 * that fakes buses moving along your routes, including one that goes into a
 * no-signal zone and comes back". This is that script, running client-side.
 *
 * It stands in for the whole ingest pipeline — AIS-140 VLTD → MQTT → cleaning →
 * map-matching → prediction → WebSocket fan-out — and emits exactly the
 * `VehiclePosition` shape a real GTFS-Realtime feed would. Replacing it means
 * swapping the publisher in `services/client.ts`; no screen changes.
 *
 * What it deliberately models rather than glosses over:
 *   • Dead zones. A bus inside one stops reporting. Its last known position
 *     freezes, its age climbs, its ETA confidence degrades and eventually the
 *     trip is marked Signal Lost (FR-5, §8.5).
 *   • Recovery. On exit the backlog uploads at once and the marker *slides* to
 *     the true position instead of teleporting (§8.5).
 *   • Honest confidence. Confidence is derived from data age alone (§8.3).
 */

import type { LiveBus, Occupancy, Route, StopPrediction, TripStatus, VehiclePosition } from '@/types';
import { BUSES } from '@/data/buses';
import { ROUTE_BY_ID, routeCumulative, routeDistanceKm, roadKmToShapeKm } from '@/data/routes';
import { stopName } from '@/data/stops';
import { pointAlong } from '@/lib/geo';
import {
  confidenceFromAge,
  rangeFor,
  SIGNAL_LOST_AFTER_SEC,
  TIMETABLE_FALLBACK_AFTER_SEC,
} from '@/lib/eta';
import { greenScore } from '@/lib/green';
import { hhmm24, seeded } from '@/lib/format';

/**
 * Demo time compression. A 7-hour Shimla→Manali run is unwatchable in real
 * time, so simulated clocks advance faster than the wall clock. Set to 1 for a
 * true-time run; a live deployment never uses this at all.
 */
export const TIME_SCALE = 12;

/** How often the simulator recomputes the fleet, in real milliseconds. */
const TICK_MS = 1000;

/** Stretches with no mobile coverage, as [startKm, endKm] along the route. */
const DEAD_ZONES: Record<string, Array<[number, number]>> = {
  'R-42B': [[138, 154]],
  'R-07L': [[41, 51]],
  'R-55D': [[118, 140]],
};

/** Seconds a bus stands at an intermediate stop, by service class. */
const DWELL_MIN: Record<string, number> = {
  volvo: 3,
  express: 2.5,
  deluxe: 2,
  ordinary: 1.5,
  local: 0.7,
};

/**
 * Pinned states so the states that matter are always demonstrable, rather than
 * depending on when the judge happens to open the app.
 */
const PINNED: Record<string, { status?: 'cancelled'; delayMin?: number; phaseOffset?: number }> = {
  'B-0456': { status: 'cancelled' },
  'B-1187': { delayMin: 14 },
  // Parked just short of the Sundernagar–Mandi dead zone: roughly 45 seconds of
  // normal running, then two and a half minutes of Signal Lost with the age
  // counter climbing, then a visible catch-up slide. Long enough to actually be
  // watched, which is the point of the whole demo.
  'B-3312': { delayMin: 4, phaseOffset: 0.45 },
  'B-5540': { delayMin: 7 },
};

interface TripState {
  busId: string;
  routeId: string;
  tripId: string;
  /** Fraction of the cycle spent running, the rest is layover at the terminus. */
  runFraction: number;
  cycleMin: number;
  offsetMin: number;
  delayMin: number;
  occupancySeed: number;
  /** Reported (possibly stale) road km. */
  reportedKm: number;
  reportedAtSimMs: number;
  /** Smoothed position used for drawing, so recovery slides instead of jumping. */
  displayKm: number;
  lastSeenStopName: string;
  started: boolean;
}

function occupancyFor(seed: number, simMinutes: number): Occupancy {
  // Slowly varying, deterministic, and peaks around the morning/evening rush.
  const hour = (simMinutes / 60) % 24;
  const rush = Math.max(0, Math.cos(((hour - 9) / 12) * Math.PI)) + Math.max(0, Math.cos(((hour - 18) / 12) * Math.PI));
  const v = seeded(seed) * 0.5 + rush * 0.5;
  if (v > 0.78) return 'full';
  if (v > 0.34) return 'comfortable';
  return 'empty';
}

class FleetSimulator {
  private trips = new Map<string, TripState>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshot: LiveBus[] = [];
  private startedAtMs = Date.now();

  constructor() {
    this.seedTrips();
    this.recompute();
  }

  /* ------------------------------ lifecycle ------------------------------ */

  private ensureRunning() {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      this.recompute();
      for (const l of this.listeners) l();
    }, TICK_MS);
  }

  private stopIfIdle() {
    if (this.listeners.size === 0 && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.ensureRunning();
    return () => {
      this.listeners.delete(listener);
      this.stopIfIdle();
    };
  };

  getSnapshot = (): LiveBus[] => this.snapshot;

  /* ------------------------------- seeding ------------------------------- */

  private seedTrips() {
    BUSES.forEach((bus, i) => {
      const route = ROUTE_BY_ID.get(bus.routeId)!;
      const pin = PINNED[bus.id] ?? {};
      const layoverMin = Math.max(15, route.typicalDurationMin * 0.18);
      const cycleMin = route.typicalDurationMin + layoverMin;
      const runFraction = route.typicalDurationMin / cycleMin;

      const sameRoute = BUSES.filter((b) => b.routeId === bus.routeId);
      const indexOnRoute = sameRoute.findIndex((b) => b.id === bus.id);

      // One vehicle per route starts on layover in the origin bay. Without this
      // every bus is mid-route at launch and a terminus like Shimla ISBT — the
      // busiest stop in the network — opens with an empty departure board,
      // which is both a poor first impression and simply not what a stand looks
      // like. A cancelled vehicle cannot fill the slot, so it is skipped.
      const bayCandidates = sameRoute.filter((b) => PINNED[b.id]?.status !== 'cancelled');
      const inBay = bayCandidates.length > 1 && bayCandidates[bayCandidates.length - 1].id === bus.id;

      const phase =
        pin.phaseOffset ??
        (inBay
          ? runFraction + (1 - runFraction) * (0.55 + seeded(i + 3) * 0.4)
          : ((indexOnRoute / Math.max(1, sameRoute.length)) * runFraction + seeded(i + 7) * 0.06) % 1);

      this.trips.set(bus.id, {
        busId: bus.id,
        routeId: route.id,
        tripId: `${route.id}:${route.departures[indexOnRoute % route.departures.length]}`,
        runFraction: route.typicalDurationMin / cycleMin,
        cycleMin,
        offsetMin: phase * cycleMin,
        delayMin: pin.delayMin ?? Math.round(seeded(i + 21) * 6) - 1,
        occupancySeed: i + 1,
        reportedKm: 0,
        reportedAtSimMs: 0,
        displayKm: 0,
        lastSeenStopName: stopName(route.stopIds[0]),
        started: false,
      });
    });
  }

  /* ------------------------------- stepping ------------------------------ */

  /** Simulated milliseconds elapsed since the app opened. */
  private simMs(): number {
    return (Date.now() - this.startedAtMs) * TIME_SCALE;
  }

  private inDeadZone(routeId: string, km: number): boolean {
    return (DEAD_ZONES[routeId] ?? []).some(([a, b]) => km >= a && km <= b);
  }

  private recompute() {
    const simMs = this.simMs();
    const simMin = simMs / 60_000;

    this.snapshot = BUSES.map((bus) => {
      const route = ROUTE_BY_ID.get(bus.routeId)!;
      const trip = this.trips.get(bus.id)!;
      const totalKm = routeDistanceKm(route);
      const cum = routeCumulative(route);
      const pin = PINNED[bus.id] ?? {};

      const effectiveDurationMin = route.typicalDurationMin + Math.max(0, trip.delayMin);
      const phaseMin = (simMin + trip.offsetMin) % trip.cycleMin;
      const running = phaseMin < effectiveDurationMin;

      /* --- where the vehicle truly is, before any reporting is considered --- */
      const trueKm = running
        ? Math.min(totalKm, (phaseMin / effectiveDurationMin) * totalKm)
        : 0;

      /* ------------------- reporting: dead zones freeze it ------------------ */
      const cancelled = pin.status === 'cancelled';
      const blocked = !cancelled && running && this.inDeadZone(route.id, trueKm);

      if (!running) {
        // Layover at the terminus: the vehicle is stationary but still reporting.
        trip.reportedKm = 0;
        trip.displayKm = 0;
        trip.reportedAtSimMs = simMs;
        trip.lastSeenStopName = stopName(route.stopIds[0]);
        trip.started = false;
      } else if (!blocked) {
        // Crossing back into coverage uploads the backlog at once (§8.5).
        trip.reportedKm = trueKm;
        trip.reportedAtSimMs = simMs;
        trip.started = true;

        const passed = route.distancesKm.filter((d) => d <= trueKm).length;
        trip.lastSeenStopName = stopName(route.stopIds[Math.max(0, passed - 1)]);
      }
      // While `blocked`, reportedKm and reportedAtSimMs are left untouched: the
      // last known position simply ages, which is the entire point.

      /* --------- smooth the drawn position so recovery does not jump -------- */
      const diff = trip.reportedKm - trip.displayKm;
      trip.displayKm =
        Math.abs(diff) < 0.4 ? trip.reportedKm : trip.displayKm + diff * 0.14;

      /* ------------------------------ status ------------------------------- */
      const ageSec = Math.max(0, (simMs - trip.reportedAtSimMs) / 1000);
      let status: TripStatus;
      if (cancelled) status = 'cancelled';
      else if (!running) status = 'scheduled';
      else if (ageSec >= SIGNAL_LOST_AFTER_SEC) status = 'signal-lost';
      else if (trip.delayMin >= 5) status = 'delayed';
      else status = 'running';

      /* ----------------------------- geometry ------------------------------ */
      const onLine = pointAlong(route.shape, cum, roadKmToShapeKm(route, trip.displayKm));
      const speedKmph = !running || blocked || cancelled ? 0 : (totalKm / effectiveDurationMin) * 60;

      /* ---------------------------- predictions ---------------------------- */
      // A vehicle on layover at the origin is still a departure that matters —
      // at a terminus like Shimla ISBT it is the *only* kind that matters. Its
      // upcoming stops are predicted from the moment it is due to pull out.
      const departsInMin = running ? 0 : Math.max(0, trip.cycleMin - phaseMin);

      const aheadIndex = route.distancesKm.findIndex((d) => d > trip.reportedKm);
      const nextStopIndex = !running
        ? 0
        : Math.min(
            route.stopIds.length - 1,
            aheadIndex === -1 ? route.stopIds.length - 1 : aheadIndex,
          );

      const predictions = cancelled
        ? []
        : this.predict(route.id, trip, ageSec, nextStopIndex, departsInMin);

      const live: VehiclePosition = {
        busId: bus.id,
        tripId: trip.tripId,
        routeId: route.id,
        position: onLine.position,
        bearing: onLine.bearing,
        speedKmph: Math.round(speedKmph),
        recordedAt: new Date(Date.now() - (ageSec * 1000) / TIME_SCALE).toISOString(),
        ageSec: Math.round(ageSec),
        status,
        delayMin: trip.delayMin,
        occupancy: cancelled ? 'unknown' : occupancyFor(trip.occupancySeed, simMin),
        nextStopIndex,
        progressKm: Math.round(trip.reportedKm * 10) / 10,
        predictions,
        lastSeenStopName: blocked ? trip.lastSeenStopName : undefined,
      };

      return { bus, route, live, greenScore: greenScore(bus) };
    });
  }

  /**
   * ETA for every upcoming stop (FR-8).
   *
   * Distance is road distance, not straight line (FR-9). Dwell time at
   * intermediate stops is added (FR-10). Confidence comes from data age alone,
   * and a low-confidence prediction is widened into a range rather than being
   * dressed up as a precise number (FR-12, FR-13).
   */
  private predict(
    routeId: string,
    trip: TripState,
    ageSec: number,
    nextStopIndex: number,
    departsInMin = 0,
  ): StopPrediction[] {
    const route = ROUTE_BY_ID.get(routeId)!;
    const totalKm = routeDistanceKm(route);
    const cruiseKmph = (totalKm / route.typicalDurationMin) * 60;
    const dwell = DWELL_MIN[route.category] ?? 1.5;
    const confidence = confidenceFromAge(ageSec);

    // Past the fallback threshold the last fix is too old to extrapolate from,
    // so we stop pretending and answer from the published timetable instead
    // (SRS §8.5). The UI says so in as many words; this is what makes that true.
    if (ageSec >= TIMETABLE_FALLBACK_AFTER_SEC) {
      return this.predictFromTimetable(route, nextStopIndex);
    }

    // A stale feed means the bus has almost certainly moved on since the last
    // fix; assume it kept going at cruise speed rather than pretending it stopped.
    const assumedKm = trip.reportedKm + (ageSec / 3600) * cruiseKmph;

    const out: StopPrediction[] = [];
    for (let i = nextStopIndex; i < route.stopIds.length; i++) {
      const remainingKm = Math.max(0, route.distancesKm[i] - assumedKm);
      const stopsBetween = Math.max(0, i - nextStopIndex);
      const travelMin = (remainingKm / cruiseKmph) * 60;
      const etaMin = Math.max(
        0,
        departsInMin + travelMin + stopsBetween * dwell + Math.max(0, trip.delayMin) * 0.15,
      );

      out.push({
        stopId: route.stopIds[i],
        etaMin: Math.round(etaMin),
        rangeMin: rangeFor(Math.round(etaMin), confidence).map(Math.round) as [number, number],
        confidence,
        scheduled: hhmm24(new Date(Date.now() + (etaMin - trip.delayMin) * 60_000)),
        distanceKm: Math.round(remainingKm * 10) / 10,
      });
    }
    return out;
  }

  /**
   * Timetable-derived arrivals: the next *scheduled* service at each upcoming
   * stop, ignoring live position entirely. Always low confidence, because a
   * timetable is a plan rather than an observation.
   */
  private predictFromTimetable(route: Route, nextStopIndex: number): StopPrediction[] {
    const totalKm = routeDistanceKm(route);
    const nowMs = Date.now();
    const out: StopPrediction[] = [];

    for (let i = nextStopIndex; i < route.stopIds.length; i++) {
      const offsetMin = (route.distancesKm[i] / totalKm) * route.typicalDurationMin;

      // First scheduled call at this stop that has not already gone.
      let arrival: Date | null = null;
      for (const dep of route.departures) {
        const [h, m] = dep.split(':').map(Number);
        const t = new Date();
        t.setHours(h, m, 0, 0);
        const candidate = new Date(t.getTime() + offsetMin * 60_000);
        if (candidate.getTime() > nowMs) {
          arrival = candidate;
          break;
        }
      }
      if (!arrival) {
        const [h, m] = route.departures[0].split(':').map(Number);
        const t = new Date();
        t.setDate(t.getDate() + 1);
        t.setHours(h, m, 0, 0);
        arrival = new Date(t.getTime() + offsetMin * 60_000);
      }

      const etaMin = Math.max(0, Math.round((arrival.getTime() - nowMs) / 60_000));
      out.push({
        stopId: route.stopIds[i],
        etaMin,
        rangeMin: rangeFor(etaMin, 'low').map(Math.round) as [number, number],
        confidence: 'low',
        scheduled: hhmm24(arrival),
        distanceKm: Math.round((route.distancesKm[i] - route.distancesKm[nextStopIndex]) * 10) / 10,
      });
    }

    return out;
  }
}

export const simulator = new FleetSimulator();

/* --------------------------------- helpers -------------------------------- */

export function liveBusById(id: string): LiveBus | undefined {
  return simulator.getSnapshot().find((b) => b.bus.id === id);
}

/** Accepts "HP-01-4021", "hp014021" or the internal id — all reach the same bus. */
export function liveBusByRegistration(query: string): LiveBus | undefined {
  const normalise = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
  const target = normalise(query);
  return simulator
    .getSnapshot()
    .find(
      (b) => normalise(b.bus.registration) === target || normalise(b.bus.id) === target,
    );
}

/**
 * Departure board for a stop, soonest first.
 *
 * Includes vehicles still on layover at their origin — at a terminus those are
 * the entire board — but drops anything more than two hours out, which is the
 * timetable's job rather than a live board's.
 */
const LIVE_BOARD_HORIZON_MIN = 120;

export function departuresAtStop(stopId: string): Array<{ live: LiveBus; prediction: StopPrediction }> {
  const out: Array<{ live: LiveBus; prediction: StopPrediction }> = [];

  for (const lb of simulator.getSnapshot()) {
    if (lb.live.status === 'cancelled') continue;
    const prediction = lb.live.predictions.find((p) => p.stopId === stopId);
    if (prediction && prediction.etaMin <= LIVE_BOARD_HORIZON_MIN) {
      out.push({ live: lb, prediction });
    }
  }

  return out.sort((a, b) => a.prediction.etaMin - b.prediction.etaMin);
}

export { LIVE_BOARD_HORIZON_MIN };
