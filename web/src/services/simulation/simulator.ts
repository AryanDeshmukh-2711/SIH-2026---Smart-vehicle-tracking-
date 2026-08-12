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
import { conditionsAt, travelMinutes } from './traffic';

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
  // Parked on the approach to the Sundernagar–Mandi dead zone: roughly a minute
  // and a half slowing through the Pandoh stretch, then about three minutes of
  // Signal Lost with the age counter climbing (long enough to cross into the
  // timetable fallback), then a visible catch-up slide on the far side. Long
  // enough to actually be watched, which is the point of the whole demo.
  'B-3312': { delayMin: 4, phaseOffset: 0.45 },
  'B-5540': { delayMin: 7 },
};

/**
 * Largest simulated step applied in one tick, in simulated minutes.
 *
 * Position is integrated rather than derived from a phase, so a tick that arrives
 * late must not teleport a bus. Browsers throttle timers hard in a background tab
 * — down to once a minute — and without this cap returning to the tab would jump
 * every vehicle tens of kilometres and briefly strand them in dead zones.
 */
const MAX_STEP_MIN = 5;

interface TripState {
  busId: string;
  routeId: string;
  tripId: string;
  /** Minutes a completed run stands at the terminus before starting again. */
  layoverMin: number;
  /** Counts down while the vehicle is laying over; 0 means it is running. */
  layoverRemainingMin: number;
  /** Schedule delay the trip started with, from the depot's own reckoning. */
  baseDelayMin: number;
  /** Minutes gained or lost to road conditions so far this run. */
  trafficDelayMin: number;
  occupancySeed: number;
  /** True position along the route, integrated from speed each tick. */
  trueKm: number;
  /** Reported (possibly stale) road km. */
  reportedKm: number;
  reportedAtSimMs: number;
  /** Smoothed position used for drawing, so recovery slides instead of jumping. */
  displayKm: number;
  lastSeenStopName: string;
  started: boolean;
  /** Simulated clock at the previous tick, for the integration step. */
  lastSimMs: number;
}

/**
 * Occupancy peaks around the morning and evening rush.
 *
 * `hour` is the *real* hour of the day, not the simulated one. The simulated
 * clock starts at zero when the page loads, so keying occupancy off it meant
 * every session opened at a modelled midnight — empty buses while the greeting
 * said "Good afternoon" and the timetable showed afternoon departures. Every
 * other time-of-day fact in the app comes from the wall clock; this now does too.
 */
