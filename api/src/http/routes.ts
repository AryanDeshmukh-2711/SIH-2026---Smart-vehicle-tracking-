/**
 * REST surface, versioned under /api/v1.
 *
 * The split mirrors GTFS: `/bundle` is the static half (routes, stops,
 * timetables) that a client caches and can run offline from, and the realtime
 * half arrives over Socket.IO. That is why the bundle is one request rather than
 * a dozen — a client on a weak hill connection should pay for one round trip,
 * not fifteen.
 */

import { Router } from 'express';
import { z } from 'zod';
import { greenScore } from '@himgati/shared';
import type { Bus } from '@himgati/shared';
import { network } from '../state/network.ts';
import { nearbyStops } from '../db/geo.ts';
import {
  ageSecOf,
  effectiveStatus,
  getAllLive,
  getCachedEta,
  getLive,
  getRouteLive,
} from '../state/live.ts';
import { toVehicleEvent } from '../realtime/publish.ts';
import { ingestStats } from '../services/gps/ingest.ts';
import { prisma } from '../db/prisma.ts';
import { redis } from '../db/redis.ts';

export const api = Router();

/* -------------------------------- helpers --------------------------------- */

const ok = <T>(data: T) => ({ data, error: null });
const fail = (message: string) => ({ data: null, error: { message } });

/** Vehicle enriched with its live state and computed Green Score. */
async function vehicleView(busId: string) {
  const bus = network.bus(busId);
  if (!bus) return null;

  const live = await getLive(busId);
  const predictions = live?.tripId ? ((await getCachedEta(live.tripId)) ?? []) : [];

  return {
    bus: { ...bus, greenScore: greenScore(bus as unknown as Bus) },
    route: network.route(bus.routeId) ?? null,
    live: live ? toVehicleEvent(live, predictions) : null,
  };
}

/* --------------------------------- health --------------------------------- */

api.get('/health', async (_req, res) => {
  const checks = { database: false, redis: false, network: network.isLoaded() };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    /* reported as false */
  }
  try {
    checks.redis = (await redis.ping()) === 'PONG';
  } catch {
    /* reported as false */
  }

  const healthy = checks.database && checks.redis && checks.network;
  res.status(healthy ? 200 : 503).json(
    ok({
      status: healthy ? 'healthy' : 'degraded',
      checks,
      // Surfaced so a feed that is silently rejecting everything is visible.
      gps: ingestStats,
      uptimeSec: Math.round(process.uptime()),
    }),
  );
});

/* --------------------------- GTFS-static-style bundle --------------------- */

api.get('/bundle', (_req, res) => {
  res.json(
    ok({
      generatedAt: new Date().toISOString(),
      loadedAt: network.loadedAt().toISOString(),
      stops: network.stops(),
      routes: network.routes(),
      buses: network.buses().map((b) => ({
        ...b,
        greenScore: greenScore(b as unknown as Bus),
      })),
    }),
  );
});

/* --------------------------------- stops ---------------------------------- */

api.get('/stops', (_req, res) => res.json(ok(network.stops())));

api.get('/stops/nearby', async (req, res) => {
  const query = z
    .object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      radius: z.coerce.number().int().min(50).max(20_000).default(2000),
      limit: z.coerce.number().int().min(1).max(50).default(8),
    })
    .safeParse(req.query);

  if (!query.success) return res.status(400).json(fail(query.error.issues[0].message));

  const { lat, lng, radius, limit } = query.data;
  const rows = await nearbyStops({ lat, lng }, radius, limit);

  return res.json(
    ok(
      rows.map((r) => ({
        stop: network.stop(r.id) ?? null,
        distanceM: Math.round(r.distance_m),
        routes: network.routesServingStop(r.id).map((rt) => rt.shortName),
      })),
    ),
  );
});

api.get('/stops/:stopId', (req, res) => {
  const stop = network.stop(req.params.stopId);
  if (!stop) return res.status(404).json(fail('stop not found'));
  return res.json(
    ok({ ...stop, routes: network.routesServingStop(stop.id) }),
  );
});

