/**
 * Depot and administration endpoints (SRS FR-39..43).
 *
 * The audience here is a depot manager with a fleet to run and a transport
 * authority that needs to see whether it is being run well. So the emphasis is
 * on the two things they actually act on — what is wrong right now, and what has
 * been wrong lately — rather than on exhaustive CRUD.
 *
 * Every mutation writes an audit entry. An authority that cannot answer "who
 * cancelled that service?" has no oversight at all.
 */

import { Router } from 'express';
import { z } from 'zod';
import { greenScore } from '@himgati/shared';
import type { Bus } from '@himgati/shared';
import { prisma } from '../db/prisma.ts';
import { logger } from '../config/logger.ts';
import { network, refreshNetwork } from '../state/network.ts';
import { ageSecOf, effectiveStatus, getAllLive, getCachedEta } from '../state/live.ts';
import { toVehicleEvent, broadcastAlert } from '../realtime/publish.ts';
import { requireAuth, requireRole, ADMIN_ROLES } from './middleware/auth.ts';
import { recordAudit } from '../services/audit.ts';
import { ingestStatus } from '../services/ops/status.ts';

export const admin = Router();

const log = logger.child({ module: 'admin' });

const ok = <T>(data: T) => ({ data, error: null });
const fail = (message: string) => ({ data: null, error: { message } });

admin.use(requireAuth, requireRole(...ADMIN_ROLES));

/* -------------------------------- overview -------------------------------- */

