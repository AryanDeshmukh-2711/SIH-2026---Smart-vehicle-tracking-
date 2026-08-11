/**
 * Queries over the live fleet.
 *
 * Everything that needs to know "what is running right now" reads through here,
 * so there is exactly one answer. Previously several services queried the
 * bundled simulator directly while the map and arrival boards read the socket —
 * which meant the journey planner could quote a departure time the live map
 * disagreed with, on the same screen, for the same bus.
 *
 * The store underneath is the backend feed, falling back to the local simulator
 * when the API is unreachable.
 */

import type { LiveBus, StopPrediction } from '@/types';
import { liveStore } from './liveStore';

export function liveSnapshot(): LiveBus[] {
  return liveStore.getSnapshot();
}

/** Beyond this an arrival belongs on the timetable, not a live board. */
export const LIVE_BOARD_HORIZON_MIN = 120;

export interface LiveDeparture {
  live: LiveBus;
  prediction: StopPrediction;
}

/**
 * Services currently approaching a stop, soonest first.
 *
 * Includes vehicles still on layover at their origin — at a terminus those are
 * the entire board — but drops anything beyond the live horizon.
 */
export function departuresAt(stopId: string, limit = 8): LiveDeparture[] {
  const out: LiveDeparture[] = [];

  for (const live of liveSnapshot()) {
    if (live.live.status === 'cancelled') continue;
    const prediction = live.live.predictions.find((p) => p.stopId === stopId);
    if (prediction && prediction.etaMin <= LIVE_BOARD_HORIZON_MIN) {
      out.push({ live, prediction });
    }
  }

  return out.sort((a, b) => a.prediction.etaMin - b.prediction.etaMin).slice(0, limit);
}

export function vehicleById(busId: string): LiveBus | undefined {
  return liveSnapshot().find((b) => b.bus.id === busId);
}

const normalise = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');

/** Accepts "HP-01-4021", "hp014021" or the internal id. */
export function vehicleByRegistration(query: string): LiveBus | undefined {
  const target = normalise(query);
  return liveSnapshot().find(
    (b) => normalise(b.bus.registration) === target || normalise(b.bus.id) === target,
  );
}

/** Vehicles matching a free-text registration or route-number query. */
export function matchVehicles(query: string, limit = 4): LiveBus[] {
  const q = normalise(query);
  if (q.length < 2) return [];

  return liveSnapshot()
    .filter(
      (lb) =>
        normalise(lb.bus.registration).includes(q) ||
        lb.route.shortName.toUpperCase() === q ||
        lb.route.shortName.toUpperCase().startsWith(q),
    )
    .slice(0, limit);
}

/** Earliest predicted arrival at a stop for a given route. */
export function nextArrivalOnRoute(routeId: string, stopId: string): StopPrediction | undefined {
  return liveSnapshot()
    .filter((lb) => lb.route.id === routeId && lb.live.status !== 'cancelled')
    .map((lb) => lb.live.predictions.find((p) => p.stopId === stopId))
    .filter((p): p is StopPrediction => Boolean(p))
    .sort((a, b) => a.etaMin - b.etaMin)[0];
}
