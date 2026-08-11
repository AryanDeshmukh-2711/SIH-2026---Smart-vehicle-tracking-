/**
 * Transit read API. Maps to a GTFS-backed gateway; see `adapters/gtfs.ts`.
 */

import type { LatLng, LiveBus, Route, Stop, StopPrediction } from '@/types';
import { STOPS, STOP_BY_ID } from '@/data/stops';
import { ROUTES, ROUTE_BY_ID, routeDistanceKm, routesServingStop } from '@/data/routes';
import { BUSES, BUS_BY_ID } from '@/data/buses';
import { haversineKm, walkMinutes } from '@/lib/geo';
import { request } from './client';
import {
  departuresAt,
  liveSnapshot,
  matchVehicles,
  vehicleById,
  vehicleByRegistration,
} from './live/queries';
import { formatEtaCompact } from '@/lib/eta';
import { pretty24 } from '@/lib/format';

/* --------------------------------- stops ---------------------------------- */

export function getStops(): Promise<Stop[]> {
  return request('/v1/stops', () => STOPS, { cacheable: true });
}

export function getStop(id: string): Promise<Stop> {
  return request(`/v1/stops/${id}`, () => {
    const s = STOP_BY_ID.get(id);
    if (!s) throw new Error(`Stop ${id} not found`);
    return s;
  }, { cacheable: true });
}

export interface NearbyStop {
  stop: Stop;
  distanceKm: number;
  walkMin: number;
  routes: Route[];
}

/** Stops around a point, nearest first (FR-17). */
export function getNearbyStops(from: LatLng, limit = 6): Promise<NearbyStop[]> {
  return request('/v1/stops/nearby', () =>
    STOPS.map((stop) => {
      const distanceKm = haversineKm(from, stop.position);
      return { stop, distanceKm, walkMin: walkMinutes(distanceKm), routes: routesServingStop(stop.id) };
    })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit),
    { cacheable: true },
  );
}

/** Free-text stop lookup that also matches town names and landmarks. */
export function searchStops(query: string, limit = 8): Promise<Stop[]> {
  return request('/v1/stops/search', () => matchStops(query, limit), { cacheable: true });
}