admin.get('/overview', async (_req, res) => {
  const live = await getAllLive();
  const now = Date.now();

  const byStatus = { running: 0, delayed: 0, cancelled: 0, signalLost: 0, scheduled: 0 };
  for (const v of live) {
    const status = effectiveStatus(v, now);
    if (status === 'running') byStatus.running++;
    else if (status === 'delayed') byStatus.delayed++;
    else if (status === 'cancelled') byStatus.cancelled++;
    else if (status === 'signal-lost') byStatus.signalLost++;
    else if (status === 'scheduled') byStatus.scheduled++;
  }

  const fleet = network.buses();
  // A vehicle in the master that is not reporting at all is a different problem
  // to one that dropped out mid-route, and a depot handles them differently.
  const reporting = new Set(live.map((v) => v.busId));
  const offline = fleet.filter((b) => !reporting.has(b.id)).length;

  const cleanFleet = fleet.filter((b) => b.fuel !== 'diesel').length;
  const [openAlerts, tripsToday] = await Promise.all([
    prisma.alert.count({ where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    prisma.trip.count({ where: { startedAt: { gte: startOfToday() } } }),
  ]);

  return res.json(
    ok({
      fleet: {
        total: fleet.length,
        reporting: live.length,
        offline,
        cleanFuelShare: fleet.length ? cleanFleet / fleet.length : 0,
        averageGreenScore: fleet.length
          ? Math.round(fleet.reduce((s, b) => s + greenScore(b as unknown as Bus), 0) / fleet.length)
          : 0,
      },
      services: byStatus,
      network: { routes: network.routes().length, stops: network.stops().length },
      openAlerts,
      tripsToday,
    }),
  );
});

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ------------------------------- fleet map -------------------------------- */

admin.get('/fleet', async (_req, res) => {
  const live = await getAllLive();

  const rows = await Promise.all(
    live.map(async (v) => {
      const predictions = v.tripId ? ((await getCachedEta(v.tripId)) ?? []) : [];
      const bus = network.bus(v.busId);
      const route = network.route(v.routeId);
      return {
        vehicle: toVehicleEvent(v, predictions),
        bus: bus ? { ...bus, greenScore: greenScore(bus as unknown as Bus) } : null,
        route: route ? { id: route.id, shortName: route.shortName, longName: route.longName } : null,
        ageSec: Math.round(ageSecOf(v)),
      };
    }),
  );

  // Worst first: a depot wants the problems at the top of the list.
  const rank = { cancelled: 0, 'signal-lost': 1, delayed: 2, running: 3, scheduled: 4, ended: 5 };
  rows.sort(
    (a, b) =>
      (rank[a.vehicle.status as keyof typeof rank] ?? 9) -
      (rank[b.vehicle.status as keyof typeof rank] ?? 9),
  );

  return res.json(ok(rows));
});

/* ------------------------------- punctuality ------------------------------ */

/**
 * On-time performance per route (FR-41).
 *
 * Measured from the delay recorded against each trip. "On time" is under five
 * minutes late, matching the threshold the passenger app uses to badge a service
 * as delayed — a report that used a different definition to the app would be
 * indefensible in a review meeting.
 */
admin.get('/reports/punctuality', async (req, res) => {
  const query = z
    .object({ days: z.coerce.number().int().min(1).max(90).default(7) })
    .safeParse(req.query);
  if (!query.success) return res.status(400).json(fail(query.error.issues[0].message));

  const since = new Date(Date.now() - query.data.days * 86_400_000);

  const trips = await prisma.trip.findMany({
    where: { createdAt: { gte: since } },
    select: { routeId: true, delayMin: true, status: true },
  });

  const byRoute = new Map<string, { total: number; onTime: number; late: number; cancelled: number; delaySum: number }>();

  for (const t of trips) {
    const row = byRoute.get(t.routeId) ?? { total: 0, onTime: 0, late: 0, cancelled: 0, delaySum: 0 };
    row.total++;
    if (t.status === 'cancelled') row.cancelled++;
    else if (t.delayMin >= 5) {
      row.late++;
      row.delaySum += t.delayMin;
    } else row.onTime++;
    byRoute.set(t.routeId, row);
  }

  const report = [...byRoute.entries()]
    .map(([routeId, r]) => {
      const route = network.route(routeId);
      return {
        routeId,
        shortName: route?.shortName ?? routeId,
        longName: route?.longName ?? '',
        trips: r.total,
        onTime: r.onTime,
        late: r.late,
        cancelled: r.cancelled,
        onTimePercent: r.total ? Math.round((r.onTime / r.total) * 100) : 0,
        averageLatenessMin: r.late ? Math.round(r.delaySum / r.late) : 0,
      };
    })
    .sort((a, b) => a.onTimePercent - b.onTimePercent);

  return res.json(ok({ sinceDays: query.data.days, routes: report }));
});

/* --------------------------------- alerts --------------------------------- */

const alertSchema = z.object({
  kind: z.enum(['delay', 'cancellation', 'route_change', 'road_closure', 'weather', 'stop_change']),
  severity: z.enum(['info', 'warning', 'severe']),
  title: z.string().trim().min(4).max(120),
  body: z.string().trim().min(4).max(1000),
  routeId: z.string().optional(),
  stopIds: z.array(z.string()).default([]),
  expiresInHours: z.number().min(0.5).max(720).optional(),
});

admin.post('/alerts', async (req, res) => {
  const parsed = alertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));
  const input = parsed.data;

  if (input.routeId && !network.route(input.routeId)) {
    return res.status(400).json(fail('unknown route'));
  }

  const alert = await prisma.alert.create({
    data: {
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      body: input.body,
      routeId: input.routeId ?? null,
      stopIds: input.stopIds,
      // Attributed to the person publishing it, because a passenger deciding
      // whether to act on a notice needs to know who is behind it.
      source: `${req.user!.name} · ${roleLabel(req.user!.role)}`,
      expiresAt: input.expiresInHours
        ? new Date(Date.now() + input.expiresInHours * 3_600_000)
        : null,
    },
  });

  broadcastAlert(alert, input.routeId);

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'alert.publish',
    entity: 'alert',
    entityId: alert.id,
    metadata: { severity: input.severity, routeId: input.routeId },
    ip: req.ip,
  });

  log.info({ alertId: alert.id, severity: input.severity }, 'alert published');
  return res.status(201).json(ok(alert));
});

admin.delete('/alerts/:alertId', async (req, res) => {
  const existing = await prisma.alert.findUnique({ where: { id: req.params.alertId } });
  if (!existing) return res.status(404).json(fail('alert not found'));

  // Expired rather than deleted: what was announced, and when it was withdrawn,
  // is exactly the sort of thing an authority asks about afterwards.
  await prisma.alert.update({
    where: { id: req.params.alertId },
    data: { expiresAt: new Date() },
  });

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'alert.withdraw',
    entity: 'alert',
    entityId: req.params.alertId,
    ip: req.ip,
  });

  return res.json(ok({ withdrawn: true }));
});

function roleLabel(role: string): string {
  return (
    {
      depot_manager: 'Depot Manager',
      admin: 'HRTC Administration',
      transport_authority: 'HP Transport Authority',
    }[role] ?? role
  );
}

/* --------------------------------- fleet ---------------------------------- */

