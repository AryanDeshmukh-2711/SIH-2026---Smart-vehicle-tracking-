/**
 * Road congestion model.
 *
 * Without this the simulator moves every vehicle at a constant fraction of its
 * scheduled duration, so an ETA only ever counts down — smoothly, predictably,
 * and quite unlike any bus in Himachal. Nothing ever slows down, so nothing ever
 * recovers either, and the confidence marks the whole app is built around have
 * nothing to actually be uncertain *about*.
 *
 * Congestion here is a **speed multiplier**: 1.0 is the scheduled running speed,
 * below 1 is slower than timetable, above 1 is a clear road. It is deterministic
 * — a function of route, position and clock — so two observers of the same bus at
 * the same moment always agree, and a reload does not reshuffle the network.
 *
 * Three components combine:
 *   • Bottlenecks — fixed stretches that are genuinely slow (single-lane sections,
 *     bazaar crossings, tunnel approaches). These are the named ones.
 *   • Time of day — the morning and evening peaks on the real wall clock.
 *   • Drift — smooth pseudo-random variation so conditions build and clear
 *     instead of sitting at a constant offset.
 */

/** Speed multipliers are clamped to this range; a bus never stops dead or flies. */
const MIN_MULTIPLIER = 0.45;
const MAX_MULTIPLIER = 1.25;

export interface Bottleneck {
  /** Road distance along the route, km. */
  fromKm: number;
  toKm: number;
  /** Worst-case speed multiplier at the centre of the stretch. */
  severity: number;
  /** Shown to the passenger when this is what is slowing their bus. */
  label: string;
}

/**
 * Known slow stretches, by route.
 *
 * These are the places the app can name a reason for, which is the difference
 * between "your bus is 6 minutes later than a minute ago" and "single-lane
 * traffic near Kufri". The Kufri entry lines up with the seeded service alert.
 */
const BOTTLENECKS: Record<string, Bottleneck[]> = {
  'R-42B': [
    { fromKm: 60, toKm: 78, severity: 0.62, label: 'Bilaspur town crossing' },
    // Deliberately ends at the mouth of the 138–154 km dead zone rather than
    // spanning it. Overlapping the two put the bus through 16 km of no-coverage
    // at 15 km/h, which held it in Signal Lost for the better part of an hour of
    // simulated time — long past the point anyone would wait to watch it recover,
    // and long enough to fall through to the timetable instead.
    { fromKm: 124, toKm: 138, severity: 0.55, label: 'Pandoh landslide zone' },
    { fromKm: 186, toKm: 196, severity: 0.68, label: 'Bhuntar airport junction' },
  ],
  'R-18A': [
    { fromKm: 26, toKm: 34, severity: 0.6, label: 'Kandaghat bazaar' },
    { fromKm: 46, toKm: 54, severity: 0.66, label: 'Solan bypass' },
  ],
  'R-07L': [
    { fromKm: 1.5, toKm: 5, severity: 0.5, label: 'Victory Tunnel approach' },
    { fromKm: 18, toKm: 24, severity: 0.55, label: 'single-lane traffic near Kufri' },
  ],
  'R-22C': [{ fromKm: 24, toKm: 30, severity: 0.64, label: 'Kandaghat junction' }],
  'R-55D': [
    { fromKm: 60, toKm: 80, severity: 0.62, label: 'Bilaspur town crossing' },
    { fromKm: 205, toKm: 220, severity: 0.7, label: 'Palampur tea-estate road' },
  ],
  'R-64K': [{ fromKm: 6, toKm: 14, severity: 0.58, label: 'Bhuntar market' }],
  'R-31M': [{ fromKm: 3, toKm: 7, severity: 0.6, label: 'Old Manali turning' }],
  'R-12S': [
    { fromKm: 2.5, toKm: 4.5, severity: 0.45, label: 'Mall Road congestion' },
    { fromKm: 6, toKm: 8, severity: 0.55, label: 'Sanjauli chowk' },
  ],
};

/** Smooth deterministic noise in [0,1] — three incommensurable sines. */
function drift(seed: number, t: number): number {
  const a = Math.sin(t * 0.7 + seed * 1.7);
  const b = Math.sin(t * 0.23 + seed * 3.1);
  const c = Math.sin(t * 0.11 + seed * 5.3);
  return (a * 0.5 + b * 0.33 + c * 0.17 + 1) / 2;
}

