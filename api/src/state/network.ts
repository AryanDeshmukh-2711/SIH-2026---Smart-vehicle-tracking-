/**
 * In-memory network graph.
 *
 * Routes, their stop patterns and cumulative distances are read-mostly reference
 * data. The ETA engine touches them on every tick for every running trip, so
 * they are loaded once and held in memory rather than re-queried — otherwise a
 * 5,000-vehicle fleet would issue tens of thousands of identical reads a minute.
 *
 * Call `refreshNetwork()` after any admin edit to routes or stops.
 */

import type { LatLng, RouteCategory } from '@himgati/shared';
import { prisma } from '../db/prisma.ts';
import { allRouteShapes } from '../db/geo.ts';
import { logger } from '../config/logger.ts';

export interface NetworkStop {
  id: string;
  name: string;
  nameHi: string;
  kind: string;
  town: string;
  position: LatLng;
  landmarks: string[];
  platforms: string[];
  amenities: string[];
  smsCode: string;
}

export interface NetworkRoute {
  id: string;
  shortName: string;
  longName: string;
  origin: string;
  destination: string;
  category: RouteCategory;
  operator: string;
  distanceKm: number;
  typicalDurationMin: number;
  fareInr: number;
  departures: string[];
  stopIds: string[];
  /** Cumulative road distance to each stop, aligned with `stopIds`. */
  distancesKm: number[];
  shape: LatLng[];
}

export interface NetworkBus {
  id: string;
  registration: string;
  operator: string;
  routeId: string;
  fuel: 'electric' | 'cng' | 'hybrid' | 'diesel';
  norm: 'zero-tailpipe' | 'BS-VI' | 'BS-IV' | 'BS-III';
  year: number;
  seats: number;
  wheelchairAccessible: boolean;
  amenities: string[];
  emissionDataEstimated: boolean;
}

interface NetworkSnapshot {
  stops: Map<string, NetworkStop>;
  routes: Map<string, NetworkRoute>;
  buses: Map<string, NetworkBus>;
  loadedAt: Date;
}

let snapshot: NetworkSnapshot | null = null;

/** Reverse of the seed's enum mapping — Postgres labels back to wire values. */
const NORM_OUT: Record<string, NetworkBus['norm']> = {
  zero_tailpipe: 'zero-tailpipe',
  BS_VI: 'BS-VI',
  BS_IV: 'BS-IV',
  BS_III: 'BS-III',
};

const KIND_OUT: Record<string, string> = {
  isbt: 'isbt',
  bus_stand: 'bus-stand',
  stop: 'stop',
  halt: 'halt',
};

export async function refreshNetwork(): Promise<void> {
  const [stopRows, routeRows, busRows, shapes] = await Promise.all([
    prisma.stop.findMany(),
    prisma.route.findMany({
      where: { active: true },
      include: { routeStops: { orderBy: { sequence: 'asc' } } },
    }),
    prisma.bus.findMany({ where: { active: true } }),
    allRouteShapes(),
  ]);

  const stops = new Map<string, NetworkStop>(
    stopRows.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        nameHi: s.nameHi,
        kind: KIND_OUT[s.kind] ?? s.kind,
        town: s.town,
        position: { lat: s.lat, lng: s.lng },
        landmarks: s.landmarks,
        platforms: s.platforms,
        amenities: s.amenities,
        smsCode: s.smsCode,
      },
    ]),
  );

  const routes = new Map<string, NetworkRoute>(
    routeRows.map((r) => [
      r.id,
      {
        id: r.id,
        shortName: r.shortName,
        longName: r.longName,
        origin: r.origin,
        destination: r.destination,
        category: r.category as RouteCategory,
        operator: r.operator,
        distanceKm: r.distanceKm,
        typicalDurationMin: r.typicalDurationMin,
        fareInr: r.fareInr,
        departures: r.departures,
        stopIds: r.routeStops.map((rs) => rs.stopId),
        distancesKm: r.routeStops.map((rs) => rs.distanceKm),
        shape: shapes[r.id] ?? [],
      },
    ]),
  );

  const buses = new Map<string, NetworkBus>(
    busRows.map((b) => [
      b.id,
      {
        id: b.id,
        registration: b.registration,
        operator: b.operator,
        routeId: b.routeId,
        fuel: b.fuel,
        norm: NORM_OUT[b.norm] ?? 'BS-IV',
        year: b.year,
        seats: b.seats,
        wheelchairAccessible: b.wheelchairAccessible,
        amenities: b.amenities,
        emissionDataEstimated: b.emissionDataEstimated,
      },
    ]),
  );

  snapshot = { stops, routes, buses, loadedAt: new Date() };
  logger.info(
    { stops: stops.size, routes: routes.size, buses: buses.size },
    'network graph loaded',
  );
}

function graph(): NetworkSnapshot {
  if (!snapshot) throw new Error('network graph not loaded — call refreshNetwork() at boot');
  return snapshot;
}

export const network = {
  stop: (id: string) => graph().stops.get(id),
  route: (id: string) => graph().routes.get(id),
  bus: (id: string) => graph().buses.get(id),
  stops: () => [...graph().stops.values()],
  routes: () => [...graph().routes.values()],
  buses: () => [...graph().buses.values()],
  /** Accepts "HP-01-4021", "hp014021" or the internal id. */
  busByRegistration: (reg: string) => {
    const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
    const target = norm(reg);
    return [...graph().buses.values()].find(
      (b) => norm(b.registration) === target || norm(b.id) === target,
    );
  },
  routesServingStop: (stopId: string) =>
    [...graph().routes.values()].filter((r) => r.stopIds.includes(stopId)),
  loadedAt: () => graph().loadedAt,
  isLoaded: () => snapshot !== null,
};
