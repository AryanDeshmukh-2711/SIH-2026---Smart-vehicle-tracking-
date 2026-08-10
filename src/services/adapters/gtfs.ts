/**
 * GTFS / GTFS-Realtime field mapping.
 *
 * Nothing in the app imports this at runtime today — it exists so the path from
 * a real feed to HimGati's domain types is written down and type-checked rather
 * than left as an intention. When the transport department publishes a feed,
 * these functions are the only new code required.
 */

import type { Confidence, EmissionNorm, FuelType, Occupancy, Route, Stop, TripStatus, VehiclePosition } from '@/types';
import { confidenceFromAge } from '@/lib/eta';

/* ------------------------------ GTFS static ------------------------------- */

/** A row of `stops.txt`. */
export interface GtfsStop {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
  location_type?: string;
  platform_code?: string;
  wheelchair_boarding?: string;
}

export function fromGtfsStop(row: GtfsStop, extras: Partial<Stop> = {}): Stop {
  return {
    id: row.stop_id,
    name: row.stop_name,
    nameHi: extras.nameHi ?? row.stop_name,
    kind: row.location_type === '1' ? 'isbt' : 'stop',
    town: extras.town ?? '',
    position: { lat: Number(row.stop_lat), lng: Number(row.stop_lon) },
    landmarks: extras.landmarks ?? [],
    platforms: row.platform_code ? [row.platform_code] : extras.platforms,
    amenities: extras.amenities ?? (row.wheelchair_boarding === '1' ? ['ramp'] : []),
    smsCode: extras.smsCode ?? row.stop_id.slice(-4),
    routeIds: extras.routeIds ?? [],
  };
}

/** A row of `routes.txt`, joined with `shapes.txt` and `stop_times.txt`. */
export interface GtfsRoute {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
  agency_id?: string;
}

export function fromGtfsRoute(
  row: GtfsRoute,
  shape: Route['shape'],
  stopIds: string[],
  distancesKm: number[],
  extras: Partial<Route> = {},
): Route {
  const [origin = '', destination = ''] = row.route_long_name.split(/→|-|—/).map((s) => s.trim());
  return {
    id: row.route_id,
    shortName: row.route_short_name,
    longName: row.route_long_name,
    origin: extras.origin ?? origin,
    destination: extras.destination ?? destination,
    category: extras.category ?? 'ordinary',
    operator: extras.operator ?? row.agency_id ?? 'HRTC',
    stopIds,
    shape,
    distancesKm,
    departures: extras.departures ?? [],
    fareInr: extras.fareInr ?? 0,
    typicalDurationMin: extras.typicalDurationMin ?? 0,
  };
}

/* ---------------------------- GTFS-Realtime ------------------------------- */

/** `transit_realtime.VehiclePosition`, decoded. */
export interface GtfsRtVehiclePosition {
  trip: { trip_id: string; route_id: string; schedule_relationship?: string };
  vehicle: { id: string; label?: string };
  position: { latitude: number; longitude: number; bearing?: number; speed?: number };
  /** POSIX seconds. */
  timestamp: number;
  current_stop_sequence?: number;
  occupancy_status?: string;
}

/** `transit_realtime.TripUpdate.StopTimeUpdate`, decoded. */
export interface GtfsRtTripUpdate {
  trip: { trip_id: string; schedule_relationship?: string };
  delay?: number;
  stop_time_update?: Array<{ stop_id: string; arrival?: { delay?: number; time?: number } }>;
}

const OCCUPANCY_MAP: Record<string, Occupancy> = {
  EMPTY: 'empty',
  MANY_SEATS_AVAILABLE: 'empty',
  FEW_SEATS_AVAILABLE: 'comfortable',
  STANDING_ROOM_ONLY: 'comfortable',
  CRUSHED_STANDING_ROOM_ONLY: 'full',
  FULL: 'full',
  NOT_ACCEPTING_PASSENGERS: 'full',
};

