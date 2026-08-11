/**
 * Operational status ingestion.
 *
 * Deliberately a separate channel from GPS. A vehicle tracker reports where it
 * is; it has no idea whether the service is running late, how full it is, or
 * whether the depot cancelled the trip. Those come from the operator — in the
 * SRS, from the driver app tapping "report delay", "update crowd" or
 * "breakdown" (FR-37). Mixing them into the position payload would mean
 * inventing telemetry that AIS-140 hardware does not produce.
 *
 * Topic: `him_gati/bus/{busId}/status`
 */

import type { Occupancy } from '@himgati/shared';
import { z } from 'zod';
import { logger } from '../../config/logger.ts';
import { prisma } from '../../db/prisma.ts';
import { network } from '../../state/network.ts';
import { getCachedEta, getLive, setLive, setOps, type LiveVehicle } from '../../state/live.ts';
import { broadcastVehicle } from '../../realtime/publish.ts';
import { invalidateTripCache } from '../gps/ingest.ts';

const log = logger.child({ module: 'ops' });

export const statusSchema = z.object({
  busId: z.string().min(1),
  /** Minutes behind schedule; negative means running early. */
  delayMin: z.number().int().min(-60).max(600).optional(),
  occupancy: z.enum(['empty', 'comfortable', 'full', 'unknown']).optional(),
  cancelled: z.boolean().optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
});

export type StatusReport = z.infer<typeof statusSchema>;

export const statusStats = { received: 0, applied: 0, rejected: 0 };

export async function ingestStatus(raw: unknown): Promise<void> {
  statusStats.received++;

  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) {
    statusStats.rejected++;
    log.debug({ issue: parsed.error.issues[0]?.message }, 'status report rejected');
    return;
  }

  const report = parsed.data;
  const bus = network.bus(report.busId) ?? network.busByRegistration(report.busId);
  if (!bus) {
    statusStats.rejected++;
    return;
  }

  const route = network.route(bus.routeId);
  if (!route) {
    statusStats.rejected++;
    return;
  }

  /* ------------------------------ persist ------------------------------- */

  const trip = await prisma.trip.findFirst({
    where: {
      busId: bus.id,
      status: { in: ['scheduled', 'running', 'delayed', 'signal_lost', 'cancelled'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, delayMin: true, status: true },
  });

  if (trip) {
    const nextStatus = report.cancelled
      ? 'cancelled'
      : (report.delayMin ?? 0) >= 5
        ? 'delayed'
        : 'running';

    if (trip.delayMin !== (report.delayMin ?? trip.delayMin) || trip.status !== nextStatus) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { delayMin: report.delayMin ?? trip.delayMin, status: nextStatus },
      });
      // The GPS path caches the trip for 15s; without this it would keep
      // applying the old delay to every incoming position.
      invalidateTripCache(bus.id);
    }
  }

  /* ---------------------------- update live ----------------------------- */

  // Written to its own key, never merged into the position record — the GPS
  // handler may be mid-flight with a copy of that record right now.
  await setOps(bus.id, {
    delayMin: report.delayMin,
    occupancy: report.occupancy as Occupancy | undefined,
    cancelled: report.cancelled,
  });

  statusStats.applied++;

  const existing = await getLive(bus.id);

  if (existing) {
    // Re-broadcast with the predictions already computed for this trip, rather
    // than an empty list — a status update must not blank out the arrival board.
    const predictions = existing.tripId ? ((await getCachedEta(existing.tripId)) ?? []) : [];
    broadcastVehicle(existing, report.cancelled ? [] : predictions);
    return;
  }

  // A cancelled service publishes no GPS — there is nothing to track. But it
  // must still be *visible*: a passenger waiting for the 16:30 needs to be told
  // it is not coming, and an absent vehicle communicates nothing at all. So it
  // is surfaced at its origin with no predictions attached.
  if (report.cancelled) {
    const origin = network.stop(route.stopIds[0]);
    const cancelledVehicle: LiveVehicle = {
      busId: bus.id,
      tripId: trip?.id ?? null,
      routeId: route.id,
      lat: origin?.position.lat ?? 0,
      lng: origin?.position.lng ?? 0,
      matchedLat: origin?.position.lat ?? 0,
      matchedLng: origin?.position.lng ?? 0,
      bearing: 0,
      speedKmph: 0,
      progressKm: 0,
      nextStopIndex: 0,
      recordedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      status: 'cancelled',
      delayMin: 0,
      occupancy: 'unknown',
      lastSeenStopName: origin?.name ?? null,
    };

    await setLive(cancelledVehicle);
    broadcastVehicle(cancelledVehicle, []);
  }
}
