/**
 * ETA engine.
 *
 * Computes an arrival time for every upcoming stop on a trip (FR-8), using road
 * distance rather than straight-line distance (FR-9) and adding dwell time for
 * the stops in between (FR-10).
 *
 * The part that matters most is what it does when the data is bad. Confidence is
 * a function of one thing only — how old the last fix is (SRS §8.3) — and as
 * confidence falls the answer changes *shape*: a point estimate becomes a range,
 * and past fifteen minutes of silence the live position is abandoned entirely in
 * favour of the printed timetable. A stale prediction dressed up as a precise
 * one is worse than an honest schedule.
 */

import {
  TIMETABLE_FALLBACK_AFTER_SEC,
  confidenceFromAge,
  rangeFor,
} from '@himgati/shared';
import type { Confidence, StopPrediction } from '@himgati/shared';
import type { NetworkRoute } from '../../state/network.ts';

/** Seconds a vehicle stands at an intermediate stop, by service class. */
const DWELL_MIN: Record<string, number> = {
  volvo: 3,
  express: 2.5,
  deluxe: 2,
  ordinary: 1.5,
  local: 0.7,
};

export interface EtaInput {
  route: NetworkRoute;
  /** Distance travelled along the route at the last accepted fix, km. */
  progressKm: number;
  /** Age of that fix, seconds. */
  ageSec: number;
  /** Minutes behind schedule; negative means early. */
  delayMin: number;
  /** Set when the vehicle is stationary at its origin awaiting departure. */
  departsInMin?: number;
  now?: Date;
}

export interface EtaResult {
  predictions: StopPrediction[];
  confidence: Confidence;
  /** True when the timetable answered instead of the live position. */
  fromTimetable: boolean;
  nextStopIndex: number;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** First stop the vehicle has not yet reached. */
export function nextStopIndexFor(route: NetworkRoute, progressKm: number): number {
  const idx = route.distancesKm.findIndex((d) => d > progressKm);
  return idx === -1 ? route.stopIds.length - 1 : idx;
}

export function computeEta(input: EtaInput): EtaResult {
  const { route, progressKm, ageSec, delayMin } = input;
  const now = input.now ?? new Date();
  const departsInMin = input.departsInMin ?? 0;

  const nextStopIndex = departsInMin > 0 ? 0 : nextStopIndexFor(route, progressKm);

  if (ageSec >= TIMETABLE_FALLBACK_AFTER_SEC) {
    return {
      predictions: fromTimetable(route, nextStopIndex, now),
      confidence: 'low',
      fromTimetable: true,
      nextStopIndex,
    };
  }

  const confidence = confidenceFromAge(ageSec);
  const cruiseKmph = (route.distanceKm / route.typicalDurationMin) * 60;
  const dwell = DWELL_MIN[route.category] ?? 1.5;

  // A fix that is a few minutes old means the bus has almost certainly kept
  // moving. Assuming it stopped where we last saw it would systematically
  // overestimate every arrival on the corridor.
  const assumedKm = progressKm + (ageSec / 3600) * cruiseKmph;

  const predictions: StopPrediction[] = [];

  for (let i = nextStopIndex; i < route.stopIds.length; i++) {
    const remainingKm = Math.max(0, route.distancesKm[i] - assumedKm);
    const stopsBetween = Math.max(0, i - nextStopIndex);

    const travelMin = (remainingKm / cruiseKmph) * 60;
    const etaMin = Math.max(
      0,
      Math.round(departsInMin + travelMin + stopsBetween * dwell + Math.max(0, delayMin) * 0.15),
    );

    const [lo, hi] = rangeFor(etaMin, confidence);

    predictions.push({
      stopId: route.stopIds[i],
      etaMin,
      rangeMin: [Math.round(lo), Math.round(hi)],
      confidence,
      // What the timetable promised, so a passenger can see the gap.
      scheduled: hhmm(new Date(now.getTime() + (etaMin - delayMin) * 60_000)),
      distanceKm: Math.round(remainingKm * 10) / 10,
    });
  }

  return { predictions, confidence, fromTimetable: false, nextStopIndex };
}

/**
 * Arrivals derived purely from the published timetable, ignoring live position.
 * Always low confidence — a timetable is a plan, not an observation.
 */
function fromTimetable(route: NetworkRoute, nextStopIndex: number, now: Date): StopPrediction[] {
  const nowMs = now.getTime();
  const out: StopPrediction[] = [];

  for (let i = nextStopIndex; i < route.stopIds.length; i++) {
    const offsetMin = (route.distancesKm[i] / route.distanceKm) * route.typicalDurationMin;

    let arrival: Date | null = null;
    for (const dep of route.departures) {
      const [h, m] = dep.split(':').map(Number);
      const base = new Date(now);
      base.setHours(h, m, 0, 0);
      const candidate = new Date(base.getTime() + offsetMin * 60_000);
      if (candidate.getTime() > nowMs) {
        arrival = candidate;
        break;
      }
    }

    if (!arrival) {
      // Nothing left today — roll to the first service tomorrow.
      const [h, m] = route.departures[0].split(':').map(Number);
      const base = new Date(now);
      base.setDate(base.getDate() + 1);
      base.setHours(h, m, 0, 0);
      arrival = new Date(base.getTime() + offsetMin * 60_000);
    }

    const etaMin = Math.max(0, Math.round((arrival.getTime() - nowMs) / 60_000));
    const [lo, hi] = rangeFor(etaMin, 'low');

    out.push({
      stopId: route.stopIds[i],
      etaMin,
      rangeMin: [Math.round(lo), Math.round(hi)],
      confidence: 'low',
      scheduled: hhmm(arrival),
      distanceKm:
        Math.round((route.distancesKm[i] - route.distancesKm[nextStopIndex]) * 10) / 10,
    });
  }

  return out;
}