function statusFrom(scheduleRelationship: string | undefined, ageSec: number, delayMin: number): TripStatus {
  if (scheduleRelationship === 'CANCELED') return 'cancelled';
  if (ageSec >= 180) return 'signal-lost';
  if (delayMin >= 5) return 'delayed';
  return 'running';
}

/**
 * Fold a VehiclePosition and its TripUpdate into HimGati's `VehiclePosition`.
 *
 * Predictions are left empty here: this app derives them from feed age via
 * `predictionsFromStopTimeUpdates` below, because a raw TripUpdate carries no
 * confidence signal and the whole ETA contract (SRS §8.3) depends on one.
 */
export function fromGtfsRt(
  vp: GtfsRtVehiclePosition,
  update: GtfsRtTripUpdate | undefined,
  nowMs: number,
): Omit<VehiclePosition, 'predictions'> & { confidence: Confidence } {
  const ageSec = Math.max(0, nowMs / 1000 - vp.timestamp);
  const delayMin = Math.round((update?.delay ?? 0) / 60);

  return {
    busId: vp.vehicle.id,
    tripId: vp.trip.trip_id,
    routeId: vp.trip.route_id,
    position: { lat: vp.position.latitude, lng: vp.position.longitude },
    bearing: vp.position.bearing ?? 0,
    // GTFS-RT reports speed in m/s.
    speedKmph: Math.round((vp.position.speed ?? 0) * 3.6),
    recordedAt: new Date(vp.timestamp * 1000).toISOString(),
    ageSec: Math.round(ageSec),
    status: statusFrom(vp.trip.schedule_relationship ?? update?.trip.schedule_relationship, ageSec, delayMin),
    delayMin,
    occupancy: OCCUPANCY_MAP[vp.occupancy_status ?? ''] ?? 'unknown',
    nextStopIndex: vp.current_stop_sequence ?? 0,
    progressKm: 0,
    confidence: confidenceFromAge(ageSec),
  };
}

/* ------------------------- fleet registry (AIS-140) ----------------------- */

/**
 * Vehicle registration record as published by the state transport authority.
 * Fuel and emission norm come from the RC; when either is absent we infer from
 * the manufacturing year and the result must be flagged as estimated.
 */
export interface VahanRecord {
  registration_number: string;
  maker_model?: string;
  fuel_type?: string;
  emission_norm?: string;
  manufacturing_year: number;
  seating_capacity?: number;
}

const FUEL_MAP: Record<string, FuelType> = {
  ELECTRIC: 'electric',
  'BATTERY ELECTRIC': 'electric',
  CNG: 'cng',
  'CNG ONLY': 'cng',
  HYBRID: 'hybrid',
  DIESEL: 'diesel',
  'DIESEL/HYBRID': 'hybrid',
};

/** Norms became mandatory nationwide on these dates — the basis for any guess. */
export function inferNorm(year: number): { norm: EmissionNorm; estimated: true } {
  if (year >= 2020) return { norm: 'BS-VI', estimated: true };
  if (year >= 2010) return { norm: 'BS-IV', estimated: true };
  return { norm: 'BS-III', estimated: true };
}

export function fromVahan(rec: VahanRecord): {
  fuel: FuelType;
  norm: EmissionNorm;
  year: number;
  seats: number;
  estimated: boolean;
} {
  const fuel = FUEL_MAP[(rec.fuel_type ?? '').toUpperCase()];
  const declaredNorm = (rec.emission_norm ?? '').toUpperCase().replace(/\s/g, '');
  const normLookup: Record<string, EmissionNorm> = {
    BSVI: 'BS-VI',
    BS6: 'BS-VI',
    BSIV: 'BS-IV',
    BS4: 'BS-IV',
    BSIII: 'BS-III',
    BS3: 'BS-III',
  };
  const norm = normLookup[declaredNorm];
  const inferred = inferNorm(rec.manufacturing_year);

  return {
    fuel: fuel ?? 'diesel',
    norm: fuel === 'electric' ? 'zero-tailpipe' : (norm ?? inferred.norm),
    year: rec.manufacturing_year,
    seats: rec.seating_capacity ?? 40,
    estimated: !fuel || !norm,
  };
}
