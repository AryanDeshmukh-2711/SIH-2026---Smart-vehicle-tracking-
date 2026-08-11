/**
 * Journey planning.
 *
 * A deliberately transparent planner: direct services first, then single-transfer
 * itineraries built from the stop→route index. It scores each candidate against
 * the four preferences the brief calls for and labels the winners, so the user
 * can see *why* an option is being recommended rather than trusting a black box.
 */

import type { JourneyLeg, JourneyOption, JourneyPreference, Route } from '@/types';
import { ROUTES, ROUTE_BY_ID, routeDistanceKm, routesServingStop } from '@/data/routes';
import { STOP_BY_ID, stopName } from '@/data/stops';
import { BUSES } from '@/data/buses';
import { co2SavedKg, greenScore } from '@/lib/green';
import { haversineKm, walkMinutes } from '@/lib/geo';
import { addMinutes, hhmm24 } from '@/lib/format';
import { request } from './client';
import { simulator } from './simulation/simulator';

export const PREFERENCE_LABEL: Record<JourneyPreference, string> = {
  fastest: 'Fastest',
  cheapest: 'Cheapest',
  'fewest-transfers': 'Fewest transfers',
  'most-sustainable': 'Most sustainable',
};

interface RideSpec {
  route: Route;
  fromIdx: number;
  toIdx: number;
}

function ride(route: Route, fromIdx: number, toIdx: number) {
  const totalKm = routeDistanceKm(route);
  const distanceKm = route.distancesKm[toIdx] - route.distancesKm[fromIdx];
  const durationMin = Math.round((distanceKm / totalKm) * route.typicalDurationMin);
  const fareInr = Math.max(10, Math.round(((distanceKm / totalKm) * route.fareInr) / 5) * 5);
  return { distanceKm: Math.round(distanceKm * 10) / 10, durationMin, fareInr };
}

/** Best vehicle currently assigned to a route, preferring cleaner stock. */
function pickVehicle(routeId: string) {
  const candidates = BUSES.filter((b) => b.routeId === routeId);
  if (candidates.length === 0) return undefined;
  return candidates.slice().sort((a, b) => greenScore(b) - greenScore(a))[0];
}

