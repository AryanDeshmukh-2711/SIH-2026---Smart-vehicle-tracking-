/**
 * Destination resolution for someone who does not know the network.
 *
 * The QR flow's premise: a passenger standing at a plate knows exactly two
 * things — where they physically are (the plate says so) and where they want to
 * end up ("Hadimba Temple", "Manali"). They do not know stop names, route
 * numbers, or which bay to stand at. Everything else has to be derived.
 *
 * So a "destination" here is deliberately *not* a stop. It is whatever the
 * passenger can name — a stand, a town, a temple, a café — paired with the stop
 * they actually alight at and the walk that remains. Places already carry a
 * surveyed `nearestStopId`; a stop is its own alighting point.
 */

import type { Place, Route, Stop } from '@/types';
import { PLACES } from '@/data/places';
import { STOP_BY_ID, STOPS } from '@/data/stops';
import { ROUTES, ROUTE_BY_ID } from '@/data/routes';
import { haversineKm, walkMinutes } from '@/lib/geo';
import { matchStops } from './transit';
import { matchPlaces } from './places';
import { request } from './client';

export interface DestinationOption {
  kind: 'stop' | 'place';
  /** Stop id or place id. */
  id: string;
  name: string;
  town: string;
  /** Short qualifier shown under the name — category, or the stand type. */
  detail: string;
  /** The stop a passenger gets off at to reach this. */
  alightStopId: string;
  alightStopName: string;
  /** Walk from the alighting stop to the destination itself, minutes. */
  walkMin: number;
}

function fromStop(stop: Stop): DestinationOption {
  return {
    kind: 'stop',
    id: stop.id,
    name: stop.name,
    town: stop.town,
    detail:
      stop.kind === 'isbt' ? 'Interstate bus terminal' : stop.kind === 'bus-stand' ? 'Bus stand' : 'Bus stop',
    alightStopId: stop.id,
    alightStopName: stop.name,
    walkMin: 0,
  };
}

function fromPlace(place: Place, categoryLabel: string): DestinationOption {
  const stop = STOP_BY_ID.get(place.nearestStopId);
  return {
    kind: 'place',
    id: place.id,
    name: place.name,
    town: place.town,
    detail: categoryLabel,
    alightStopId: place.nearestStopId,
    alightStopName: stop?.name ?? place.nearestStopId,
    walkMin: place.walkFromStopMin,
  };
}

/**
 * Free-text destination lookup across stops *and* places.
 *
 * Both kinds are interleaved rather than concatenated: a tourist types "Hadimba"
 * and a local types "Mandi", and whichever they are, the other kind must not
 * crowd their answer off the end of the list.
 */
export function matchDestinations(
  query: string,
  categoryLabel: (p: Place) => string,
  limit = 8,
): DestinationOption[] {
  const q = query.trim();
  if (!q) return [];

  const stops = matchStops(q, limit).map(fromStop);
  const places = matchPlaces(q, limit).map((p) => fromPlace(p, categoryLabel(p)));

  const out: DestinationOption[] = [];
  for (let i = 0; out.length < limit && (i < stops.length || i < places.length); i++) {
    if (i < stops.length) out.push(stops[i]);
    if (out.length < limit && i < places.length) out.push(places[i]);
  }
  return out;
}

/** Destinations to offer before the passenger has typed anything. */
export function popularDestinations(
  fromStopId: string,
  categoryLabel: (p: Place) => string,
  limit = 6,
): DestinationOption[] {
  const here = STOP_BY_ID.get(fromStopId);

  // Anywhere actually reachable from this stop without a transfer, biggest
  // stands first — the honest answer to "where can this stop take me?".
  const reachable = ROUTES.filter((r) => r.stopIds.includes(fromStopId)).flatMap((r) => {
    const idx = r.stopIds.indexOf(fromStopId);
    return r.stopIds.slice(idx + 1);
  });

  const seen = new Set<string>();
  const stops = reachable
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
    .map((id) => STOP_BY_ID.get(id))
    .filter((s): s is Stop => Boolean(s))
    .sort((a, b) => rankKind(b.kind) - rankKind(a.kind))
    .map(fromStop);

  // Plus the best-known places near those stops, for anyone naming a sight
  // rather than a town.
  const places = PLACES.filter((p) => seen.has(p.nearestStopId) || p.nearestStopId === fromStopId)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit)
    .map((p) => fromPlace(p, categoryLabel(p)));

  const out: DestinationOption[] = [];
  for (let i = 0; out.length < limit && (i < stops.length || i < places.length); i++) {
    if (i < stops.length) out.push(stops[i]);
    if (out.length < limit && i < places.length) out.push(places[i]);
  }

  // Nothing reachable at all (an isolated stop): fall back to the nearest stands
  // so the screen still offers a way forward instead of an empty list.
  if (out.length === 0 && here) {
    return STOPS.filter((s) => s.id !== fromStopId)
      .sort((a, b) => haversineKm(here.position, a.position) - haversineKm(here.position, b.position))
      .slice(0, limit)
      .map(fromStop);
  }

  return out;
}

