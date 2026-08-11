/**
 * GPS cleaning.
 *
 * A tracker in the hills reports plenty of nonsense: reflected fixes off a
 * valley wall, a cold start that lands kilometres away, a clock that drifted.
 * Accepting those produces a bus icon that teleports, which destroys trust
 * faster than showing nothing at all. So every reading is checked before it is
 * allowed to become "where the bus is" (SRS FR-3).
 *
 * The one thing this must NOT do is reject a *late* reading. A device coming out
 * of a dead zone uploads its backlog at once; those fixes are old but perfectly
 * valid, and discarding them would throw away exactly the data needed to
 * reconstruct the path the bus actually took (SRS §8.5).
 */

import { haversineKm } from '@himgati/shared';
import type { LatLng } from '@himgati/shared';

export interface RawReading {
  busId: string;
  tripId?: string | null;
  lat: number;
  lng: number;
  speedKmph?: number;
  heading?: number;
  accuracyM?: number;
  /** Device clock, epoch seconds or ms, or an ISO string. */
  timestamp: number | string;
}

export interface AcceptedReading {
  busId: string;
  tripId: string | null;
  position: LatLng;
  speedKmph: number;
  heading: number;
  accuracyM: number;
  recordedAt: Date;
  /** True when this fix predates the last accepted one — a dead-zone backlog upload. */
  buffered: boolean;
}

export type RejectReason =
  | 'malformed'
  | 'bad-coordinates'
  | 'future-timestamp'
  | 'poor-accuracy'
  | 'impossible-speed'
  | 'duplicate';

export type ValidationResult =
  | { ok: true; reading: AcceptedReading }
  | { ok: false; reason: RejectReason; detail?: string };

export interface ValidationContext {
  /** The last accepted fix for this vehicle, if any. */
  previous?: { position: LatLng; recordedAt: Date } | null;
  maxSpeedKmph: number;
  /** Fixes less precise than this are not trustworthy enough to move an icon. */
  maxAccuracyM?: number;
  /**
   * Longest gap over which a speed check is still meaningful, seconds.
   *
   * Past this the vehicle has genuinely been unobserved — it crossed a dead
   * zone — and a large jump is exactly what we expect rather than evidence of a
   * bad fix. Without this bound the first reading after a twenty-minute coverage
   * gap gets rejected for implying an impossible speed, which would make
   * recovery from a dead zone impossible: the vehicle could never re-acquire,
   * because every later fix would be compared against an ever-staler position.
   */
  maxGapSec?: number;
}

/** Himachal Pradesh, generously bounded. Catches swapped lat/lng and null islands. */
const HP_BOUNDS = { minLat: 29.5, maxLat: 34.0, minLng: 74.5, maxLng: 80.0 };

function parseTimestamp(value: number | string): Date | null {
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Devices report seconds; anything this large is already milliseconds.
  const ms = value > 1e12 ? value : value * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateReading(
  raw: RawReading,
  ctx: ValidationContext,
): ValidationResult {
  if (!raw?.busId || typeof raw.lat !== 'number' || typeof raw.lng !== 'number') {
    return { ok: false, reason: 'malformed' };
  }

  if (
    !Number.isFinite(raw.lat) ||
    !Number.isFinite(raw.lng) ||
    raw.lat < HP_BOUNDS.minLat ||
    raw.lat > HP_BOUNDS.maxLat ||
    raw.lng < HP_BOUNDS.minLng ||
    raw.lng > HP_BOUNDS.maxLng
  ) {
    return { ok: false, reason: 'bad-coordinates', detail: `${raw.lat},${raw.lng}` };
  }

  const recordedAt = parseTimestamp(raw.timestamp);
  if (!recordedAt) return { ok: false, reason: 'malformed', detail: 'unparseable timestamp' };

  // A small skew is normal; a fix from the future means a broken device clock.
  if (recordedAt.getTime() > Date.now() + 60_000) {
    return { ok: false, reason: 'future-timestamp', detail: recordedAt.toISOString() };
  }

  const accuracyM = raw.accuracyM ?? 10;
  if (ctx.maxAccuracyM && accuracyM > ctx.maxAccuracyM) {
    return { ok: false, reason: 'poor-accuracy', detail: `${accuracyM}m` };
  }

  const position: LatLng = { lat: raw.lat, lng: raw.lng };
  let buffered = false;

  if (ctx.previous) {
    const deltaSec = (recordedAt.getTime() - ctx.previous.recordedAt.getTime()) / 1000;

    if (deltaSec === 0) return { ok: false, reason: 'duplicate' };

    if (deltaSec < 0) {
      // Older than what we already have: a backlog upload, not an error.
      buffered = true;
    } else {
      const km = haversineKm(ctx.previous.position, position);
      const impliedKmph = (km / deltaSec) * 3600;
      const withinWindow = deltaSec >= 5 && deltaSec <= (ctx.maxGapSec ?? Infinity);

      // Only meaningful over a real, continuous interval. Two fixes a second
      // apart with a few metres of GPS jitter imply an absurd speed, and a fix
      // arriving after a coverage gap legitimately jumps a long way.
      if (withinWindow && impliedKmph > ctx.maxSpeedKmph) {
        return {
          ok: false,
          reason: 'impossible-speed',
          detail: `${Math.round(impliedKmph)}km/h over ${Math.round(deltaSec)}s`,
        };
      }
    }
  }

  return {
    ok: true,
    reading: {
      busId: raw.busId,
      tripId: raw.tripId ?? null,
      position,
      speedKmph: Math.max(0, raw.speedKmph ?? 0),
      heading: raw.heading ?? 0,
      accuracyM,
      recordedAt,
      buffered,
    },
  };
}