/** Next departure from `route` at `stopIdx`, live if a bus is en route. */
function nextDeparture(route: Route, stopIdx: number, after: Date): Date {
  const stopId = route.stopIds[stopIdx];

  const live = simulator
    .getSnapshot()
    .filter((lb) => lb.route.id === route.id && lb.live.status !== 'cancelled')
    .map((lb) => lb.live.predictions.find((p) => p.stopId === stopId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .sort((a, b) => a.etaMin - b.etaMin)[0];

  if (live) return addMinutes(after, Math.max(1, live.etaMin));

  const totalKm = routeDistanceKm(route);
  const offsetMin = (route.distancesKm[stopIdx] / totalKm) * route.typicalDurationMin;

  for (const dep of route.departures) {
    const [h, m] = dep.split(':').map(Number);
    const t = new Date(after);
    t.setHours(h, m, 0, 0);
    const arrival = addMinutes(t, offsetMin);
    if (arrival > after) return arrival;
  }

  // Nothing left today — roll to the first service tomorrow.
  const [h, m] = route.departures[0].split(':').map(Number);
  const t = new Date(after);
  t.setDate(t.getDate() + 1);
  t.setHours(h, m, 0, 0);
  return addMinutes(t, offsetMin);
}

function buildOption(id: string, rides: RideSpec[], departAfter: Date): JourneyOption {
  const legs: JourneyLeg[] = [];
  let cursor = departAfter;
  let fare = 0;
  let co2 = 0;
  let walk = 0;
  let greenTotal = 0;

  rides.forEach((spec, i) => {
    const board = nextDeparture(spec.route, spec.fromIdx, cursor);
    const waitMin = Math.max(0, Math.round((board.getTime() - cursor.getTime()) / 60_000));

    if (waitMin > 0) {
      legs.push({
        kind: 'wait',
        from: stopName(spec.route.stopIds[spec.fromIdx]),
        to: stopName(spec.route.stopIds[spec.fromIdx]),
        durationMin: waitMin,
        distanceKm: 0,
      });
    }

    const r = ride(spec.route, spec.fromIdx, spec.toIdx);
    const vehicle = pickVehicle(spec.route.id);
    const alight = addMinutes(board, r.durationMin);

    legs.push({
      kind: 'bus',
      from: stopName(spec.route.stopIds[spec.fromIdx]),
      to: stopName(spec.route.stopIds[spec.toIdx]),
      durationMin: r.durationMin,
      distanceKm: r.distanceKm,
      routeId: spec.route.id,
      busId: vehicle?.id,
      departure: hhmm24(board),
      arrival: hhmm24(alight),
      stopsCount: spec.toIdx - spec.fromIdx,
    });

    fare += r.fareInr;
    co2 += co2SavedKg(vehicle?.fuel ?? 'diesel', r.distanceKm);
    greenTotal += vehicle ? greenScore(vehicle) : 40;
    cursor = alight;

    // Interchange walk between bays.
    if (i < rides.length - 1) {
      legs.push({ kind: 'walk', from: 'Interchange', to: 'Connecting bay', durationMin: 4, distanceKm: 0.2 });
      walk += 4;
      cursor = addMinutes(cursor, 4);
    }
  });

  const first = legs.find((l) => l.kind === 'bus');
  const last = [...legs].reverse().find((l) => l.kind === 'bus');

  return {
    id,
    legs,
    departure: first?.departure ?? hhmm24(departAfter),
    arrival: last?.arrival ?? hhmm24(cursor),
    durationMin: Math.round((cursor.getTime() - departAfter.getTime()) / 60_000),
    fareInr: fare,
    transfers: rides.length - 1,
    walkMin: walk,
    co2SavedKg: Math.round(co2 * 100) / 100,
    greenScore: Math.round(greenTotal / rides.length),
    badges: [],
  };
}

/** Tag each option with the preferences it actually wins on. */
function applyBadges(options: JourneyOption[]): JourneyOption[] {
  if (options.length === 0) return options;

  const min = (pick: (o: JourneyOption) => number) => Math.min(...options.map(pick));
  const max = (pick: (o: JourneyOption) => number) => Math.max(...options.map(pick));

  const fastest = min((o) => o.durationMin);
  const cheapest = min((o) => o.fareInr);
  const fewest = min((o) => o.transfers);
  const greenest = max((o) => o.greenScore);

  for (const o of options) {
    o.badges = [];
    if (o.durationMin === fastest) o.badges.push('fastest');
    if (o.fareInr === cheapest) o.badges.push('cheapest');
    if (o.transfers === fewest && options.some((x) => x.transfers > fewest)) {
      o.badges.push('fewest-transfers');
    }
    if (o.greenScore === greenest) o.badges.push('most-sustainable');
  }

  return options;
}

const SORTERS: Record<JourneyPreference, (a: JourneyOption, b: JourneyOption) => number> = {
  fastest: (a, b) => a.durationMin - b.durationMin,
  cheapest: (a, b) => a.fareInr - b.fareInr || a.durationMin - b.durationMin,
  'fewest-transfers': (a, b) => a.transfers - b.transfers || a.durationMin - b.durationMin,
  'most-sustainable': (a, b) => b.greenScore - a.greenScore || b.co2SavedKg - a.co2SavedKg,
};

export interface PlanRequest {
  fromStopId: string;
  toStopId: string;
  preference: JourneyPreference;
  departAt?: Date;
}

export function planJourney(req: PlanRequest): Promise<JourneyOption[]> {
  return request('/v1/journeys/plan', () => {
    const departAt = req.departAt ?? new Date();
    if (req.fromStopId === req.toStopId) return [];

    const options: JourneyOption[] = [];

    /* ---------------------------- direct services --------------------------- */
    for (const route of ROUTES) {
      const fromIdx = route.stopIds.indexOf(req.fromStopId);
      const toIdx = route.stopIds.indexOf(req.toStopId);
      if (fromIdx >= 0 && toIdx > fromIdx) {
        options.push(buildOption(`J-${route.id}`, [{ route, fromIdx, toIdx }], departAt));
      }
    }

    /* --------------------------- one transfer ------------------------------ */
    if (options.length < 3) {
      const fromRoutes = routesServingStop(req.fromStopId);
      const toRoutes = routesServingStop(req.toStopId);

      for (const a of fromRoutes) {
        for (const b of toRoutes) {
          if (a.id === b.id) continue;

          const aFrom = a.stopIds.indexOf(req.fromStopId);
          const bTo = b.stopIds.indexOf(req.toStopId);

          for (const interchange of a.stopIds.slice(aFrom + 1)) {
            const aTo = a.stopIds.indexOf(interchange);
            const bFrom = b.stopIds.indexOf(interchange);
            if (bFrom < 0 || bFrom >= bTo) continue;

            const id = `J-${a.id}-${b.id}-${interchange}`;
            if (options.some((o) => o.id === id)) continue;

            options.push(
              buildOption(id, [
                { route: a, fromIdx: aFrom, toIdx: aTo },
                { route: b, fromIdx: bFrom, toIdx: bTo },
              ], departAt),
            );
            break;
          }
        }
      }
    }

    return applyBadges(options).sort(SORTERS[req.preference]).slice(0, 5);
  });
}

/** Walking leg from the user's actual position to the boarding stop. */
export function accessLeg(from: { lat: number; lng: number }, stopId: string) {
  const stop = STOP_BY_ID.get(stopId);
  if (!stop) return null;
  const km = haversineKm(from, stop.position);
  return { stop, distanceKm: km, walkMin: walkMinutes(km) };
}

export function routeOf(id: string | undefined): Route | undefined {
  return id ? ROUTE_BY_ID.get(id) : undefined;
}
