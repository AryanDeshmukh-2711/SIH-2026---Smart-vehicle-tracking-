import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import { redis } from '../../db/redis.ts';

/**
 * One-time passcodes.
 *
 * The primary way people sign in, because it needs no password on a shared
 * family phone and works for a driver who only ever taps "Start Trip" (FR-34).
 *
 * The code is stored hashed with a short TTL, attempts are capped so a six-digit
 * code cannot be brute-forced inside its lifetime, and requests are rate limited
 * per identifier — an unthrottled OTP endpoint is an SMS bill someone else pays.
 */

const log = logger.child({ module: 'otp' });

const key = {
  code: (id: string) => `otp:${id}`,
  attempts: (id: string) => `otp:${id}:attempts`,
  sendRate: (id: string) => `otp:${id}:sent`,
};

/** Wrong guesses allowed before the code is burned. */
const MAX_ATTEMPTS = 5;

export type RequestOutcome =
  | { ok: true; expiresInSec: number; devCode?: string }
  | { ok: false; reason: 'rate-limited'; retryAfterSec: number };

function digest(identifier: string, code: string): string {
  // Salted with the identifier so the same code for two people hashes differently.
  return createHash('sha256').update(`${identifier}:${code}`).digest('hex');
}

/**
 * Issue a code for an identifier (a phone number, or a driver's employee id).
 *
 * In development the code is returned in the response so the flow can be
 * exercised without an SMS gateway. That is gated on NODE_ENV — returning it in
 * production would make the whole mechanism decorative.
 */
export async function requestOtp(identifier: string): Promise<RequestOutcome> {
  const sentKey = key.sendRate(identifier);
  const sent = await redis.incr(sentKey);

  if (sent === 1) {
    await redis.expire(sentKey, env.OTP_REQUEST_WINDOW_SEC);
  }

  if (sent > env.OTP_MAX_REQUESTS) {
    const ttl = await redis.ttl(sentKey);
    log.warn({ identifier }, 'otp request rate limited');
    return { ok: false, reason: 'rate-limited', retryAfterSec: Math.max(1, ttl) };
  }

  // randomInt is CSPRNG-backed; Math.random would make codes guessable.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

  await redis
    .multi()
    .set(key.code(identifier), digest(identifier, code), 'EX', env.OTP_TTL_SEC)
    .del(key.attempts(identifier))
    .exec();

  // A real deployment hands this to the SMS gateway here.
  log.info({ identifier, ttl: env.OTP_TTL_SEC }, 'otp issued');

  return {
    ok: true,
    expiresInSec: env.OTP_TTL_SEC,
    devCode: env.NODE_ENV === 'production' ? undefined : code,
  };
}

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'incorrect' | 'too-many-attempts' };

export async function verifyOtp(identifier: string, code: string): Promise<VerifyOutcome> {
  const stored = await redis.get(key.code(identifier));
  if (!stored) return { ok: false, reason: 'expired' };

  const attempts = await redis.incr(key.attempts(identifier));
  await redis.expire(key.attempts(identifier), env.OTP_TTL_SEC);

  if (attempts > MAX_ATTEMPTS) {
    // Burn the code rather than let the attacker keep guessing at it.
    await redis.del(key.code(identifier), key.attempts(identifier));
    log.warn({ identifier }, 'otp burned after too many attempts');
    return { ok: false, reason: 'too-many-attempts' };
  }

  const expected = Buffer.from(stored, 'utf8');
  const actual = Buffer.from(digest(identifier, code.trim()), 'utf8');

  // Constant-time: a length check first, because timingSafeEqual throws on
  // mismatched lengths and that throw would itself leak.
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!matches) return { ok: false, reason: 'incorrect' };

  // Single use.
  await redis.del(key.code(identifier), key.attempts(identifier));
  return { ok: true };
}

/** Used by tests and by the logout path to clear pending state. */
export async function clearOtp(identifier: string): Promise<void> {
  await redis.del(key.code(identifier), key.attempts(identifier), key.sendRate(identifier));
}
