/**
 * Outbound realtime events.
 *
 * Kept separate from socket setup so the ingestion pipeline can publish without
 * importing the server — and so it degrades quietly to a no-op when no Socket.IO
 * instance is attached (the seed script and tests import the same pipeline).
 */

import type { Server } from 'socket.io';
import type { StopPrediction } from '@himgati/shared';
import { ageSecOf, effectiveStatus, type LiveVehicle } from '../state/live.ts';

let io: Server | null = null;

export function attachRealtime(server: Server): void {
  io = server;
}

/** Room naming. Clients subscribe to a route or a single vehicle, never the fleet. */
export const rooms = {
  route: (routeId: string) => `route:${routeId}`,
  bus: (busId: string) => `bus:${busId}`,
  fleet: 'fleet',
} as const;

export interface VehicleEvent {
  busId: string;
  routeId: string;
  tripId: string | null;
  position: { lat: number; lng: number };
  bearing: number;
  speedKmph: number;
  progressKm: number;
  nextStopIndex: number;
  recordedAt: string;
  ageSec: number;
  status: string;
  delayMin: number;
  occupancy: string;
  lastSeenStopName: string | null;
  predictions: StopPrediction[];
}

export function toVehicleEvent(v: LiveVehicle, predictions: StopPrediction[]): VehicleEvent {
  const now = Date.now();
  return {
    busId: v.busId,
    routeId: v.routeId,
    tripId: v.tripId,
    // The matched position is what gets drawn — the raw fix is history's problem.
    position: { lat: v.matchedLat, lng: v.matchedLng },
    bearing: v.bearing,
    speedKmph: v.speedKmph,
    progressKm: v.progressKm,
    nextStopIndex: v.nextStopIndex,
    recordedAt: v.recordedAt,
    ageSec: Math.round(ageSecOf(v, now)),
    status: effectiveStatus(v, now),
    delayMin: v.delayMin,
    occupancy: v.occupancy,
    lastSeenStopName: v.lastSeenStopName,
    predictions,
  };
}

/**
 * Fan a vehicle update out to the rooms that care about it.
 *
 * Deliberately not a global broadcast: with 5,000 vehicles, pushing every
 * position to every client would blow past the SRS's 5 MB/hour data budget in
 * minutes. A client watching one corridor receives only that corridor.
 */
export function broadcastVehicle(v: LiveVehicle, predictions: StopPrediction[]): void {
  if (!io) return;
  const event = toVehicleEvent(v, predictions);

  io.to(rooms.route(v.routeId)).emit('bus:location', event);
  io.to(rooms.bus(v.busId)).emit('bus:location', event);
  io.to(rooms.fleet).emit('bus:location', event);
}

export function broadcastAlert(alert: unknown, routeId?: string): void {
  if (!io) return;
  if (routeId) io.to(rooms.route(routeId)).emit('route:alert', alert);
  io.to(rooms.fleet).emit('route:alert', alert);
}