export function matchStops(query: string, limit = 8): Stop[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored = STOPS.map((s) => {
    const name = s.name.toLowerCase();
    const town = s.town.toLowerCase();
    const landmarks = s.landmarks.join(' ').toLowerCase();

    let score = 0;
    if (name.startsWith(q)) score = 100;
    else if (town.startsWith(q)) score = 90;
    else if (name.includes(q)) score = 70;
    else if (town.includes(q)) score = 60;
    else if (landmarks.includes(q)) score = 45;
    else if (s.id.toLowerCase().includes(q) || s.smsCode.includes(q)) score = 40;

    return { stop: s, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.stop.name.localeCompare(b.stop.name));

  return scored.slice(0, limit).map((x) => x.stop);
}

/* -------------------------------- routes ---------------------------------- */

export function getRoutes(): Promise<Route[]> {
  return request('/v1/routes', () => ROUTES, { cacheable: true });
}

export function getRoute(id: string): Promise<Route> {
  return request(`/v1/routes/${id}`, () => {
    const r = ROUTE_BY_ID.get(id);
    if (!r) throw new Error(`Route ${id} not found`);
    return r;
  }, { cacheable: true });
}

export function matchRoutes(query: string, limit = 6): Route[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ROUTES.filter(
    (r) =>
      r.shortName.toLowerCase().includes(q) ||
      r.longName.toLowerCase().includes(q) ||
      r.origin.toLowerCase().includes(q) ||
      r.destination.toLowerCase().includes(q),
  ).slice(0, limit);
}

export { routesServingStop };

/* --------------------------------- buses ---------------------------------- */

export function getBus(id: string) {
  return request(`/v1/vehicles/${id}`, () => {
    const b = BUS_BY_ID.get(id);
    if (!b) throw new Error(`Bus ${id} not found`);
    return b;
  });
}

/** Route-number or registration lookup — location method 6, no GPS involved. */
export function findVehicle(query: string): Promise<LiveBus[]> {
  return request('/v1/vehicles/search', () => {
    const q = query.trim().toLowerCase().replace(/[\s-]/g, '');
    if (!q) return [];

    // An exact registration is unambiguous, so it wins outright.
    const direct = vehicleByRegistration(query);
    if (direct) return [direct];

    return matchVehicles(query, 8);
  });
}

export { vehicleById as liveBusById };

/* ------------------------------ departures -------------------------------- */

export interface Departure {
  live: LiveBus;
  prediction: StopPrediction;
  platform?: string;
}

/** Live arrivals board for a stop. */
export function getDepartures(stopId: string, limit = 8): Promise<Departure[]> {
  return request(`/v1/stops/${stopId}/departures`, () => {
    const stop = STOP_BY_ID.get(stopId);
    return departuresAt(stopId, limit)
      .slice(0, limit)
      .map(({ live, prediction }, i) => ({
        live,
        prediction,
        platform: stop?.platforms?.[i % (stop.platforms?.length || 1)],
      }));
  });
}

/**
 * The printed timetable for a stop — what the app falls back to when live data
 * is more than 15 minutes stale, and what offline mode serves (FR-31).
 */
export interface TimetableEntry {
  routeId: string;
  shortName: string;
  headsign: string;
  time: string;
  fareInr: number;
}

export function getTimetable(stopId: string): Promise<TimetableEntry[]> {
  return request(`/v1/stops/${stopId}/timetable`, () => {
    const out: TimetableEntry[] = [];

    for (const route of routesServingStop(stopId)) {
      const idx = route.stopIds.indexOf(stopId);
      const offsetMin =
        (route.distancesKm[idx] / routeDistanceKm(route)) * route.typicalDurationMin;

      for (const dep of route.departures) {
        const [h, m] = dep.split(':').map(Number);
        const t = new Date();
        t.setHours(h, m + Math.round(offsetMin), 0, 0);
        out.push({
          routeId: route.id,
          shortName: route.shortName,
          headsign: route.destination,
          time: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
          fareInr: route.fareInr,
        });
      }
    }

    return out.sort((a, b) => a.time.localeCompare(b.time));
  }, { cacheable: true });
}

/** Next `count` timetabled departures from now. */
export function upcomingTimetable(entries: TimetableEntry[], count = 6): TimetableEntry[] {
  const nowStr = new Date().toTimeString().slice(0, 5);
  const later = entries.filter((e) => e.time >= nowStr);
  return (later.length >= count ? later : [...later, ...entries]).slice(0, count);
}

/* ---------------------------------- SMS ----------------------------------- */

/**
 * Exact SMS reply the gateway sends for `BUS <code>` (SRS §8.6). Rendered in
 * the app so a user can see what their relatives without smartphones will get.
 */
export function smsReply(stopId: string): string {
  const stop = STOP_BY_ID.get(stopId);
  if (!stop) return 'Stop not found. Text BUS <4-digit code>.';

  const rows = departuresAt(stopId, 3);
  if (rows.length === 0) {
    const tt = ROUTES.filter((r) => r.stopIds.includes(stopId))
      .slice(0, 2)
      .map((r) => `${r.shortName} ${r.destination} ${pretty24(r.departures[0])}`)
      .join('; ');
    return `${stop.name.split(',')[0]}: no live buses. Timetable: ${tt || 'none'}`;
  }

  const body = rows
    .map(({ live, prediction }) => {
      const tag =
        live.bus.fuel === 'electric'
          ? 'EV'
          : live.bus.fuel === 'cng'
            ? 'CNG'
            : live.bus.norm.replace('BS-', 'BS');
      return `${live.bus.registration.split('-').slice(-1)[0]} ${live.route.destination} ${formatEtaCompact(prediction)} [${tag}]`;
    })
    .join('; ');

  return `${stop.name.split(',')[0]}: ${body}`;
}

/* -------------------------------- summary --------------------------------- */

export interface NetworkSummary {
  routes: number;
  stops: number;
  vehicles: number;
  running: number;
  cleanFleetShare: number;
}

export function getNetworkSummary(): Promise<NetworkSummary> {
  return request('/v1/summary', () => {
    const snapshot = liveSnapshot();
    return {
      routes: ROUTES.length,
      stops: STOPS.length,
      vehicles: BUSES.length,
      running: snapshot.filter((s) => s.live.status !== 'scheduled' && s.live.status !== 'cancelled').length,
      cleanFleetShare: BUSES.filter((b) => b.fuel !== 'diesel').length / BUSES.length,
    };
  }, { cacheable: true });
}
