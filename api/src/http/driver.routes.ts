/**
 * Driver endpoints (SRS FR-34..38).
 *
 * The design constraint that shapes all of this: the driver is driving. Every
 * action is one tap, nothing needs typing, and nothing blocks on a response —
 * a breakdown report that fails because the tunnel ate the request is worse
 * than useless.
 *
 * Position reporting here is the SRS's stated fallback for when a vehicle's
 * AIS-140 box is missing or broken: the driver's phone becomes the tracker, and
 * its fixes go through exactly the same validation and map-matching as the
 * hardware feed.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.ts';
import { logger } from '../config/logger.ts';
import { network } from '../state/network.ts';
import { requireAuth, requireRole } from './middleware/auth.ts';
import { ingestReading } from '../services/gps/ingest.ts';
import { ingestStatus } from '../services/ops/status.ts';
import { recordAudit } from '../services/audit.ts';
import { broadcastAlert } from '../realtime/publish.ts';
import { getLive } from '../state/live.ts';

export const driver = Router();

const log = logger.child({ module: 'driver' });

const ok = <T>(data: T) => ({ data, error: null });
const fail = (message: string) => ({ data: null, error: { message } });

// Everything here is driver-or-above. A depot manager can act on a trip too,
// because someone has to when a driver's phone dies mid-route.
driver.use(requireAuth, requireRole('driver', 'depot_manager', 'admin', 'transport_authority'));

/** A trip the caller is allowed to touch. */
async function ownedTrip(tripId: string, userId: string, role: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { id: true, busId: true, routeId: true, driverId: true, status: true, startedAt: true },
  });

  if (!trip) return { trip: null, allowed: false as const };
  // A driver may only act on their own trip; supervisors may act on any.
  const allowed = role !== 'driver' || trip.driverId === userId || trip.driverId === null;
  return { trip, allowed };
}

/* ------------------------------ assigned trips ---------------------------- */

driver.get('/trips', async (req, res) => {
  const trips = await prisma.trip.findMany({
    where: {
      driverId: req.user!.id,
      status: { in: ['scheduled', 'running', 'delayed', 'signal_lost'] },
    },
    orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }],
    select: {
      id: true,
      busId: true,
      routeId: true,
      scheduledAt: true,
      status: true,
      delayMin: true,
      startedAt: true,
    },
  });

  return res.json(
    ok(
      trips.map((t) => {
        const route = network.route(t.routeId);
        const bus = network.bus(t.busId);
        return {
          ...t,
          startedAt: t.startedAt?.toISOString() ?? null,
          route: route
            ? { id: route.id, shortName: route.shortName, longName: route.longName, stops: route.stopIds.length }
            : null,
          bus: bus ? { id: bus.id, registration: bus.registration, fuel: bus.fuel } : null,
        };
      }),
    ),
  );
});

/* ------------------------------ trip lifecycle ---------------------------- */

driver.post('/trips/:tripId/start', async (req, res) => {
  const { trip, allowed } = await ownedTrip(req.params.tripId, req.user!.id, req.user!.role);
  if (!trip) return res.status(404).json(fail('trip not found'));
  if (!allowed) return res.status(403).json(fail('this trip is assigned to another driver'));
  if (trip.startedAt) return res.status(409).json(fail('this trip has already started'));

  const updated = await prisma.trip.update({
    where: { id: trip.id },
    // Claim the trip if it was unassigned — whoever starts it owns it.
    data: {
      status: 'running',
      startedAt: new Date(),
      driverId: trip.driverId ?? req.user!.id,
    },
    select: { id: true, status: true, startedAt: true },
  });

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'trip.start',
    entity: 'trip',
    entityId: trip.id,
    metadata: { busId: trip.busId, routeId: trip.routeId },
    ip: req.ip,
  });

  log.info({ tripId: trip.id, driverId: req.user!.id }, 'trip started');
  return res.json(ok({ ...updated, startedAt: updated.startedAt?.toISOString() ?? null }));
});

driver.post('/trips/:tripId/end', async (req, res) => {
  const { trip, allowed } = await ownedTrip(req.params.tripId, req.user!.id, req.user!.role);
  if (!trip) return res.status(404).json(fail('trip not found'));
  if (!allowed) return res.status(403).json(fail('this trip is assigned to another driver'));

  const updated = await prisma.trip.update({
    where: { id: trip.id },
    data: { status: 'ended', endedAt: new Date() },
    select: { id: true, status: true, startedAt: true, endedAt: true },
  });

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'trip.end',
    entity: 'trip',
    entityId: trip.id,
    ip: req.ip,
  });

  log.info({ tripId: trip.id }, 'trip ended');
  return res.json(
    ok({
      ...updated,
      startedAt: updated.startedAt?.toISOString() ?? null,
      endedAt: updated.endedAt?.toISOString() ?? null,
    }),
  );
});

/* --------------------------- crowd level and delay ------------------------ */

const reportSchema = z.object({
  occupancy: z.enum(['empty', 'comfortable', 'full']).optional(),
  delayMin: z.number().int().min(0).max(600).optional(),
});

driver.post('/trips/:tripId/report', async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));

  const { trip, allowed } = await ownedTrip(req.params.tripId, req.user!.id, req.user!.role);
  if (!trip) return res.status(404).json(fail('trip not found'));
  if (!allowed) return res.status(403).json(fail('this trip is assigned to another driver'));

  // Straight onto the same operator channel the depot systems use, so there is
  // one path for "how full is it" regardless of who reported it.
  await ingestStatus({
    busId: trip.busId,
    occupancy: parsed.data.occupancy,
    delayMin: parsed.data.delayMin,
    timestamp: Date.now(),
  });

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'trip.report',
    entity: 'trip',
    entityId: trip.id,
    metadata: parsed.data,
    ip: req.ip,
  });

  return res.json(ok({ applied: true, ...parsed.data }));
});