/** Live arrivals board for a stop — the screen this whole system exists for. */
api.get('/stops/:stopId/departures', async (req, res) => {
  const stop = network.stop(req.params.stopId);
  if (!stop) return res.status(404).json(fail('stop not found'));

  const live = await getAllLive();
  const now = Date.now();
  const board = [];

  for (const vehicle of live) {
    if (effectiveStatus(vehicle, now) === 'cancelled') continue;

    const predictions = vehicle.tripId ? ((await getCachedEta(vehicle.tripId)) ?? []) : [];
    const prediction = predictions.find((p) => p.stopId === stop.id);
    if (!prediction) continue;

    const bus = network.bus(vehicle.busId);
    board.push({
      prediction,
      vehicle: toVehicleEvent(vehicle, predictions),
      bus: bus ? { ...bus, greenScore: greenScore(bus as unknown as Bus) } : null,
      route: network.route(vehicle.routeId) ?? null,
    });
  }

  board.sort((a, b) => a.prediction.etaMin - b.prediction.etaMin);
  return res.json(ok(board));
});

/* --------------------------------- routes --------------------------------- */

api.get('/routes', (_req, res) => res.json(ok(network.routes())));

api.get('/routes/:routeId', (req, res) => {
  const route = network.route(req.params.routeId);
  if (!route) return res.status(404).json(fail('route not found'));
  return res.json(
    ok({ ...route, stops: route.stopIds.map((id) => network.stop(id) ?? null) }),
  );
});

api.get('/routes/:routeId/live', async (req, res) => {
  const route = network.route(req.params.routeId);
  if (!route) return res.status(404).json(fail('route not found'));

  const live = await getRouteLive(route.id);
  const out = await Promise.all(
    live.map(async (v) => {
      const predictions = v.tripId ? ((await getCachedEta(v.tripId)) ?? []) : [];
      return toVehicleEvent(v, predictions);
    }),
  );
  return res.json(ok(out));
});

/* --------------------------------- alerts --------------------------------- */

/** Postgres enum labels back to the wire values the client's types use. */
const ALERT_KIND_OUT: Record<string, string> = {
  route_change: 'route-change',
  road_closure: 'road-closure',
  stop_change: 'stop-change',
};

api.get('/alerts', async (req, res) => {
  const query = z
    .object({
      routeId: z.string().optional(),
      stopId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .safeParse(req.query);

  if (!query.success) return res.status(400).json(fail(query.error.issues[0].message));
  const { routeId, stopId, limit } = query.data;

  const rows = await prisma.alert.findMany({
    where: {
      ...(routeId ? { routeId } : {}),
      ...(stopId ? { stopIds: { has: stopId } } : {}),
      // Expired disruptions are history, not something to show a traveller.
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { issuedAt: 'desc' },
    take: limit,
  });

  return res.json(
    ok(
      rows.map((a) => ({
        id: a.id,
        kind: ALERT_KIND_OUT[a.kind] ?? a.kind,
        severity: a.severity,
        title: a.title,
        body: a.body,
        affectedRouteIds: a.routeId ? [a.routeId] : [],
        affectedStopIds: a.stopIds,
        issuedAt: a.issuedAt.toISOString(),
        source: a.source,
        // Whether *you* have seen it is client state, not a property of the alert.
        read: false,
      })),
    ),
  );
});

/* --------------------------------- buses ---------------------------------- */

api.get('/buses/live', async (_req, res) => {
  const live = await getAllLive();
  const out = await Promise.all(
    live.map(async (v) => {
      const predictions = v.tripId ? ((await getCachedEta(v.tripId)) ?? []) : [];
      return toVehicleEvent(v, predictions);
    }),
  );
  return res.json(ok(out));
});

api.get('/buses/:busId', async (req, res) => {
  const view = await vehicleView(req.params.busId);
  if (!view) {
    // Accept a registration too — passengers read the plate, not our ids.
    const byReg = network.busByRegistration(req.params.busId);
    if (!byReg) return res.status(404).json(fail('vehicle not found'));
    return res.json(ok(await vehicleView(byReg.id)));
  }
  return res.json(ok(view));
});

api.get('/buses/:busId/eta', async (req, res) => {
  const bus = network.bus(req.params.busId) ?? network.busByRegistration(req.params.busId);
  if (!bus) return res.status(404).json(fail('vehicle not found'));

  const live = await getLive(bus.id);
  if (!live) return res.json(ok({ predictions: [], reason: 'vehicle not currently reporting' }));

  const predictions = live.tripId ? ((await getCachedEta(live.tripId)) ?? []) : [];
  return res.json(
    ok({
      predictions,
      ageSec: Math.round(ageSecOf(live)),
      status: effectiveStatus(live),
      lastSeenStopName: live.lastSeenStopName,
    }),
  );
});