function rankKind(kind: Stop['kind']): number {
  return kind === 'isbt' ? 3 : kind === 'bus-stand' ? 2 : kind === 'stop' ? 1 : 0;
}

/* ------------------------------- the answer ------------------------------- */

export interface BoardingPlan {
  destination: DestinationOption;
  fromStopId: string;
  fromStopName: string;
  /** Services from this stop that reach the alighting stop, in the right order. */
  directRouteIds: string[];
  /** Stops to ride, and the road distance, per direct route. */
  ride: Record<string, { stops: number; km: number; fareInr: number }>;
  /** The passenger is already standing at the alighting stop. */
  alreadyHere: boolean;
  /** No direct service, but a route pair might connect via an interchange. */
  needsTransfer: boolean;
  /**
   * A corridor that links the two stops but is only modelled in the opposite
   * direction. Every route in this build is one-directional, so this is the
   * difference between "no service" and "no service *this way*".
   */
  reverseOnlyRouteId: string | null;
  /** Walk from the alighting stop to the destination. */
  walkMin: number;
}

export function getBoardingPlan(
  fromStopId: string,
  destination: DestinationOption,
): Promise<BoardingPlan> {
  return request(
    `/v1/stops/${fromStopId}/to/${destination.alightStopId}`,
    () => {
      const from = STOP_BY_ID.get(fromStopId);
      const alreadyHere = destination.alightStopId === fromStopId;

      const directRouteIds: string[] = [];
      const ride: BoardingPlan['ride'] = {};

      for (const route of ROUTES) {
        const a = route.stopIds.indexOf(fromStopId);
        const b = route.stopIds.indexOf(destination.alightStopId);
        if (a >= 0 && b > a) {
          directRouteIds.push(route.id);
          const km = route.distancesKm[b] - route.distancesKm[a];
          ride[route.id] = {
            stops: b - a,
            km: Math.round(km * 10) / 10,
            fareInr: fareFor(route, km),
          };
        }
      }

      return {
        destination,
        fromStopId,
        fromStopName: from?.name ?? fromStopId,
        directRouteIds,
        ride,
        alreadyHere,
        needsTransfer: !alreadyHere && directRouteIds.length === 0,
        reverseOnlyRouteId:
          alreadyHere || directRouteIds.length > 0
            ? null
            : (reverseCorridor(fromStopId, destination.alightStopId)?.id ?? null),
        walkMin: destination.walkMin,
      };
    },
    { cacheable: true },
  );
}

/** Stage fare for part of a route, rounded to the nearest ₹5 as HRTC does. */
function fareFor(route: Route, km: number): number {
  const total = route.distancesKm[route.distancesKm.length - 1];
  if (total <= 0) return route.fareInr;
  return Math.max(10, Math.round(((km / total) * route.fareInr) / 5) * 5);
}

function reverseCorridor(fromStopId: string, toStopId: string): Route | undefined {
  for (const route of ROUTES) {
    const a = route.stopIds.indexOf(fromStopId);
    const b = route.stopIds.indexOf(toStopId);
    if (a >= 0 && b >= 0 && b < a) return route;
  }
  return undefined;
}

export function routeOf(routeId: string): Route | undefined {
  return ROUTE_BY_ID.get(routeId);
}

/** Walk time from an arbitrary point to a stop — used for map-pin destinations. */
export function walkFromStop(stopId: string, to: { lat: number; lng: number }): number {
  const stop = STOP_BY_ID.get(stopId);
  return stop ? walkMinutes(haversineKm(stop.position, to)) : 0;
}
