/**
 * GPS ingestion.
 *
 * The one path every position takes:
 *
 *   raw reading → validate → map-match → live state (Redis)
 *                                     → history (Postgres)
 *                                     → ETA → broadcast (Socket.IO)
 *
 * Everything downstream — the map, the arrival board, the notifications — reads
 * what this writes, so the invariant it protects is simple: a reading that
 * cannot be trusted never becomes "where the bus is".
 */

import { SIGNAL_LOST_AFTER_SEC } from '@himgati/shared';
import type { StopPrediction } from '@himgati/shared';
import { env } from '../../config/env.ts';
import { etaLog, gpsLog } from '../../config/logger.ts';
import { prisma } from '../../db/prisma.ts';
import { matchToRoute } from '../../db/geo.ts';
import { network } from '../../state/network.ts';
import {
  ageSecOf,
  cacheEta,
  effectiveStatus,
  getAllLive,
  getLiveRaw,
  getOps,
  setLive,
  type LiveVehicle,
} from '../../state/live.ts';
import { computeEta } from '../eta/engine.ts';
import { validateReading, type AcceptedReading, type RawReading } from './validate.ts';
import { broadcastVehicle } from '../../realtime/publish.ts';

export interface IngestOutcome {
  accepted: boolean;
  reason?: string;
  busId: string;
}

/** Counters surfaced on /health so a broken feed is visible, not silent. */
export const ingestStats = {
  received: 0,
  accepted: 0,
  rejected: 0,
  buffered: 0,
  byReason: {} as Record<string, number>,
};

export async function ingestReading(raw: RawReading): Promise<IngestOutcome> {
  ingestStats.received++;

  const bus = network.bus(raw.busId) ?? network.busByRegistration(raw.busId);
  if (!bus) {
    ingestStats.rejected++;
    ingestStats.byReason['unknown-vehicle'] = (ingestStats.byReason['unknown-vehicle'] ?? 0) + 1;
    return { accepted: false, reason: 'unknown-vehicle', busId: raw.busId };
  }

  const route = network.route(bus.routeId);
  if (!route) {
    ingestStats.rejected++;
    return { accepted: false, reason: 'unknown-route', busId: bus.id };
  }

  /* ------------------------------- validate ------------------------------- */

  const previous = await getLiveRaw(bus.id);
  const result = validateReading(
    { ...raw, busId: bus.id },
    {
      previous: previous
        ? {
            position: { lat: previous.lat, lng: previous.lng },
            recordedAt: new Date(previous.recordedAt),
          }
        : null,
      maxSpeedKmph: env.GPS_MAX_SPEED_KMPH,
      // Beyond a signal-loss gap we have no basis to call a jump impossible.
      maxGapSec: SIGNAL_LOST_AFTER_SEC,
    },
  );

  if (!result.ok) {
    ingestStats.rejected++;
    ingestStats.byReason[result.reason] = (ingestStats.byReason[result.reason] ?? 0) + 1;
    gpsLog.debug({ busId: bus.id, reason: result.reason, detail: result.detail }, 'reading rejected');
    return { accepted: false, reason: result.reason, busId: bus.id };
  }

  const reading = result.reading;
  if (reading.buffered) ingestStats.buffered++;

  /* ------------------------------ map matching ---------------------------- */

  const match = await matchToRoute(route.id, reading.position);

  if (!match) {
    ingestStats.rejected++;
    return { accepted: false, reason: 'no-route-geometry', busId: bus.id };
  }

  // Well off the alignment: either the vehicle has genuinely diverted or the fix
  // is a reflection. Either way it must not be snapped onto the route as if it
  // were normal progress (SRS FR-7).
  if (match.offsetM > env.GPS_MAX_OFFROUTE_M) {
    ingestStats.rejected++;
    ingestStats.byReason['off-route'] = (ingestStats.byReason['off-route'] ?? 0) + 1;
    gpsLog.warn(
      { busId: bus.id, routeId: route.id, offsetM: match.offsetM },
      'reading is off route',
    );
    return { accepted: false, reason: 'off-route', busId: bus.id };
  }

  /* --------------------------- late backlog fixes ------------------------- */

  // A buffered fix is real history, but it must not drag the live marker
  // backwards — the current position is still the newest one we hold.
  const isNewest =
    !previous || reading.recordedAt.getTime() >= new Date(previous.recordedAt).getTime();

  await persistHistory(bus.id, reading, match);

  if (!isNewest) {
    gpsLog.debug({ busId: bus.id }, 'buffered fix stored to history only');
    ingestStats.accepted++;
    return { accepted: true, reason: 'buffered-history', busId: bus.id };
  }

  /* ------------------------------- live state ----------------------------- */

  const trip = await currentTrip(bus.id, route.id);
  const ageSec = 0; // just received
  const delayMin = trip?.delayMin ?? 0;

  const eta = computeEta({
    route,
    progressKm: match.progressKm,
    ageSec,
    delayMin,
  });

  const passedCount = route.distancesKm.filter((d) => d <= match.progressKm).length;
  const lastSeenStopId = route.stopIds[Math.max(0, passedCount - 1)];

  const vehicle: LiveVehicle = {
    busId: bus.id,
    tripId: trip?.id ?? null,
    routeId: route.id,
    lat: reading.position.lat,
    lng: reading.position.lng,
    matchedLat: match.matched.lat,
    matchedLng: match.matched.lng,
    bearing: reading.heading,
    speedKmph: Math.round(reading.speedKmph),
    progressKm: match.progressKm,
    nextStopIndex: eta.nextStopIndex,
    recordedAt: reading.recordedAt.toISOString(),
    receivedAt: new Date().toISOString(),
    // Cancellation and crowd level are owned by the operator channel and are
    // overlaid when this record is read, so nothing is asserted about them here.
    status: delayMin >= 5 ? 'delayed' : 'running',
    delayMin,
    occupancy: 'unknown',
    lastSeenStopName: network.stop(lastSeenStopId)?.name ?? null,
  };

  await setLive(vehicle);
  if (trip) await cacheEta(trip.id, eta.predictions);

  // Broadcast the merged view. The record we just stored deliberately carries
  // neutral values for the operator-owned fields, and emitting it unmerged would
  // push "crowd level unknown" to every client twice a second — overwriting the
  // real value the status channel had just set.
  const ops = await getOps(bus.id);
  broadcastVehicle(
    {
      ...vehicle,
      delayMin: ops.delayMin ?? vehicle.delayMin,
      occupancy: ops.occupancy ?? vehicle.occupancy,
      status: ops.cancelled ? 'cancelled' : vehicle.status,
    },
    eta.predictions,
  );

  ingestStats.accepted++;
  return { accepted: true, busId: bus.id };
}

