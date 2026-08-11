/**
 * PostGIS queries.
 *
 * These are raw on purpose. Map-matching a GPS fix to a road alignment and
 * finding stops within a radius are exactly the operations PostGIS exists for,
 * and expressing them through an ORM would mean pulling every candidate row into
 * Node and doing the geometry by hand.
 */

import type { LatLng } from '@himgati/shared';
import { prisma } from './prisma.ts';

/* ------------------------------ map matching ------------------------------ */

export interface RouteMatch {
  /** Distance travelled along the route, in published road km. */
  progressKm: number;
  /** 0–1 position along the shape. */
  fraction: number;
  /** The raw fix snapped onto the road alignment (SRS FR-4). */
  matched: LatLng;
  /** How far the raw fix sat from the alignment, metres. */
  offsetM: number;
}

interface MatchRow {
  fraction: number;
  offset_m: number;
  matched_lat: number;
  matched_lng: number;
  distance_km: number;
}

/**
 * Snap a raw GPS fix onto a route's alignment and report how far along it is.
 *
 * `ST_LineLocatePoint` returns a fraction of the *shape*, which is a simplified
 * polyline. Multiplying by the route's published road distance rescales that to
 * real kilometres — the shape is coarse, but the distance table is not, and
 * every ETA downstream depends on this number being in real units.
 */
export async function matchToRoute(
  routeId: string,
  fix: LatLng,
): Promise<RouteMatch | null> {
  const rows = await prisma.$queryRaw<MatchRow[]>`
    WITH p AS (SELECT ST_SetSRID(ST_MakePoint(${fix.lng}, ${fix.lat}), 4326) AS pt)
    SELECT
      ST_LineLocatePoint(r.shape, p.pt)                                     AS fraction,
      ST_Distance(r.shape::geography, p.pt::geography)                      AS offset_m,
      ST_Y(ST_LineInterpolatePoint(r.shape, ST_LineLocatePoint(r.shape, p.pt))) AS matched_lat,
      ST_X(ST_LineInterpolatePoint(r.shape, ST_LineLocatePoint(r.shape, p.pt))) AS matched_lng,
      r.distance_km                                                          AS distance_km
    FROM routes r, p
    WHERE r.id = ${routeId} AND r.shape IS NOT NULL
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    fraction: row.fraction,
    progressKm: Math.round(row.fraction * row.distance_km * 100) / 100,
    matched: { lat: row.matched_lat, lng: row.matched_lng },
    offsetM: Math.round(row.offset_m),
  };
}

/**
 * Which of a set of routes best explains a fix — used when a device reports
 * without declaring its route.
 */
export async function inferRoute(fix: LatLng, maxOffsetM: number): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH p AS (SELECT ST_SetSRID(ST_MakePoint(${fix.lng}, ${fix.lat}), 4326) AS pt)
    SELECT r.id
    FROM routes r, p
    WHERE r.shape IS NOT NULL
      AND ST_DWithin(r.shape::geography, p.pt::geography, ${maxOffsetM})
    ORDER BY ST_Distance(r.shape::geography, p.pt::geography) ASC
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

/* ------------------------------ nearby stops ------------------------------ */

export interface NearbyStopRow {
  id: string;
  name: string;
  town: string;
  kind: string;
  lat: number;
  lng: number;
  sms_code: string;
  distance_m: number;
}

/** Stops within a radius, nearest first (SRS FR-17). Uses the GiST index. */
export function nearbyStops(fix: LatLng, radiusM = 2000, limit = 8) {
  return prisma.$queryRaw<NearbyStopRow[]>`
    WITH p AS (SELECT ST_SetSRID(ST_MakePoint(${fix.lng}, ${fix.lat}), 4326) AS pt)
    SELECT s.id, s.name, s.town, s.kind::text AS kind, s.lat, s.lng, s.sms_code,
           ST_Distance(s.geom::geography, p.pt::geography) AS distance_m
    FROM stops s, p
    WHERE s.geom IS NOT NULL
      AND ST_DWithin(s.geom::geography, p.pt::geography, ${radiusM})
    ORDER BY s.geom <-> p.pt
    LIMIT ${limit}
  `;
}

/* -------------------------------- shapes ---------------------------------- */

/** Route alignment as an ordered coordinate list, for drawing on the client. */
export async function routeShape(routeId: string): Promise<LatLng[]> {
  const rows = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
    SELECT ST_Y(geom) AS lat, ST_X(geom) AS lng
    FROM (
      SELECT (ST_DumpPoints(shape)).geom AS geom, (ST_DumpPoints(shape)).path[1] AS ord
      FROM routes WHERE id = ${routeId} AND shape IS NOT NULL
    ) pts
    ORDER BY ord
  `;
  return rows.map((r) => ({ lat: r.lat, lng: r.lng }));
}

/** Every route shape in one query — the client needs all of them to draw the map. */
export async function allRouteShapes(): Promise<Record<string, LatLng[]>> {
  const rows = await prisma.$queryRaw<Array<{ route_id: string; lat: number; lng: number; ord: number }>>`
    SELECT r.id AS route_id,
           ST_Y((ST_DumpPoints(r.shape)).geom) AS lat,
           ST_X((ST_DumpPoints(r.shape)).geom) AS lng,
           (ST_DumpPoints(r.shape)).path[1]    AS ord
    FROM routes r
    WHERE r.shape IS NOT NULL
    ORDER BY r.id, ord
  `;

  const out: Record<string, LatLng[]> = {};
  for (const row of rows) {
    (out[row.route_id] ??= []).push({ lat: row.lat, lng: row.lng });
  }
  return out;
}
