/**
 * Authentication endpoints.
 *
 * Three ways in, matching who is actually signing in:
 *   • passengers  — phone + OTP, because a shared family handset should not
 *                   carry a saved password
 *   • drivers     — employee id + OTP (FR-34), so the cab needs no keyboard
 *   • desk staff  — username + password, for people at a terminal all day
 *
 * Refresh tokens rotate on every use and are returned in the body rather than a
 * cookie, since the driver and admin surfaces are separate origins.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { UserRole } from '@prisma/client';
import { prisma } from '../db/prisma.ts';
import { logger } from '../config/logger.ts';
import { requestOtp, verifyOtp } from '../services/auth/otp.ts';
import { verifyPassword } from '../services/auth/password.ts';
import {
  consumeRefreshToken,
  issueRefreshToken,
  markRotated,
  revokeAllForUser,
  revokeRefreshToken,
  signAccessToken,
} from '../services/auth/tokens.ts';
import { requireAuth } from './middleware/auth.ts';
import { authLimit } from './middleware/rateLimit.ts';
import { recordAudit } from '../services/audit.ts';

export const auth = Router();

const log = logger.child({ module: 'auth' });

const ok = <T>(data: T) => ({ data, error: null });
const fail = (message: string) => ({ data: null, error: { message } });

/** Public shape of a signed-in user. Never includes the password hash. */
function publicUser(u: { id: string; name: string; phone: string; role: UserRole; depot: string | null }) {
  return { id: u.id, name: u.name, phone: maskPhone(u.phone), role: u.role, depot: u.depot };
}

/** Phone numbers are shown back masked — enough to recognise, not to harvest. */
function maskPhone(phone: string): string {
  return phone.length <= 4 ? phone : `${phone.slice(0, 3)}••••${phone.slice(-3)}`;
}

async function issueSession(
  user: { id: string; name: string; phone: string; role: UserRole; depot: string | null },
  userAgent?: string,
) {
  const [accessToken, refresh] = await Promise.all([
    signAccessToken(user),
    issueRefreshToken(user.id, userAgent),
  ]);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    user: publicUser(user),
  };
}

/* ------------------------------- request OTP ------------------------------ */

const requestSchema = z.object({
  /** A phone number for a passenger, or an employee id for a driver. */
  identifier: z.string().trim().min(3).max(40),
});

auth.post('/otp/request', authLimit, async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));

  const identifier = parsed.data.identifier.toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ phone: parsed.data.identifier }, { employeeId: parsed.data.identifier }],
    },
    select: { id: true, active: true },
  });

  // Deliberately the same response whether or not the account exists. Differing
  // here would turn this endpoint into a way to enumerate which phone numbers
  // and employee ids are registered.
  const result = await requestOtp(identifier);

  if (!result.ok) {
    res.setHeader('Retry-After', String(result.retryAfterSec));
    return res.status(429).json(fail('too many codes requested — try again shortly'));
  }

  if (!user || !user.active) {
    log.info({ identifier }, 'otp requested for unknown or inactive account');
  }

  return res.json(
    ok({
      sent: true,
      expiresInSec: result.expiresInSec,
      // Development only — the gateway would deliver this by SMS.
      devCode: result.devCode,
    }),
  );
});

/* -------------------------------- verify OTP ------------------------------ */

const verifySchema = z.object({
  identifier: z.string().trim().min(3).max(40),
  code: z.string().trim().regex(/^\d{6}$/, 'code must be six digits'),
});

auth.post('/otp/verify', authLimit, async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));

  const { identifier, code } = parsed.data;
  const result = await verifyOtp(identifier.toLowerCase(), code);

  if (!result.ok) {
    const message =
      result.reason === 'expired'
        ? 'that code has expired — request a new one'
        : result.reason === 'too-many-attempts'
          ? 'too many incorrect attempts — request a new code'
          : 'incorrect code';
    return res.status(401).json(fail(message));
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ phone: identifier }, { employeeId: identifier }] },
    select: { id: true, name: true, phone: true, role: true, depot: true, active: true },
  });

  if (!user) return res.status(404).json(fail('no account found for that number'));
  if (!user.active) return res.status(403).json(fail('this account has been deactivated'));

  const session = await issueSession(user, req.headers['user-agent']);
  await recordAudit({ actorId: user.id, actorRole: user.role, action: 'auth.login.otp', entity: 'user', entityId: user.id, ip: req.ip });

  return res.json(ok(session));
});

/* --------------------------------- password ------------------------------- */

const passwordSchema = z.object({
  identifier: z.string().trim().min(3).max(60),
  password: z.string().min(1).max(200),
});

auth.post('/login', authLimit, async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));

  const { identifier, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ phone: identifier }, { employeeId: identifier }] },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      depot: true,
      active: true,
      passwordHash: true,
    },
  });

  // Same message and roughly the same work either way, so a wrong username and
  // a wrong password are indistinguishable from the outside.
  const valid = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

  if (!user || !valid) return res.status(401).json(fail('incorrect username or password'));
  if (!user.active) return res.status(403).json(fail('this account has been deactivated'));

  const session = await issueSession(user, req.headers['user-agent']);
  await recordAudit({ actorId: user.id, actorRole: user.role, action: 'auth.login.password', entity: 'user', entityId: user.id, ip: req.ip });

  return res.json(ok(session));
});

/* --------------------------------- refresh -------------------------------- */

const refreshSchema = z.object({ refreshToken: z.string().min(20) });

auth.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));

  const presented = parsed.data.refreshToken;
  const outcome = await consumeRefreshToken(presented);

  if (!outcome.ok) {
    if (outcome.reason === 'reused') {
      // Every session for that user has just been revoked; say so plainly
      // rather than quietly handing back a 401 they cannot act on.
      log.warn('refresh token reuse detected — all sessions revoked');
      return res.status(401).json(fail('session revoked for security — please sign in again'));
    }
    return res.status(401).json(fail('please sign in again'));
  }

  const user = await prisma.user.findUnique({
    where: { id: outcome.userId },
    select: { id: true, name: true, phone: true, role: true, depot: true, active: true },
  });

  if (!user?.active) return res.status(403).json(fail('this account has been deactivated'));

  const session = await issueSession(user, req.headers['user-agent']);
  await markRotated(presented, session.refreshToken);

  return res.json(ok(session));
});

/* --------------------------------- session -------------------------------- */

auth.post('/logout', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (parsed.success) await revokeRefreshToken(parsed.data.refreshToken);
  // Always 204: logging out must never fail in a way that leaves someone stuck.
  return res.status(204).end();
});

auth.post('/logout-all', requireAuth, async (req, res) => {
  const revoked = await revokeAllForUser(req.user!.id);
  await recordAudit({ actorId: req.user!.id, actorRole: req.user!.role, action: 'auth.logout.all', entity: 'user', entityId: req.user!.id, ip: req.ip });
  return res.json(ok({ revoked }));
});

auth.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, phone: true, role: true, depot: true, lastLoginAt: true },
  });

  if (!user) return res.status(404).json(fail('account not found'));

  return res.json(
    ok({
      ...publicUser(user),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    }),
  );
});
