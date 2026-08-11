import type { LatLng } from './types';

const R_EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(h));
}

export function bearing(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Cumulative distance (km) at each vertex of a polyline. */
export function cumulativeDistances(shape: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < shape.length; i++) {
    out.push(out[i - 1] + haversineKm(shape[i - 1], shape[i]));
  }
  return out;
}

export function polylineLengthKm(shape: LatLng[]): number {
  const cum = cumulativeDistances(shape);
  return cum[cum.length - 1];
}

export interface PointOnLine {
  position: LatLng;
  bearing: number;
  segmentIndex: number;
}

/**
 * Walk `distanceKm` along a polyline and return the position plus the heading of
 * the segment it landed on. This is what makes a bus marker follow the road
 * instead of sliding in a straight line between stops.
 */
export function pointAlong(shape: LatLng[], cum: number[], distanceKm: number): PointOnLine {
  const total = cum[cum.length - 1];
  const d = Math.min(Math.max(distanceKm, 0), total);

  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;

  const segStart = shape[i - 1];
  const segEnd = shape[i];
  const segLen = cum[i] - cum[i - 1];
  const t = segLen === 0 ? 0 : (d - cum[i - 1]) / segLen;

  return {
    position: lerpLatLng(segStart, segEnd, t),
    bearing: bearing(segStart, segEnd),
    segmentIndex: i - 1,
  };
}

/**
 * Snap a raw GPS fix to the nearest point on the route shape (SRS FR-4 /
 * "map-matching" in the glossary). Real map-matching is a Viterbi decode over
 * candidate road segments; this is the single-point projection that the same
 * UI would consume.
 */
export function snapToShape(shape: LatLng[], fix: LatLng): { position: LatLng; offsetM: number } {
  let best = shape[0];
  let bestKm = Infinity;

  for (let i = 1; i < shape.length; i++) {
    const a = shape[i - 1];
    const b = shape[i];
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((fix.lng - a.lng) * dx + (fix.lat - a.lat) * dy) / lenSq));
    const cand = { lat: a.lat + dy * t, lng: a.lng + dx * t };
    const km = haversineKm(fix, cand);
    if (km < bestKm) {
      bestKm = km;
      best = cand;
    }
  }

  return { position: best, offsetM: Math.round(bestKm * 1000) };
}

/** Bounding box of a set of points, padded by `padDeg`. */
export function boundsOf(points: LatLng[], padDeg = 0.01): [[number, number], [number, number]] {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [
    [Math.min(...lats) - padDeg, Math.min(...lngs) - padDeg],
    [Math.max(...lats) + padDeg, Math.max(...lngs) + padDeg],
  ];
}

/** Rough walking time at 4.5 km/h, the figure used for all "x min walk" copy. */
export const WALK_SPEED_KMPH = 4.5;

export function walkMinutes(km: number): number {
  return Math.max(1, Math.round((km / WALK_SPEED_KMPH) * 60));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
