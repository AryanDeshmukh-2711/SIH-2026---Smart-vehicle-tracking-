/**
 * Live vehicle state, in Redis.
 *
 * The SRS is explicit that live positions belong in fast memory while history
 * goes to Postgres. This module owns that boundary. Nothing here is a system of
 * record: every key is rebuildable from the GPS feed, which is why the container
 * runs with persistence disabled.
 */

import type { Occupancy, StopPrediction, TripStatus } from '@himgati/shared';
import { SIGNAL_LOST_AFTER_SEC } from '@himgati/shared';
import { keys, LIVE_TTL_SEC, redis } from '../db/redis.ts';

export interface LiveVehicle {
  busId: string;
  tripId: string | null;
  routeId: string;
  /** Raw reported fix. */
  lat: number;
  lng: number;
  /** Fix snapped to the road alignment — what the client should draw. */
  matchedLat: number;
  matchedLng: number;
  bearing: number;
  speedKmph: number;
  /** Distance travelled along the route, km. */
  progressKm: number;
  /** Index into the route's stop list. */
  nextStopIndex: number;
  /** Device clock at the moment of the fix. Everything about trust hangs off this. */
  recordedAt: string;
  /** Server clock when the reading was accepted. */
  receivedAt: string;
  status: TripStatus;
  delayMin: number;
  occupancy: Occupancy;
  /** Name of the last stop confirmed passed, shown while a vehicle is silent. */
  lastSeenStopName: string | null;
}

/** A live record plus its derived freshness — the shape the API returns. */
export interface LiveVehicleView extends LiveVehicle {
  /** Seconds since the fix was recorded, computed at read time. */
  ageSec: number;
  predictions: StopPrediction[];
}

export async function setLive(v: LiveVehicle): Promise<void> {
  const pipeline = redis.multi();
  pipeline.set(keys.busLive(v.busId), JSON.stringify(v), 'EX', LIVE_TTL_SEC);
  pipeline.sadd(keys.activeBuses, v.busId);
  pipeline.sadd(keys.routeBuses(v.routeId), v.busId);
  // Geo index so "buses near me" is a radius query rather than a fleet scan.
  pipeline.geoadd(keys.busGeo, v.matchedLng, v.matchedLat, v.busId);
  await pipeline.exec();
}

export async function getLive(busId: string): Promise<LiveVehicle | null> {
  const raw = await redis.get(keys.busLive(busId));
  return raw ? (JSON.parse(raw) as LiveVehicle) : null;
}

export async function getLiveMany(busIds: string[]): Promise<LiveVehicle[]> {
  if (busIds.length === 0) return [];
  const raws = await redis.mget(busIds.map(keys.busLive));
  return raws
    .filter((r): r is string => Boolean(r))
    .map((r) => JSON.parse(r) as LiveVehicle);
}

export async function getAllLive(): Promise<LiveVehicle[]> {
  const ids = await redis.smembers(keys.activeBuses);
  const live = await getLiveMany(ids);

  // Ids whose payload expired are stale set members; drop them so the active
  // set does not grow unbounded with vehicles that stopped reporting hours ago.
  if (live.length !== ids.length) {
    const alive = new Set(live.map((v) => v.busId));
    const dead = ids.filter((id) => !alive.has(id));
    if (dead.length) await redis.srem(keys.activeBuses, ...dead);
  }

  return live;
}

export async function getRouteLive(routeId: string): Promise<LiveVehicle[]> {
  const ids = await redis.smembers(keys.routeBuses(routeId));
  return getLiveMany(ids);
}

/** Live vehicles within a radius, using the Redis geo index. */
export async function getLiveNear(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<LiveVehicle[]> {
  const ids = (await redis.georadius(keys.busGeo, lng, lat, radiusM, 'm', 'ASC')) as string[];
  return getLiveMany(ids);
}

export function ageSecOf(v: LiveVehicle, now = Date.now()): number {
  return Math.max(0, (now - new Date(v.recordedAt).getTime()) / 1000);
}

/**
 * A vehicle that has not reported for longer than the threshold is Signal Lost
 * (FR-5) — regardless of what status was last written. Deriving this at read
 * time rather than storing it means a crashed ingestion process cannot leave a
 * stale "on time" badge on screen.
 */
export function effectiveStatus(v: LiveVehicle, now = Date.now()): TripStatus {
  if (v.status === 'cancelled' || v.status === 'ended' || v.status === 'scheduled') return v.status;
  if (ageSecOf(v, now) >= SIGNAL_LOST_AFTER_SEC) return 'signal-lost';
  if (v.delayMin >= 5) return 'delayed';
  return 'running';
}

export async function clearLive(busId: string, routeId: string): Promise<void> {
  const pipeline = redis.multi();
  pipeline.del(keys.busLive(busId));
  pipeline.srem(keys.activeBuses, busId);
  pipeline.srem(keys.routeBuses(routeId), busId);
  pipeline.zrem(keys.busGeo, busId);
  await pipeline.exec();
}

/* ------------------------------- ETA cache -------------------------------- */

export async function cacheEta(tripId: string, predictions: StopPrediction[]): Promise<void> {
  await redis.set(keys.tripEta(tripId), JSON.stringify(predictions), 'EX', 300);
}

export async function getCachedEta(tripId: string): Promise<StopPrediction[] | null> {
  const raw = await redis.get(keys.tripEta(tripId));
  return raw ? (JSON.parse(raw) as StopPrediction[]) : null;
}
