/**
 * Bus simulator.
 *
 * The SRS calls this the demo centrepiece (§12): "a script that fakes buses
 * moving along your routes, including one that goes into a no-signal zone and
 * comes back". Judges cannot see real buses, so the simulation *is* the demo.
 *
 * It stands in for AIS-140 vehicle trackers and publishes over the same MQTT
 * topic real hardware would. Nothing downstream knows the difference — the API
 * validates, map-matches and predicts exactly as it would in production. Point
 * a real fleet at the broker and this script simply stops being needed.
 *
 * Run it alongside the API:  npm run dev:sim
 */

import mqtt from 'mqtt';
import { ROUTES, BUSES } from '@himgati/shared/data';
import { cumulativeDistances, pointAlong } from '@himgati/shared';
import type { LatLng, Route } from '@himgati/shared';
import { env } from '../config/env.ts';
import { logger } from '../config/logger.ts';

const log = logger.child({ module: 'simulator' });

/* ------------------------------- dead zones ------------------------------- */

/**
 * Stretches with no mobile coverage, as [startKm, endKm] along the route. These
 * are the whole reason the app is built the way it is — on the Shimla–Manali
 * corridor a phone can hold no fix for twenty minutes at a time.
 *
 * Sizing matters for the demo. A vehicle is only declared Signal Lost after
 * SIGNAL_LOST_AFTER_SEC (180s) of silence, measured against the *server's* wall
 * clock — time compression speeds the bus up, not the threshold. So a zone has
 * to take longer than three real minutes to cross before the state it exists to
 * demonstrate ever appears.
 *
 * R-42B's zone sits between Mandi (138 km) and Bhuntar (190 km): the Pandoh–Aut
 * gorge, which is both genuinely the worst coverage on the route and long enough
 * that at 12× it takes ~4.5 real minutes to cross.
 */
const DEAD_ZONES: Record<string, Array<[number, number]>> = {
  'R-42B': [[148, 178]],
  'R-07L': [[44, 56]],
  'R-55D': [[118, 145]],
};

/**
 * Pinned states, so the behaviours worth showing are always on screen rather
 * than depending on when someone happens to open the app.
 */
const PINNED: Record<string, { cancelled?: boolean; delayMin?: number; phase?: number }> = {
  'B-0456': { cancelled: true },
  'B-1187': { delayMin: 14 },
  // Parked just short of the Sundernagar–Mandi dead zone: roughly 45 seconds of
  // normal running, then Signal Lost with the age counter climbing, then a
  // visible catch-up when the buffered batch uploads.
  'B-3312': { delayMin: 4, phase: 0.45 },
  'B-5540': { delayMin: 7 },
};

/* -------------------------------- vehicles -------------------------------- */

interface SimBus {
  busId: string;
  route: Route;
  cum: number[];
  shapeTotalKm: number;
  roadTotalKm: number;
  cycleMin: number;
  runMin: number;
  offsetMin: number;
  delayMin: number;
  cancelled: boolean;
  /** Fixes recorded while out of coverage, flushed on reconnect. */
  buffer: Array<Record<string, unknown>>;
  wasInDeadZone: boolean;
  seed: number;
}

function buildFleet(): SimBus[] {
  const out: SimBus[] = [];

  for (const bus of BUSES) {
    const route = ROUTES.find((r) => r.id === bus.routeId);
    if (!route) continue;

    const pin = PINNED[bus.id] ?? {};
    const roadTotalKm = route.distancesKm[route.distancesKm.length - 1];
    const layoverMin = Math.max(15, route.typicalDurationMin * 0.18);
    const cycleMin = route.typicalDurationMin + layoverMin;
    const runFraction = route.typicalDurationMin / cycleMin;

    const fleetOnRoute = BUSES.filter((b) => b.routeId === route.id);
    const index = fleetOnRoute.findIndex((b) => b.id === bus.id);

    // Spread vehicles along the corridor, and park one in the origin bay so a
    // terminus board is never empty.
    const eligible = fleetOnRoute.filter((b) => !PINNED[b.id]?.cancelled);
    const inBay = eligible.length > 1 && eligible[eligible.length - 1]?.id === bus.id;

    const phase =
      pin.phase ??
      (inBay
        ? runFraction + (1 - runFraction) * 0.7
        : ((index / Math.max(1, fleetOnRoute.length)) * runFraction) % 1);

    const cum = cumulativeDistances(route.shape);

    out.push({
      busId: bus.id,
      route,
      cum,
      shapeTotalKm: cum[cum.length - 1],
      roadTotalKm,
      cycleMin,
      runMin: route.typicalDurationMin + Math.max(0, pin.delayMin ?? 0),
      offsetMin: phase * cycleMin,
      delayMin: pin.delayMin ?? 0,
      cancelled: pin.cancelled ?? false,
      buffer: [],
      wasInDeadZone: false,
      seed: out.length + 1,
    });
  }

  return out;
}

