import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { verifyAccessToken } from '../../services/auth/tokens.ts';

/**
 * Authentication and role gates.
 *
 * A deliberate decision runs through this file: **transit data stays public.**
 * Where the buses are, when they arrive, which stops exist and what the fares
 * are — none of it is behind a login. It is public information, the SRS targets
 * people reaching this service by SMS and IVR precisely because they cannot or
 * will not install an app, and putting a signup wall in front of a bus timetable
 * would defeat the point of building it.
 *
 * Authentication guards *writing* and *privileged reading*: driver operations,
 * depot and admin tooling, and anything tied to an individual.
 */

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

const unauthorized = (res: Response, message = 'authentication required') =>
  res.status(401).json({ data: null, error: { message } });

/**
 * Attaches the caller if a valid token is present, but never rejects.
 *
 * Used on public routes that behave slightly differently when they know who is
 * asking — without ever demanding that they say.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearer(req);
  if (token) {
    const claims = await verifyAccessToken(token);
    if (claims) req.user = { id: claims.sub, role: claims.role, name: claims.name };
  }
  next();
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearer(req);
  if (!token) {
    unauthorized(res);
    return;
  }

  const claims = await verifyAccessToken(token);
  if (!claims) {
    unauthorized(res, 'session expired or invalid');
    return;
  }

  req.user = { id: claims.sub, role: claims.role, name: claims.name };
  next();
}

/**
 * Restrict a route to specific roles.
 *
 * Returns 403 rather than 404 when the caller is authenticated but lacks the
 * role: they are a known user being told plainly that this is not theirs, which
 * is more useful than pretending the endpoint does not exist.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      unauthorized(res);
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        data: null,
        error: { message: 'your account does not have access to this' },
      });
      return;
    }

    next();
  };
}

/** Anyone who can act on behalf of an operator. */
export const STAFF_ROLES: UserRole[] = [
  'driver',
  'depot_manager',
  'admin',
  'transport_authority',
];

/** Anyone who can change network configuration or publish disruptions. */
export const ADMIN_ROLES: UserRole[] = ['depot_manager', 'admin', 'transport_authority'];
