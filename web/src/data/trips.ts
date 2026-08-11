import type { TripRecord } from '@/types';
import { BUS_BY_ID } from './buses';
import { ROUTE_BY_ID, routeDistanceKm } from './routes';
import { stopName } from './stops';
import { co2SavedKg } from '@/lib/green';

/**
 * Travel history.
 *
 * Every figure on the Sustainability dashboard is summed from these records
 * rather than hardcoded, so the monthly totals always reconcile with the trip
 * list a user can scroll through. Dates are generated relative to today so the
 * "Yesterday / 3 days ago" grouping stays correct whenever the app is opened.
 */

interface TripSeed {
  /** Days before today. */
  daysAgo: number;
  hour: number;
  minute: number;
  busId: string;
  fromStopId: string;
  toStopId: string;
  /** Fraction of the full route actually travelled. */
  fraction: number;
  reviewed?: boolean;
}

const SEEDS: TripSeed[] = [
  { daysAgo: 1, hour: 9, minute: 10, busId: 'B-1187', fromStopId: 'HP-SML-001', toStopId: 'HP-SOL-001', fraction: 0.56 },
  { daysAgo: 1, hour: 18, minute: 40, busId: 'B-7734', fromStopId: 'HP-SOL-001', toStopId: 'HP-SML-001', fraction: 0.56, reviewed: true },
  { daysAgo: 2, hour: 8, minute: 20, busId: 'B-1220', fromStopId: 'HP-SML-001', toStopId: 'HP-SML-004', fraction: 1 },
  { daysAgo: 3, hour: 10, minute: 40, busId: 'B-9012', fromStopId: 'HP-SML-001', toStopId: 'HP-KFR-001', fraction: 0.31, reviewed: true },
  { daysAgo: 3, hour: 17, minute: 15, busId: 'B-9012', fromStopId: 'HP-KFR-001', toStopId: 'HP-SML-001', fraction: 0.31 },
  { daysAgo: 5, hour: 7, minute: 15, busId: 'B-3390', fromStopId: 'HP-SML-001', toStopId: 'HP-CHL-001', fraction: 1 },
  { daysAgo: 5, hour: 16, minute: 30, busId: 'B-3390', fromStopId: 'HP-CHL-001', toStopId: 'HP-SML-001', fraction: 1, reviewed: true },
  { daysAgo: 7, hour: 8, minute: 0, busId: 'B-1235', fromStopId: 'HP-SML-001', toStopId: 'HP-SML-003', fraction: 0.5 },
  { daysAgo: 8, hour: 9, minute: 0, busId: 'B-1220', fromStopId: 'HP-SML-003', toStopId: 'HP-SML-004', fraction: 0.4 },
  { daysAgo: 9, hour: 10, minute: 30, busId: 'B-4021', fromStopId: 'HP-SML-001', toStopId: 'HP-MND-001', fraction: 0.63, reviewed: true },
  { daysAgo: 10, hour: 11, minute: 20, busId: 'B-2265', fromStopId: 'HP-KLU-001', toStopId: 'HP-MNL-001', fraction: 1 },
  { daysAgo: 10, hour: 15, minute: 0, busId: 'B-6677', fromStopId: 'HP-MNL-001', toStopId: 'HP-SLG-001', fraction: 1, reviewed: true },
  { daysAgo: 11, hour: 9, minute: 45, busId: 'B-6677', fromStopId: 'HP-SLG-001', toStopId: 'HP-MNL-001', fraction: 1 },
  { daysAgo: 12, hour: 13, minute: 0, busId: 'B-1109', fromStopId: 'HP-MNL-001', toStopId: 'HP-KLU-001', fraction: 1 },
  { daysAgo: 14, hour: 8, minute: 10, busId: 'B-1235', fromStopId: 'HP-SML-001', toStopId: 'HP-SML-005', fraction: 0.72 },
  { daysAgo: 16, hour: 18, minute: 0, busId: 'B-1220', fromStopId: 'HP-SML-005', toStopId: 'HP-SML-001', fraction: 0.72 },
  { daysAgo: 18, hour: 6, minute: 45, busId: 'B-7734', fromStopId: 'HP-SML-001', toStopId: 'HP-KDG-001', fraction: 0.34 },
  { daysAgo: 20, hour: 12, minute: 15, busId: 'B-5540', fromStopId: 'HP-SML-001', toStopId: 'HP-THG-001', fraction: 0.55 },
  { daysAgo: 23, hour: 9, minute: 30, busId: 'B-1220', fromStopId: 'HP-SML-001', toStopId: 'HP-SML-004', fraction: 1 },
  { daysAgo: 26, hour: 7, minute: 30, busId: 'B-8801', fromStopId: 'HP-SML-001', toStopId: 'HP-DHR-001', fraction: 0.94, reviewed: true },
];

function buildTrip(seed: TripSeed, index: number): TripRecord {
  const bus = BUS_BY_ID.get(seed.busId)!;
  const route = ROUTE_BY_ID.get(bus.routeId)!;

  const date = new Date();
  date.setDate(date.getDate() - seed.daysAgo);
  date.setHours(seed.hour, seed.minute, 0, 0);

  const distanceKm = Math.round(routeDistanceKm(route) * seed.fraction * 10) / 10;
  const durationMin = Math.round(route.typicalDurationMin * seed.fraction);
  const fareInr = Math.max(10, Math.round((route.fareInr * seed.fraction) / 5) * 5);

  return {
    id: `T-${String(index + 1).padStart(3, '0')}`,
    date: date.toISOString(),
    routeId: route.id,
    busId: bus.id,
    registration: bus.registration,
    from: stopName(seed.fromStopId),
    to: stopName(seed.toStopId),
    durationMin,
    distanceKm,
    fareInr,
    co2SavedKg: co2SavedKg(bus.fuel, distanceKm),
    fuel: bus.fuel,
    reviewed: seed.reviewed ?? false,
  };
}

export const TRIPS: TripRecord[] = SEEDS.map(buildTrip).sort(
  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
);

export interface ImpactSummary {
  trips: number;
  distanceKm: number;
  co2SavedKg: number;
  fareInr: number;
  minutesTravelled: number;
  /** Share of trips taken on electric, CNG or hybrid vehicles, 0–1. */
  cleanFuelShare: number;
}

export function summarise(trips: TripRecord[]): ImpactSummary {
  const clean = trips.filter((t) => t.fuel !== 'diesel').length;
  return {
    trips: trips.length,
    distanceKm: Math.round(trips.reduce((s, t) => s + t.distanceKm, 0) * 10) / 10,
    co2SavedKg: Math.round(trips.reduce((s, t) => s + t.co2SavedKg, 0) * 10) / 10,
    fareInr: trips.reduce((s, t) => s + t.fareInr, 0),
    minutesTravelled: trips.reduce((s, t) => s + t.durationMin, 0),
    cleanFuelShare: trips.length === 0 ? 0 : clean / trips.length,
  };
}

/** Trips inside the last `days` days. */
export function tripsWithin(trips: TripRecord[], days: number): TripRecord[] {
  const cutoff = Date.now() - days * 86_400_000;
  return trips.filter((t) => new Date(t.date).getTime() >= cutoff);
}