/* -------------------------------- helpers --------------------------------- */

async function persistHistory(
  busId: string,
  reading: AcceptedReading,
  match: { progressKm: number; matched: { lat: number; lng: number } },
): Promise<void> {
  await prisma.busLocation.create({
    data: {
      busId,
      tripId: reading.tripId,
      lat: reading.position.lat,
      lng: reading.position.lng,
      matchedLat: match.matched.lat,
      matchedLng: match.matched.lng,
      progressKm: match.progressKm,
      speedKmph: reading.speedKmph,
      heading: reading.heading,
      accuracyM: reading.accuracyM,
      recordedAt: reading.recordedAt,
      buffered: reading.buffered,
      source: 'mqtt',
    },
  });
}

/** Trip lookup is cached briefly — it changes far more slowly than positions. */
const tripCache = new Map<string, { trip: { id: string; delayMin: number } | null; at: number }>();
const TRIP_CACHE_MS = 15_000;

async function currentTrip(busId: string, routeId: string) {
  const hit = tripCache.get(busId);
  if (hit && Date.now() - hit.at < TRIP_CACHE_MS) return hit.trip;

  const found = await prisma.trip.findFirst({
    where: { busId, routeId, status: { in: ['scheduled', 'running', 'delayed', 'signal_lost'] } },
    select: { id: true, delayMin: true },
    orderBy: { createdAt: 'desc' },
  });

  tripCache.set(busId, { trip: found, at: Date.now() });
  return found;
}

export function invalidateTripCache(busId?: string): void {
  if (busId) tripCache.delete(busId);
  else tripCache.clear();
}

/**
 * Recompute ETAs for every live vehicle on the configured cadence (FR-11).
 *
 * This is what makes a bus in a dead zone visibly degrade: no new fix arrives,
 * so `ageSec` climbs, confidence falls, the estimate widens into a range and
 * eventually the timetable takes over — all without a single GPS packet.
 */
export async function refreshAllEtas(): Promise<number> {
  const live = await getAllLive();
  const now = Date.now();
  let updated = 0;

  for (const vehicle of live) {
    const route = network.route(vehicle.routeId);
    if (!route) continue;

    // A cancelled service has no arrivals to predict, and recomputing would
    // quietly promote it back to "running" on the next tick.
    if (vehicle.status === 'cancelled') {
      broadcastVehicle(vehicle, []);
      continue;
    }

    const ageSec = ageSecOf(vehicle, now);
    const eta = computeEta({
      route,
      progressKm: vehicle.progressKm,
      ageSec,
      delayMin: vehicle.delayMin,
    });

    const status = effectiveStatus(vehicle, now);
    const refreshed: LiveVehicle = { ...vehicle, status, nextStopIndex: eta.nextStopIndex };

    await setLive(refreshed);
    if (vehicle.tripId) {
      await cacheEta(vehicle.tripId, eta.predictions);
      await recordPrediction(vehicle.tripId, eta, ageSec);
    }

    broadcastVehicle(refreshed, eta.predictions);
    updated++;
  }

  return updated;
}

/**
 * Snapshot the next-stop prediction for later accuracy analysis.
 *
 * Only the next stop, and only on the refresh cadence rather than on every
 * position: that is the prediction you can actually score, by comparing it to
 * when the vehicle really arrived. Writing every stop on every fix would be tens
 * of thousands of rows an hour and answer no question the first one doesn't.
 */
async function recordPrediction(
  tripId: string,
  eta: { predictions: StopPrediction[]; fromTimetable: boolean },
  ageSec: number,
): Promise<void> {
  const next = eta.predictions[0];
  if (!next) return;

  try {
    await prisma.etaPrediction.create({
      data: {
        tripId,
        stopId: next.stopId,
        etaSeconds: Math.round(next.etaMin * 60),
        rangeLowSec: Math.round(next.rangeMin[0] * 60),
        rangeHighSec: Math.round(next.rangeMin[1] * 60),
        confidence: next.confidence,
        dataAgeSec: Math.round(ageSec),
        fromTimetable: eta.fromTimetable,
      },
    });
  } catch (err) {
    // Analytics must never break the live path.
    etaLog.debug({ err: err instanceof Error ? err.message : err }, 'prediction snapshot failed');
  }
}
