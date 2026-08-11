import Redis from 'ioredis';
import { env } from '../config/env.ts';
import { logger } from '../config/logger.ts';

/**
 * Redis holds live vehicle state and the ETA cache.
 *
 * Nothing here is a system of record — every key can be rebuilt from the GPS
 * feed and the database, which is why persistence is disabled on the container.
 * A separate subscriber connection is required because a client in subscribe
 * mode cannot issue normal commands.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const redisSubscriber = redis.duplicate();

redis.on('error', (err) => logger.error({ err: err.message }, 'redis error'));

export async function connectRedis(): Promise<void> {
  await redis.connect();
  await redisSubscriber.connect();
  logger.info('redis connected');
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
  redisSubscriber.disconnect();
}

/* --------------------------------- keys ----------------------------------- */

export const keys = {
  /** Latest accepted fix for a vehicle. Written by the GPS pipeline only. */
  busLive: (busId: string) => `bus:${busId}:live`,
  /**
   * Operator-reported delay, crowd level and cancellation.
   *
   * Kept in its own key because it has a different writer to the position feed.
   * When both wrote the same record, a GPS handler that had already read the
   * vehicle would write its stale copy back over an occupancy the status
   * handler had just set — a classic lost update, and the reason crowd level
   * silently stayed "unknown" forever.
   */
  busOps: (busId: string) => `bus:${busId}:ops`,
  /** Set of vehicle ids currently reporting. */
  activeBuses: 'buses:active',
  /** Cached predictions for a trip, hash keyed by stop id. */
  tripEta: (tripId: string) => `trip:${tripId}:eta`,
  /** Per-route index of live vehicles, for the map and route screens. */
  routeBuses: (routeId: string) => `route:${routeId}:buses`,
  /** Geo index of live vehicles, for "buses near me" without scanning the fleet. */
  busGeo: 'buses:geo',
} as const;

/** Live state is disposable; expire it so a stopped vehicle disappears cleanly. */
export const LIVE_TTL_SEC = 60 * 60;
