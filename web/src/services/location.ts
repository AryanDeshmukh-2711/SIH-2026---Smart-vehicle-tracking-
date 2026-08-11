/**
 * Smart location resolution — the core differentiator.
 *
 * In the hills GPS is routinely the *worst* available signal: valley walls
 * reflect it, dense deodar cover blocks it, and coverage gaps stop an
 * assisted-GPS fix from converging at all. So position is treated as something
 * with six independent sources, only one of which is GPS, and the app never
 * dead-ends when that one fails.
 */

import type { LatLng, LocationMethod, ResolvedLocation, Stop } from '@/types';
import { STOPS, STOP_BY_ID } from '@/data/stops';
import { haversineKm } from '@/lib/geo';
import { request } from './client';

export const METHOD_LABEL: Record<LocationMethod, string> = {
  gps: 'GPS',
  landmark: 'Landmark',
  'map-pin': 'Map pin',
  'stop-search': 'Bus stop',
  qr: 'QR at stop',
  'route-number': 'Route number',
};

export const METHOD_BLURB: Record<LocationMethod, string> = {
  gps: 'Satellite fix from your device. Fastest when it works, unreliable in valleys.',
  landmark: 'Name something near you — a temple, a bazaar, a hospital.',
  'map-pin': 'Drop a pin yourself. Always works, needs no signal at all.',
  'stop-search': 'Pick the stand you are standing at by name.',
  qr: 'Scan the plate at the stop. Identifies the stop exactly, no GPS involved.',
  'route-number': 'Track a bus by its number without saying where you are.',
};

/** Accuracy we can honestly claim for each method, in metres. */
const ACCURACY_M: Record<LocationMethod, number> = {
  gps: 45,
  landmark: 220,
  'map-pin': 30,
  'stop-search': 15,
  qr: 5,
  'route-number': 0,
};

/* --------------------------- method 1 — GPS ------------------------------- */

export type GpsFailure = 'denied' | 'unavailable' | 'timeout' | 'inaccurate';

export interface GpsResult {
  ok: boolean;
  location?: ResolvedLocation;
  failure?: GpsFailure;
}

/**
 * Browser geolocation with an accuracy floor. A fix that lands 800 m out is
 * worse than no fix, because it silently sends the user to the wrong stop —
 * so a poor fix is reported as a failure, not accepted quietly.
 */
export function resolveByGps(opts: { timeoutMs?: number; maxAccuracyM?: number } = {}): Promise<GpsResult> {
  const { timeoutMs = 8000, maxAccuracyM = 500 } = opts;

  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve({ ok: false, failure: 'unavailable' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (pos.coords.accuracy > maxAccuracyM) {
          resolve({ ok: false, failure: 'inaccurate' });
          return;
        }
        const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        resolve({
          ok: true,
          location: {
            method: 'gps',
            label: nearestStopLabel(position) ?? 'Current location',
            position,
            accuracyM: Math.round(pos.coords.accuracy),
            resolvedAt: new Date().toISOString(),
          },
        });
      },
      (err) => {
        const failure: GpsFailure =
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        resolve({ ok: false, failure });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

function nearestStopLabel(position: LatLng): string | null {
  const nearest = STOPS.map((s) => ({ s, km: haversineKm(position, s.position) })).sort(
    (a, b) => a.km - b.km,
  )[0];
  if (!nearest || nearest.km > 3) return null;
  return `Near ${nearest.s.name}`;
}

/* ------------------------- method 2 — landmark ---------------------------- */

export interface LandmarkMatch {
  landmark: string;
  stop: Stop;
  distanceKm: number;
}

/** Every landmark registered against a stop, searchable. */
export function searchLandmarks(query: string, limit = 6): LandmarkMatch[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const out: LandmarkMatch[] = [];
  for (const stop of STOPS) {
    for (const landmark of stop.landmarks) {
      if (landmark.toLowerCase().includes(q) || stop.town.toLowerCase().includes(q)) {
        out.push({ landmark, stop, distanceKm: 0.3 });
      }
    }
  }
  return out.slice(0, limit);
}

export function resolveByLandmark(match: LandmarkMatch): ResolvedLocation {
  return {
    method: 'landmark',
    label: `Near ${match.landmark}`,
    position: match.stop.position,
    accuracyM: ACCURACY_M.landmark,
    stopId: match.stop.id,
    resolvedAt: new Date().toISOString(),
  };
}

/* -------------------------- method 3 — map pin ---------------------------- */

export function resolveByPin(position: LatLng): ResolvedLocation {
  return {
    method: 'map-pin',
    label: nearestStopLabel(position) ?? 'Pinned location',
    position,
    accuracyM: ACCURACY_M['map-pin'],
    resolvedAt: new Date().toISOString(),
  };
}

/* ------------------------ method 4 — stop search -------------------------- */

export function resolveByStop(stopId: string): ResolvedLocation {
  const stop = STOP_BY_ID.get(stopId);
  if (!stop) throw new Error(`Stop ${stopId} not found`);
  return {
    method: 'stop-search',
    label: stop.name,
    position: stop.position,
    accuracyM: ACCURACY_M['stop-search'],
    stopId: stop.id,
    resolvedAt: new Date().toISOString(),
  };
}

/* ---------------------------- method 5 — QR ------------------------------- */

export interface QrScanResult {
  ok: boolean;
  stop?: Stop;
  location?: ResolvedLocation;
  error?: 'unrecognised' | 'damaged';
}

/**
 * A stop QR encodes `himgati://stop/HP-SML-001`. Plain stop ids are accepted too,
 * because the code is also printed as text underneath for anyone whose camera
 * cannot focus in poor light.
 */
export function resolveByQr(payload: string): Promise<QrScanResult> {
  return request('/v1/stops/resolve-qr', () => {
    const id = payload.trim().replace(/^himgati:\/\/stop\//i, '').toUpperCase();
    const stop = STOP_BY_ID.get(id) ?? STOPS.find((s) => s.smsCode === id);

    if (!stop) return { ok: false, error: 'unrecognised' as const };

    return {
      ok: true,
      stop,
      location: {
        method: 'qr' as const,
        label: stop.name,
        position: stop.position,
        accuracyM: ACCURACY_M.qr,
        stopId: stop.id,
        resolvedAt: new Date().toISOString(),
      },
    };
  });
}

/** Codes a demo can scan without a physical plate to point a camera at. */
export const DEMO_QR_CODES = [
  { id: 'HP-SML-001', label: 'Shimla ISBT, Tutikandi' },
  { id: 'HP-SML-002', label: 'Victory Tunnel' },
  { id: 'HP-MNL-001', label: 'Manali Bus Stand' },
  { id: 'HP-KFR-001', label: 'Kufri' },
];

/* ------------------------ method 6 — route number ------------------------- */

/**
 * No location at all. The user knows which bus they care about, so we skip the
 * question entirely — this is the method that works in a total signal blackout
 * as long as the bus itself reported before entering it.
 */
export function resolveByRouteNumber(routeOrRegistration: string): ResolvedLocation {
  return {
    method: 'route-number',
    label: routeOrRegistration.toUpperCase(),
    position: { lat: 0, lng: 0 },
    accuracyM: ACCURACY_M['route-number'],
    resolvedAt: new Date().toISOString(),
  };
}

/** Default used before the user resolves anything — Shimla ISBT. */
export const DEFAULT_LOCATION: ResolvedLocation = {
  method: 'stop-search',
  label: 'Shimla ISBT, Tutikandi',
  position: { lat: 31.0996, lng: 77.15 },
  accuracyM: 15,
  stopId: 'HP-SML-001',
  resolvedAt: new Date().toISOString(),
};