admin.get('/buses', async (_req, res) => {
  const buses = await prisma.bus.findMany({ orderBy: { registration: 'asc' } });
  return res.json(
    ok(
      buses.map((b) => {
        const inNetwork = network.bus(b.id);
        return {
          ...b,
          greenScore: inNetwork ? greenScore(inNetwork as unknown as Bus) : null,
        };
      }),
    ),
  );
});

const busPatch = z.object({
  operator: z.string().trim().min(2).max(80).optional(),
  routeId: z.string().optional(),
  seats: z.number().int().min(1).max(120).optional(),
  wheelchairAccessible: z.boolean().optional(),
  active: z.boolean().optional(),
});

admin.patch('/buses/:busId', async (req, res) => {
  const parsed = busPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));

  if (parsed.data.routeId && !network.route(parsed.data.routeId)) {
    return res.status(400).json(fail('unknown route'));
  }

  const updated = await prisma.bus
    .update({ where: { id: req.params.busId }, data: parsed.data })
    .catch(() => null);

  if (!updated) return res.status(404).json(fail('vehicle not found'));

  // The in-memory graph is what the ETA engine reads, so it must be reloaded
  // or the change is invisible until the next restart.
  await refreshNetwork();

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'bus.update',
    entity: 'bus',
    entityId: updated.id,
    metadata: parsed.data,
    ip: req.ip,
  });

  return res.json(ok(updated));
});

/* --------------------------------- routes --------------------------------- */

admin.get('/routes', async (_req, res) => {
  const routes = await prisma.route.findMany({
    orderBy: { shortName: 'asc' },
    include: { _count: { select: { buses: true, routeStops: true } } },
  });
  return res.json(ok(routes));
});

const routePatch = z.object({
  fareInr: z.number().int().min(0).max(10_000).optional(),
  typicalDurationMin: z.number().int().min(1).max(2000).optional(),
  departures: z.array(z.string().regex(/^\d{2}:\d{2}$/)).optional(),
  active: z.boolean().optional(),
});

admin.patch('/routes/:routeId', async (req, res) => {
  const parsed = routePatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));

  const updated = await prisma.route
    .update({ where: { id: req.params.routeId }, data: parsed.data })
    .catch(() => null);

  if (!updated) return res.status(404).json(fail('route not found'));
  await refreshNetwork();

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'route.update',
    entity: 'route',
    entityId: updated.id,
    metadata: parsed.data,
    ip: req.ip,
  });

  return res.json(ok(updated));
});

/* ------------------------------- CSV import ------------------------------- */

/**
 * Bulk route upload (FR-43).
 *
 * Accepts a header row plus one line per route, stops as a pipe-separated list
 * of existing stop ids. The shape is derived from those stops' positions, which
 * gives a straight-line alignment between them — good enough to draw and to
 * measure progress along, and flagged in the response so nobody mistakes it for
 * a surveyed road geometry.
 */
const REQUIRED_COLUMNS = [
  'route_id',
  'short_name',
  'long_name',
  'category',
  'operator',
  'distance_km',
  'duration_min',
  'fare_inr',
  'departures',
  'stop_ids',
];