/* -------------------------------- breakdown ------------------------------- */

const breakdownSchema = z.object({
  reason: z.string().trim().min(3).max(200).default('Vehicle breakdown'),
});

driver.post('/trips/:tripId/breakdown', async (req, res) => {
  const parsed = breakdownSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));

  const { trip, allowed } = await ownedTrip(req.params.tripId, req.user!.id, req.user!.role);
  if (!trip) return res.status(404).json(fail('trip not found'));
  if (!allowed) return res.status(403).json(fail('this trip is assigned to another driver'));

  const route = network.route(trip.routeId);
  const bus = network.bus(trip.busId);
  const live = await getLive(trip.busId);

  await prisma.trip.update({ where: { id: trip.id }, data: { status: 'cancelled' } });

  // A breakdown is a cancellation from the passenger's point of view, so it
  // goes out on the same channel the app already listens to.
  await ingestStatus({ busId: trip.busId, cancelled: true, timestamp: Date.now() });

  const alert = await prisma.alert.create({
    data: {
      kind: 'cancellation',
      severity: 'severe',
      title: `${route?.shortName ?? 'Service'} cancelled — vehicle breakdown`,
      body: `${bus?.registration ?? 'A vehicle'} on ${route?.longName ?? 'this route'} has broken down${
        live?.lastSeenStopName ? ` near ${live.lastSeenStopName}` : ''
      }. ${parsed.data.reason}. A replacement is being arranged.`,
      routeId: trip.routeId,
      stopIds: route?.stopIds ?? [],
      source: `Driver report · ${req.user!.name}`,
    },
  });

  broadcastAlert(alert, trip.routeId);

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'trip.breakdown',
    entity: 'trip',
    entityId: trip.id,
    metadata: { reason: parsed.data.reason },
    ip: req.ip,
  });

  log.warn({ tripId: trip.id, busId: trip.busId }, 'breakdown reported');
  return res.json(ok({ cancelled: true, alertId: alert.id }));
});

/* ----------------------------------- SOS ---------------------------------- */

const sosSchema = z.object({
  tripId: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  note: z.string().trim().max(200).optional(),
});

/**
 * Emergency. Never fails validation into a dead end — if the payload is odd we
 * still raise the alarm, because the one situation where this is pressed is the
 * one where a 400 is unforgivable.
 */
driver.post('/sos', async (req, res) => {
  const parsed = sosSchema.safeParse(req.body ?? {});
  const payload = parsed.success ? parsed.data : {};

  const trip = payload.tripId
    ? await prisma.trip.findUnique({
        where: { id: payload.tripId },
        select: { id: true, busId: true, routeId: true },
      })
    : await prisma.trip.findFirst({
        where: { driverId: req.user!.id, status: { in: ['running', 'delayed', 'signal_lost'] } },
        select: { id: true, busId: true, routeId: true },
      });

  const bus = trip ? network.bus(trip.busId) : null;
  const live = trip ? await getLive(trip.busId) : null;
  const position = payload.lat && payload.lng
    ? { lat: payload.lat, lng: payload.lng }
    : live
      ? { lat: live.matchedLat, lng: live.matchedLng }
      : null;

  const alert = await prisma.alert.create({
    data: {
      kind: 'cancellation',
      severity: 'severe',
      title: `SOS from ${bus?.registration ?? 'a vehicle'}`,
      body: `Emergency reported by ${req.user!.name}${
        live?.lastSeenStopName ? ` near ${live.lastSeenStopName}` : ''
      }.${position ? ` Last known position ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}.` : ''}${
        payload.note ? ` Note: ${payload.note}` : ''
      }`,
      routeId: trip?.routeId ?? null,
      stopIds: [],
      source: `SOS · ${req.user!.name}`,
    },
  });

  broadcastAlert(alert, trip?.routeId);

  await recordAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'driver.sos',
    entity: 'trip',
    entityId: trip?.id ?? null,
    metadata: { position, note: payload.note },
    ip: req.ip,
  });

  log.error({ driverId: req.user!.id, tripId: trip?.id, position }, 'SOS RAISED');

  return res.json(ok({ raised: true, alertId: alert.id, notifiedDepot: true }));
});

/* ---------------------------- position reporting -------------------------- */

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKmph: z.number().min(0).max(200).optional(),
  heading: z.number().min(0).max(360).optional(),
  accuracyM: z.number().min(0).max(10_000).optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
});

/**
 * The driver's phone as a backup tracker.
 *
 * The SRS lists "GPS box missing or broken" as a live risk and names this as the
 * mitigation. These fixes go through the identical validation, map-matching and
 * prediction path as the hardware feed — the pipeline neither knows nor cares
 * which source a position came from.
 */
driver.post('/trips/:tripId/location', async (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail(parsed.error.issues[0].message));

  const { trip, allowed } = await ownedTrip(req.params.tripId, req.user!.id, req.user!.role);
  if (!trip) return res.status(404).json(fail('trip not found'));
  if (!allowed) return res.status(403).json(fail('this trip is assigned to another driver'));

  const outcome = await ingestReading({
    busId: trip.busId,
    tripId: trip.id,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    speedKmph: parsed.data.speedKmph ?? 0,
    heading: parsed.data.heading ?? 0,
    accuracyM: parsed.data.accuracyM ?? 20,
    timestamp: parsed.data.timestamp ?? Date.now(),
  });

  // A rejected fix is not a client error — the phone did its job, the reading
  // just was not trustworthy. Report it so the app can show signal quality.
  return res.json(ok({ accepted: outcome.accepted, reason: outcome.reason ?? null }));
});