/** Cheap stable hash so each route drifts independently. */
function routeSeed(routeId: string): number {
  let h = 0;
  for (let i = 0; i < routeId.length; i++) h = (h * 31 + routeId.charCodeAt(i)) % 997;
  return h / 997;
}

/** 1.0 off-peak, falling towards 0.72 at the 09:00 and 18:00 peaks. */
function peakFactor(hour: number): number {
  const morning = Math.max(0, Math.cos(((hour - 9) / 5) * Math.PI));
  const evening = Math.max(0, Math.cos(((hour - 18) / 5) * Math.PI));
  return 1 - 0.28 * Math.max(morning, evening);
}

/**
 * The bottleneck acting at `km`, if any. Severity ramps in and out across the
 * stretch rather than switching on at an edge, so a bus slows into a jam.
 */
function bottleneckAt(routeId: string, km: number): { factor: number; label: string } | null {
  for (const b of BOTTLENECKS[routeId] ?? []) {
    if (km < b.fromKm || km > b.toKm) continue;
    const mid = (b.fromKm + b.toKm) / 2;
    const half = Math.max(0.001, (b.toKm - b.fromKm) / 2);
    // 1 at the centre, 0 at the edges.
    const depth = 1 - Math.abs(km - mid) / half;
    return { factor: 1 - (1 - b.severity) * depth, label: b.label };
  }
  return null;
}

export interface RoadConditions {
  /** Speed multiplier at this point and time. 1.0 is timetable speed. */
  multiplier: number;
  /** Named cause when a known bottleneck dominates, else null. */
  cause: string | null;
}

/**
 * Conditions at a point on a route.
 *
 * @param simMinutes Simulated minutes since start — drives the drift.
 * @param hour       Real hour of day, for the peak factor.
 */
export function conditionsAt(
  routeId: string,
  km: number,
  simMinutes: number,
  hour: number,
): RoadConditions {
  const seed = routeSeed(routeId);
  // Drift is sampled against position as well as time, so different parts of a
  // long corridor are not all congested in lockstep.
  const wander = 0.78 + drift(seed, simMinutes / 9 + km / 26) * 0.44;
  const bottleneck = bottleneckAt(routeId, km);

  const multiplier = clamp(wander * peakFactor(hour) * (bottleneck?.factor ?? 1));

  // Only name a cause when the bottleneck is what is actually hurting, otherwise
  // the app would blame a landmark for ordinary variation.
  const cause = bottleneck && bottleneck.factor < 0.85 && multiplier < 0.9 ? bottleneck.label : null;

  return { multiplier, cause };
}

function clamp(v: number): number {
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, v));
}

/**
 * Minutes to cover `fromKm`→`toKm` under the conditions in force *now*.
 *
 * Integrated in short steps because congestion varies along the way: a straight
 * `distance / currentSpeed` would price the whole remaining trip at whatever the
 * bus happens to be sitting in, which is how an ETA ends up wrong by an hour on
 * the far side of a jam.
 */
export function travelMinutes(
  routeId: string,
  fromKm: number,
  toKm: number,
  cruiseKmph: number,
  simMinutes: number,
  hour: number,
): number {
  if (toKm <= fromKm || cruiseKmph <= 0) return 0;

  const span = toKm - fromKm;
  const steps = Math.min(24, Math.max(3, Math.ceil(span / 8)));
  const stepKm = span / steps;

  let minutes = 0;
  for (let i = 0; i < steps; i++) {
    const km = fromKm + stepKm * (i + 0.5);
    const { multiplier } = conditionsAt(routeId, km, simMinutes, hour);
    minutes += (stepKm / (cruiseKmph * multiplier)) * 60;
  }
  return minutes;
}

/** Human phrasing for how the road is running, for the passenger-facing hint. */
export function conditionLabel(multiplier: number): 'clear' | 'normal' | 'slow' | 'heavy' {
  if (multiplier >= 1.08) return 'clear';
  if (multiplier >= 0.92) return 'normal';
  if (multiplier >= 0.72) return 'slow';
  return 'heavy';
}
