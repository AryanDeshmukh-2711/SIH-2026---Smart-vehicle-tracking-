/**
 * Live fleet store.
 *
 * Exposes the same `subscribe` / `getSnapshot` pair the built-in simulator did,
 * so every screen and hook is unchanged — but the data now arrives from the
 * backend over Socket.IO, where positions have been validated, map-matched
 * against PostGIS and had their ETA confidence computed server-side.
 *
 * If the backend is unreachable it falls back to the client-side simulator. That
 * is not a developer convenience: in the region this app targets, "the server is
 * not reachable right now" is a normal operating condition, and the map going
 * blank would be the wrong answer.
 */

import { io, type Socket } from 'socket.io-client';
import type { LiveBus, Occupancy, StopPrediction, TripStatus } from '@/types';
import { greenScore } from '@/lib/green';
import { BUS_BY_ID } from '@/data/buses';
import { ROUTE_BY_ID } from '@/data/routes';
import { simulator } from '@/services/simulation/simulator';

/** Wire shape emitted by the API's `bus:location` event. */
interface VehicleEvent {
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
  status: TripStatus;
  delayMin: number;
  occupancy: Occupancy;
  lastSeenStopName: string | null;
  predictions: StopPrediction[];
}

export type LiveSource = 'connecting' | 'live' | 'offline';

const vehicles = new Map<string, LiveBus>();
const listeners = new Set<() => void>();

let socket: Socket | null = null;
let source: LiveSource = 'connecting';
let snapshot: LiveBus[] = [];
let simUnsubscribe: (() => void) | null = null;

/** Cached array identity — `useSyncExternalStore` loops if this changes every read. */
function rebuildSnapshot(): void {
  snapshot = [...vehicles.values()];
}

function notify(): void {
  for (const l of listeners) l();
}

function setSource(next: LiveSource): void {
  if (source === next) return;
  source = next;

  if (next === 'offline' && !simUnsubscribe) {
    // Mirror the local simulator into this store so screens keep rendering.
    simUnsubscribe = simulator.subscribe(() => {
      snapshot = simulator.getSnapshot();
      notify();
    });
    snapshot = simulator.getSnapshot();
  }

  if (next === 'live' && simUnsubscribe) {
    simUnsubscribe();
    simUnsubscribe = null;
    vehicles.clear();
  }

  notify();
}

/** Fold a wire event into the local view, joining it to static bus/route records. */
function applyEvent(event: VehicleEvent): void {
  const bus = BUS_BY_ID.get(event.busId);
  const route = ROUTE_BY_ID.get(event.routeId);
  if (!bus || !route) return;

  vehicles.set(event.busId, {
    bus,
    route,
    greenScore: greenScore(bus),
    live: {
      busId: event.busId,
      tripId: event.tripId ?? '',
      routeId: event.routeId,
      position: event.position,
      bearing: event.bearing,
      speedKmph: event.speedKmph,
      recordedAt: event.recordedAt,
      ageSec: event.ageSec,
      status: event.status,
      delayMin: event.delayMin,
      occupancy: event.occupancy,
      nextStopIndex: event.nextStopIndex,
      progressKm: event.progressKm,
      predictions: event.predictions,
      lastSeenStopName: event.lastSeenStopName ?? undefined,
    },
  });

  rebuildSnapshot();
}

function connect(): void {
  if (socket) return;

  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 6000,
  });

  socket.on('connect', () => {
    setSource('live');
    socket?.emit('subscribe:fleet');
  });

  socket.on('bus:location', (event: VehicleEvent) => {
    if (source !== 'live') return;
    applyEvent(event);
    notify();
  });

  socket.on('disconnect', () => setSource('offline'));
  socket.on('connect_error', () => setSource('offline'));
}

export const liveStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    connect();

    // Nothing has arrived yet — show simulated data rather than an empty map,
    // and swap to live silently the moment the socket connects.
    if (source === 'connecting' && snapshot.length === 0) {
      snapshot = simulator.getSnapshot();
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        socket?.disconnect();
        socket = null;
        simUnsubscribe?.();
        simUnsubscribe = null;
        source = 'connecting';
      }
    };
  },

  getSnapshot(): LiveBus[] {
    return snapshot;
  },

  getSource(): LiveSource {
    return source;
  },
};