admin.post('/routes/import', async (req, res) => {
  const parsed = z.object({ csv: z.string().min(10) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail('provide a csv field'));

  const lines = parsed.data.csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return res.status(400).json(fail('csv needs a header row and at least one route'));

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    return res.status(400).json(fail(`missing columns: ${missing.join(', ')}`));
  }

  const imported: string[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const row = Object.fromEntries(header.map((h, idx) => [h, cells[idx] ?? '']));

    try {
      const stopIds = row.stop_ids.split('|').map((s) => s.trim()).filter(Boolean);
      const unknown = stopIds.filter((id) => !network.stop(id));

      if (stopIds.length < 2) throw new Error('a route needs at least two stops');
      if (unknown.length) throw new Error(`unknown stops: ${unknown.join(', ')}`);

      const distanceKm = Number(row.distance_km);
      const durationMin = Number(row.duration_min);
      if (!Number.isFinite(distanceKm) || distanceKm <= 0) throw new Error('distance_km must be positive');
      if (!Number.isFinite(durationMin) || durationMin <= 0) throw new Error('duration_min must be positive');

      const positions = stopIds.map((id) => network.stop(id)!.position);
      const data = {
        shortName: row.short_name,
        longName: row.long_name,
        origin: network.stop(stopIds[0])!.town,
        destination: network.stop(stopIds[stopIds.length - 1])!.town,
        category: (row.category || 'ordinary') as never,
        operator: row.operator || 'HRTC',
        distanceKm,
        typicalDurationMin: durationMin,
        fareInr: Number(row.fare_inr) || 0,
        departures: row.departures.split('|').map((d) => d.trim()).filter(Boolean),
      };

      await prisma.route.upsert({
        where: { id: row.route_id },
        create: { id: row.route_id, ...data },
        update: data,
      });

      const wkt = `LINESTRING(${positions.map((p) => `${p.lng} ${p.lat}`).join(',')})`;
      await prisma.$executeRaw`
        UPDATE routes SET shape = ST_GeomFromText(${wkt}, 4326) WHERE id = ${row.route_id}
      `;

      await prisma.routeStop.deleteMany({ where: { routeId: row.route_id } });
      await prisma.routeStop.createMany({
        data: stopIds.map((stopId, idx) => ({
          routeId: row.route_id,
          stopId,
          sequence: idx,
          // Distance apportioned evenly until a surveyed alignment replaces it.
          distanceKm: Math.round((idx / (stopIds.length - 1)) * distanceKm * 10) / 10,
        })),
      });

      imported.push(row.route_id);
    } catch (err) {
      errors.push({ line: i + 1, message: err instanceof Error ? err.message : 'invalid row' });
    }
  }

  if (imported.length) await refreshNetwork();

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'route.import',
    entity: 'route',
    metadata: { imported: imported.length, failed: errors.length },
    ip: req.ip,
  });

  return res.json(
    ok({
      imported,
      errors,
      note:
        imported.length > 0
          ? 'Shapes were derived by joining stop positions in order. Replace with surveyed alignments before relying on distance-based ETAs.'
          : undefined,
    }),
  );
});

/* --------------------------------- drivers -------------------------------- */

admin.get('/drivers', async (_req, res) => {
  const drivers = await prisma.user.findMany({
    where: { role: 'driver' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      employeeId: true,
      depot: true,
      active: true,
      lastLoginAt: true,
      _count: { select: { trips: true } },
    },
  });
  return res.json(ok(drivers));
});

admin.patch('/drivers/:driverId', async (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));

  const updated = await prisma.user
    .update({
      where: { id: req.params.driverId },
      data: { active: parsed.data.active },
      select: { id: true, name: true, active: true },
    })
    .catch(() => null);

  if (!updated) return res.status(404).json(fail('driver not found'));

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: parsed.data.active ? 'driver.activate' : 'driver.deactivate',
    entity: 'user',
    entityId: updated.id,
    ip: req.ip,
  });

  return res.json(ok(updated));
});

/* ------------------------------ cancel a trip ----------------------------- */

admin.post('/trips/:tripId/cancel', async (req, res) => {
  const reason = z
    .object({ reason: z.string().trim().max(200).default('Cancelled by the depot') })
    .safeParse(req.body ?? {});

  const trip = await prisma.trip.findUnique({
    where: { id: req.params.tripId },
    select: { id: true, busId: true, routeId: true },
  });
  if (!trip) return res.status(404).json(fail('trip not found'));

  await prisma.trip.update({ where: { id: trip.id }, data: { status: 'cancelled' } });
  await ingestStatus({ busId: trip.busId, cancelled: true, timestamp: Date.now() });

  const route = network.route(trip.routeId);
  const alert = await prisma.alert.create({
    data: {
      kind: 'cancellation',
      severity: 'severe',
      title: `${route?.shortName ?? 'Service'} cancelled`,
      body: reason.success ? reason.data.reason : 'Cancelled by the depot',
      routeId: trip.routeId,
      stopIds: route?.stopIds ?? [],
      source: `${req.user!.name} · ${roleLabel(req.user!.role)}`,
    },
  });

  broadcastAlert(alert, trip.routeId);

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'trip.cancel',
    entity: 'trip',
    entityId: trip.id,
    ip: req.ip,
  });

  return res.json(ok({ cancelled: true, alertId: alert.id }));
});

/* -------------------------------- audit log ------------------------------- */

admin.get('/audit', async (req, res) => {
  const query = z
    .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
    .safeParse(req.query);
  if (!query.success) return res.status(400).json(fail(query.error.issues[0].message));

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: query.data.limit,
  });

  const actorIds = [...new Set(entries.map((e) => e.actorId).filter(Boolean))] as string[];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));

  return res.json(
    ok(
      entries.map((e) => ({
        ...e,
        actorName: e.actorId ? (nameOf.get(e.actorId) ?? 'Unknown') : 'System',
        createdAt: e.createdAt.toISOString(),
      })),
    ),
  );
});
