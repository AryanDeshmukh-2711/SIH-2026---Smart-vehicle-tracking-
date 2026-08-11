import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { UserRole } from '@prisma/client';
import { env } from '../../config/env.ts';
import { prisma } from '../../db/prisma.ts';

/**
 * Session tokens.
 *
 * A short-lived access JWT carries the identity and role on every request, so
 * the API stays stateless on the hot path. A long-lived refresh token is stored
 * hashed and rotated on every use, so a session can be revoked and a stolen
 * token can be detected.
 */

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'himgati';
const AUDIENCE = 'himgati-api';

export interface AccessClaims extends JWTPayload {
  sub: string;
  role: UserRole;
  name: string;
}

export async function signAccessToken(user: {
  id: string;
  role: UserRole;
  name: string;
}): Promise<string> {
  return new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub) return null;
    return payload as AccessClaims;
  } catch {
    // Expired, tampered with, or signed by something else — all the same answer.
    return null;
  }
}

/* ------------------------------ refresh tokens ---------------------------- */

/** Only the hash is stored, so a database dump yields nothing replayable. */
function fingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssuedRefresh {
  token: string;
  expiresAt: Date;
}

export async function issueRefreshToken(
  userId: string,
  userAgent?: string,
): Promise<IssuedRefresh> {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);

  await prisma.refreshToken.create({
    data: { userId, tokenHash: fingerprint(token), expiresAt, userAgent: userAgent?.slice(0, 200) },
  });

  return { token, expiresAt };
}

export type RefreshOutcome =
  | { ok: true; userId: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'revoked' | 'reused' };

/**
 * Consume a refresh token, rotating it.
 *
 * If a token that has already been rotated is presented again, it was captured:
 * the legitimate client would be holding its successor. Rather than just
 * refusing, every live session for that user is revoked, because we cannot tell
 * which party is the thief.
 */
export async function consumeRefreshToken(token: string): Promise<RefreshOutcome> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: fingerprint(token) },
  });

  if (!record) return { ok: false, reason: 'unknown' };

  if (record.replacedBy) {
    await revokeAllForUser(record.userId);
    return { ok: false, reason: 'reused' };
  }

  if (record.revokedAt) return { ok: false, reason: 'revoked' };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };

  return { ok: true, userId: record.userId };
}

/** Mark a token as rotated into its successor. */
export async function markRotated(oldToken: string, newToken: string): Promise<void> {
  await prisma.refreshToken.update({
    where: { tokenHash: fingerprint(oldToken) },
    data: { replacedBy: fingerprint(newToken), revokedAt: new Date() },
  });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken
    .update({ where: { tokenHash: fingerprint(token) }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

export async function revokeAllForUser(userId: string): Promise<number> {
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}

/** Housekeeping — expired rows serve no purpose once past their date. */
export async function purgeExpiredTokens(): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
