import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import { redis } from '../../db/redis.ts';

/**
 * Redis-backed rate limiting.
 *
 * In Redis rather than in memory because the counter has to hold across the
 * multiple API instances the SRS's 100,000-concurrent-user target implies —
 * a per-process limiter is trivially defeated by hitting a different node.
 *
 * Fails open. If Redis is unavailable the API keeps serving: a passenger
 * standing at a stop in the rain should not be refused an arrival time because
 * the cache is down.
 */

const log = logger.child({ module: 'ratelimit' });

export interface RateLimitOptions {
  /** Requests allowed per window. */
  max: number;
  windowSec: number;
  /** Bucket name, so different routes do not share a counter. */
  bucket: string;
  /** Defaults to the caller's IP. */
  keyOf?: (req: Request) => string;
}

export function rateLimit(options: RateLimitOptions) {
  const { max, windowSec, bucket, keyOf } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identity = keyOf?.(req) ?? req.ip ?? 'unknown';
    const key = `rl:${bucket}:${identity}`;

    try {
      const hits = await redis.incr(key);
      if (hits === 1) await redis.expire(key, windowSec);

      const ttl = hits > max ? await redis.ttl(key) : windowSec;

      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - hits)));

      if (hits > max) {
        res.setHeader('Retry-After', String(Math.max(1, ttl)));
        log.warn({ bucket, identity, hits }, 'rate limit exceeded');
        res.status(429).json({
          data: null,
          error: { message: 'too many requests — slow down and try again shortly' },
        });
        return;
      }
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : err }, 'rate limiter unavailable');
    }

    next();
  };
}

/** Broad limit applied to the whole API. */
export const generalLimit = rateLimit({
  bucket: 'api',
  max: env.RATE_LIMIT_MAX,
  windowSec: env.RATE_LIMIT_WINDOW_SEC,
});

/**
 * Tight limit on credential endpoints, keyed on the identifier being attacked
 * rather than the source IP — an attacker rotating through a proxy pool would
 * sail past an IP-keyed limit while still hammering one account.
 */
export const authLimit = rateLimit({
  bucket: 'auth',
  max: 10,
  windowSec: 300,
  keyOf: (req) => {
    const body = req.body as { identifier?: string; phone?: string; employeeId?: string };
    return (body?.identifier ?? body?.phone ?? body?.employeeId ?? req.ip ?? 'unknown')
      .toString()
      .toLowerCase();
  },
});