function occupancyFor(seed: number, hour: number): Occupancy {
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

      // Translate the seeded cycle phase into the integrated model: a phase inside
      // the running span becomes a position on the road, one past it becomes
      // time still to wait in the origin bay.
      const totalKm = routeDistanceKm(route);
      const running = phase < runFraction;
      const trueKm = running ? (phase / runFraction) * totalKm : 0;
      const layoverRemainingMin = running
        ? 0
        : (1 - (phase - runFraction) / Math.max(1e-6, 1 - runFraction)) * layoverMin;

      this.trips.set(bus.id, {
        busId: bus.id,
        routeId: route.id,
        tripId: `${route.id}:${route.departures[indexOnRoute % route.departures.length]}`,
        layoverMin,
        layoverRemainingMin,
        baseDelayMin: pin.delayMin ?? Math.round(seeded(i + 21) * 6) - 1,
        trafficDelayMin: 0,
        occupancySeed: i + 1,
        trueKm,
        reportedKm: trueKm,
        reportedAtSimMs: 0,
        displayKm: trueKm,
        lastSeenStopName: stopName(route.stopIds[0]),
        started: running,
        lastSimMs: 0,
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
    const realHour = new Date().getHours() + new Date().getMinutes() / 60;

    this.snapshot = BUSES.map((bus) => {
      const route = ROUTE_BY_ID.get(bus.routeId)!;
      const trip = this.trips.get(bus.id)!;
      const totalKm = routeDistanceKm(route);
      const cum = routeCumulative(route);
      const pin = PINNED[bus.id] ?? {};

      const cancelled = pin.status === 'cancelled';
      /** Speed the timetable assumes, before the road has its say. */
      const scheduledKmph = (totalKm / route.typicalDurationMin) * 60;

      /* --------------------------- integrate motion -------------------------- */
      // Position is advanced from the *current* road speed rather than read off a
      // fixed phase. That is the whole point: a bus that hits the Pandoh stretch
      // slows down, its ETA grows, and when it clears the jam the ETA comes back
      // in. A phase-derived position can only ever count down.
      const dtMin = Math.min(MAX_STEP_MIN, Math.max(0, (simMs - trip.lastSimMs) / 60_000));
      trip.lastSimMs = simMs;

      const road = conditionsAt(route.id, trip.trueKm, simMin, realHour);

      if (!cancelled && dtMin > 0) {
        if (trip.layoverRemainingMin > 0) {
          trip.layoverRemainingMin -= dtMin;
          if (trip.layoverRemainingMin <= 0) {
            // Pulling out of the bay on a fresh trip: the previous run's traffic
            // is not this run's problem.
            trip.layoverRemainingMin = 0;
            trip.trueKm = 0;
            trip.trafficDelayMin = 0;
          }
        } else {
          trip.trueKm += ((scheduledKmph * road.multiplier) / 60) * dtMin;

          // Minutes lost (or clawed back) against the timetable over this step.
          trip.trafficDelayMin = Math.min(
            90,
            Math.max(-8, trip.trafficDelayMin + (1 - road.multiplier) * dtMin),
          );

          if (trip.trueKm >= totalKm) {
            trip.trueKm = totalKm;
            trip.layoverRemainingMin = trip.layoverMin;
          }
        }
      }

      const running = !cancelled && trip.layoverRemainingMin <= 0;
      const trueKm = running ? Math.min(totalKm, trip.trueKm) : 0;
      /** Schedule position: what the depot would report as this trip's delay. */
      const delayMin = Math.round(trip.baseDelayMin + trip.trafficDelayMin);

      /* ------------------- reporting: dead zones freeze it ------------------ */
      const blocked = !cancelled && running && this.inDeadZone(route.id, trueKm);

      if (cancelled) {
        // A cancelled service does not move. Advancing its position while the
        // card says "Cancelled" and the speed reads 0 km/h is three statements
        // about one vehicle that cannot all be true.
        trip.reportedAtSimMs = simMs;
        trip.started = false;
      } else if (!running) {
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
      else if (delayMin >= 5) status = 'delayed';
      else status = 'running';

      /* ----------------------------- geometry ------------------------------ */
      const onLine = pointAlong(route.shape, cum, roadKmToShapeKm(route, trip.displayKm));
      // Reported speed is the real current speed, so it visibly drops in traffic
      // instead of sitting on a constant derived from the timetable.
      const speedKmph = !running || blocked || cancelled ? 0 : scheduledKmph * road.multiplier;

      /* ---------------------------- predictions ---------------------------- */
      // A vehicle on layover at the origin is still a departure that matters —
      // at a terminus like Shimla ISBT it is the *only* kind that matters. Its
      // upcoming stops are predicted from the moment it is due to pull out.
      const departsInMin = running ? 0 : Math.max(0, trip.layoverRemainingMin);

      const aheadIndex = route.distancesKm.findIndex((d) => d > trip.reportedKm);
      const nextStopIndex = !running
        ? 0
        : Math.min(
            route.stopIds.length - 1,
            aheadIndex === -1 ? route.stopIds.length - 1 : aheadIndex,
          );

      const predictions = cancelled
        ? []
        : this.predict(route.id, trip, ageSec, nextStopIndex, departsInMin, simMin, realHour);

      const live: VehiclePosition = {
        busId: bus.id,
        tripId: trip.tripId,
        routeId: route.id,
        position: onLine.position,
        bearing: onLine.bearing,
        speedKmph: Math.round(speedKmph),
        // `ageSec` is measured on the simulated clock, and every consumer —
        // confidence, Signal Lost, the "updated N ago" line — reads it in those
        // terms. `recordedAt` has to agree with it: dividing by TIME_SCALE here
        // made the two fields describe ages 12× apart for the same fix.
        recordedAt: new Date(Date.now() - ageSec * 1000).toISOString(),
        ageSec: Math.round(ageSec),
        status,
        delayMin,
        occupancy: cancelled ? 'unknown' : occupancyFor(trip.occupancySeed, realHour),
        nextStopIndex,
        progressKm: Math.round(trip.reportedKm * 10) / 10,
        predictions,
        lastSeenStopName: blocked ? trip.lastSeenStopName : undefined,
        // Why the ETA is moving. Reported only while the vehicle is actually
        // running and reporting — congestion on a stationary or silent bus is
        // not something we know.
        congestion: running && !blocked ? Math.round(road.multiplier * 100) / 100 : undefined,
        delayCause: running && !blocked ? (road.cause ?? undefined) : undefined,
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
    departsInMin: number,
    simMin: number,
    hour: number,
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
    // fix; assume it kept going at the prevailing speed for that stretch rather
    // than pretending it stopped.
    const staleRoad = conditionsAt(route.id, trip.reportedKm, simMin, hour);
    const assumedKm = trip.reportedKm + (ageSec / 3600) * cruiseKmph * staleRoad.multiplier;

    const out: StopPrediction[] = [];
    for (let i = nextStopIndex; i < route.stopIds.length; i++) {
      const remainingKm = Math.max(0, route.distancesKm[i] - assumedKm);
      const stopsBetween = Math.max(0, i - nextStopIndex);
      // Integrated over the road actually ahead, so a jam between here and there
      // pushes the ETA out and clearing it pulls the ETA back in.
      const travelMin = travelMinutes(
        route.id,
        assumedKm,
        route.distancesKm[i],
        cruiseKmph,
        simMin,
        hour,
      );
      const etaMin = Math.max(0, departsInMin + travelMin + stopsBetween * dwell);

      out.push({
        stopId: route.stopIds[i],
        etaMin: Math.round(etaMin),
        rangeMin: rangeFor(Math.round(etaMin), confidence).map(Math.round) as [number, number],
        confidence,
        // The *scheduled* time is the timetable's, so the traffic the vehicle is
        // sitting in has to come back out of it — otherwise a delayed bus would
        // report a scheduled time that drifts along with its own lateness.
        scheduled: hhmm24(
          new Date(Date.now() + (etaMin - (trip.baseDelayMin + trip.trafficDelayMin)) * 60_000),
        ),
        distanceKm: Math.round(remainingKm * 10) / 10,
      });
    }
    return out;
  }

  /**
   * Timetable-derived arrivals: the next *scheduled* service, ignoring live
   * position entirely. Always low confidence, because a timetable is a plan
   * rather than an observation.
   *
   * One trip is chosen — the next one still due at the vehicle's next stop — and
   * that single origin departure is propagated down the line. Picking a
   * departure independently per stop (as this used to) let a different service
   * win at each stop, which produced arrival times that went *backwards* along
   * the route: 76 min to Mandi, then 21 min to Bhuntar beyond it.
   */
  private predictFromTimetable(route: Route, nextStopIndex: number): StopPrediction[] {
    const totalKm = routeDistanceKm(route);
    const nowMs = Date.now();

    /** Minutes from the origin departure to stop `i`, monotonic in `i`. */
    const offsetAt = (i: number) => (route.distancesKm[i] / totalKm) * route.typicalDurationMin;

    const targetOffsetMs = offsetAt(nextStopIndex) * 60_000;
    let originDeparture: Date | null = null;

    for (const dep of route.departures) {
      const [h, m] = dep.split(':').map(Number);
      const t = new Date();
      t.setHours(h, m, 0, 0);
      if (t.getTime() + targetOffsetMs > nowMs) {
        originDeparture = t;
        break;
      }
    }

    // Nothing left today — roll to the first service tomorrow.
    if (!originDeparture) {
      const [h, m] = route.departures[0].split(':').map(Number);
      originDeparture = new Date();
      originDeparture.setDate(originDeparture.getDate() + 1);
      originDeparture.setHours(h, m, 0, 0);
    }

    const out: StopPrediction[] = [];
    for (let i = nextStopIndex; i < route.stopIds.length; i++) {
      const arrival = new Date(originDeparture.getTime() + offsetAt(i) * 60_000);
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

export function departuresAtStop(
  stopId: string,
  fleet: LiveBus[] = simulator.getSnapshot(),
): Array<{ live: LiveBus; prediction: StopPrediction }> {
  const out: Array<{ live: LiveBus; prediction: StopPrediction }> = [];

  for (const lb of fleet) {
    if (lb.live.status === 'cancelled') continue;
    const prediction = lb.live.predictions.find((p) => p.stopId === stopId);
    if (prediction && prediction.etaMin <= LIVE_BOARD_HORIZON_MIN) {
      out.push({ live: lb, prediction });
    }
  }

  return out.sort((a, b) => a.prediction.etaMin - b.prediction.etaMin);
}

export { LIVE_BOARD_HORIZON_MIN };