/** Stable pseudo-random in [0,1) from an integer seed. */
function seeded(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Crowd level, weighted towards the morning and evening peaks. Deterministic per
 * vehicle so it drifts slowly rather than flickering between ticks.
 */
function occupancyFor(seed: number, simMinutes: number): 'empty' | 'comfortable' | 'full' {
  const hour = (simMinutes / 60) % 24;
  const rush =
    Math.max(0, Math.cos(((hour - 9) / 12) * Math.PI)) +
    Math.max(0, Math.cos(((hour - 18) / 12) * Math.PI));
  const v = seeded(seed) * 0.5 + rush * 0.5;
  if (v > 0.78) return 'full';
  if (v > 0.34) return 'comfortable';
  return 'empty';
}

function inDeadZone(routeId: string, km: number): boolean {
  return (DEAD_ZONES[routeId] ?? []).some(([a, b]) => km >= a && km <= b);
}

/** Position and heading at a given road distance along the route. */
function locate(bus: SimBus, roadKm: number): { position: LatLng; bearing: number } {
  const shapeKm = (roadKm / bus.roadTotalKm) * bus.shapeTotalKm;
  const point = pointAlong(bus.route.shape, bus.cum, shapeKm);
  return { position: point.position, bearing: point.bearing };
}

/* --------------------------------- driver --------------------------------- */

async function main(): Promise<void> {
  const fleet = buildFleet();

  // Deliberately fixed, not random. Two simulators running at once publish
  // conflicting positions for the same vehicles — one reports while the other is
  // in a dead zone, so the blackout never lasts and the demo silently breaks.
  // MQTT disconnects a duplicate client id, so a second instance takes over
  // cleanly instead of racing the first.
  const client = await mqtt.connectAsync(env.MQTT_URL, { clientId: 'himgati-simulator' });

  log.info(
    { vehicles: fleet.length, broker: env.MQTT_URL, timeScale: env.SIM_TIME_SCALE },
    'simulator connected — publishing GPS',
  );

  const startedAt = Date.now();

  const tick = async () => {
    // Simulated minutes elapsed. The scale factor exists purely so a 7-hour run
    // is watchable in a demo; at SIM_TIME_SCALE=1 this is real time.
    const simMin = ((Date.now() - startedAt) * env.SIM_TIME_SCALE) / 60_000;

    // Publishes are collected and flushed together. Awaiting each QoS-1 PUBACK
    // in series made a tick outlast its own interval, which stretched the gap
    // between a vehicle's consecutive fixes far enough to trip the server's
    // plausibility check.
    const pending: Array<Promise<unknown>> = [];

    for (const bus of fleet) {
      // Delay, crowd level and cancellation come from the operator, not the GPS
      // box — so they go out on the status topic regardless of whether the
      // vehicle is reporting a position. A cancelled service publishes only
      // this: there is no position, but passengers still need to be told.
      const phase = (simMin + bus.offsetMin) % bus.cycleMin;
      const onLayover = !bus.cancelled && phase >= bus.runMin;

      pending.push(
        client.publishAsync(
          statusTopic(bus.busId),
          JSON.stringify({
            busId: bus.busId,
            timestamp: Date.now(),
            delayMin: bus.delayMin,
            occupancy: bus.cancelled ? 'unknown' : occupancyFor(bus.seed, simMin),
            cancelled: bus.cancelled,
            // Null once rolling, so the server clears the bay time rather than
            // reporting a departure for a bus that has already gone.
            departsInMin: onLayover
              ? Math.max(0, Math.round((bus.cycleMin - phase) / env.SIM_TIME_SCALE))
              : null,
          }),
          { qos: 1 },
        ),
      );

      if (bus.cancelled) continue;

      const phaseMin = (simMin + bus.offsetMin) % bus.cycleMin;
      const running = phaseMin < bus.runMin;

      // On layover at the origin: stationary, but still reporting.
      const roadKm = running ? Math.min(bus.roadTotalKm, (phaseMin / bus.runMin) * bus.roadTotalKm) : 0;
      const { position, bearing } = locate(bus, roadKm);
      const speedKmph = running ? (bus.roadTotalKm / bus.runMin) * 60 : 0;

      const reading = {
        busId: bus.busId,
        timestamp: Date.now(),
        lat: Number(position.lat.toFixed(6)),
        lng: Number(position.lng.toFixed(6)),
        speedKmph: Math.round(speedKmph),
        heading: Math.round(bearing),
        accuracyM: 8 + Math.round(Math.random() * 6),
      };

      const dark = running && inDeadZone(bus.route.id, roadKm);

      if (dark) {
        // No coverage: the device keeps recording and holds the fixes locally
        // rather than losing them (SRS §8.5, FR-6).
        bus.buffer.push(reading);
        if (!bus.wasInDeadZone) {
          log.warn({ busId: bus.busId, roadKm: Math.round(roadKm) }, 'entered dead zone');
          bus.wasInDeadZone = true;
        }
        continue;
      }

      if (bus.wasInDeadZone) {
        // Back in coverage — flush the backlog in one publish. The server
        // reconstructs the real path from it instead of the icon teleporting.
        const batch = [...bus.buffer, reading];
        bus.buffer = [];
        bus.wasInDeadZone = false;
        log.info({ busId: bus.busId, buffered: batch.length }, 'left dead zone — uploading backlog');
        pending.push(client.publishAsync(topic(bus.busId), JSON.stringify(batch), { qos: 1 }));
        continue;
      }

      pending.push(client.publishAsync(topic(bus.busId), JSON.stringify(reading), { qos: 1 }));
    }

    await Promise.all(pending);
  };

  await tick();

  let ticking = false;
  const timer = setInterval(() => {
    // A slow tick must not stack on the next one; skipping a beat keeps the
    // reporting interval honest instead of bunching fixes together.
    if (ticking) return;
    ticking = true;
    void tick()
      .catch((err) => log.error({ err: err.message }, 'tick failed'))
      .finally(() => {
        ticking = false;
      });
  }, env.SIM_REPORT_MS);

  const stop = async () => {
    clearInterval(timer);
    await client.endAsync();
    log.info('simulator stopped');
    process.exit(0);
  };

  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

const topic = (busId: string) => `him_gati/bus/${busId}/location`;
const statusTopic = (busId: string) => `him_gati/bus/${busId}/status`;

main().catch((err) => {
  log.error({ err: err instanceof Error ? err.message : err }, 'simulator failed');
  process.exit(1);
});
