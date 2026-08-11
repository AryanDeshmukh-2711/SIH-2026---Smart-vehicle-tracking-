import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { corsOrigins } from '../config/env.ts';
import { rtLog } from '../config/logger.ts';
import { attachRealtime, rooms, toVehicleEvent } from './publish.ts';
import { getAllLive, getCachedEta, getRouteLive } from '../state/live.ts';

/**
 * Socket.IO transport.
 *
 * Chosen over polling because the SRS budgets under 5 MB of data per hour of
 * tracking; re-requesting the fleet every few seconds would not fit. Clients
 * join a room per route (or per vehicle) so they only receive what they are
 * actually looking at.
 *
 * On join the client is sent the current snapshot immediately, so a freshly
 * opened map is populated without waiting for the next GPS tick.
 */
export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    // The client is a PWA that may be resumed from a background tab.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  io.on('connection', (socket) => {
    rtLog.debug({ id: socket.id }, 'client connected');

    socket.on('subscribe:route', async (routeId: string) => {
      if (typeof routeId !== 'string') return;
      await socket.join(rooms.route(routeId));

      const live = await getRouteLive(routeId);
      for (const v of live) {
        const predictions = v.tripId ? ((await getCachedEta(v.tripId)) ?? []) : [];
        socket.emit('bus:location', toVehicleEvent(v, predictions));
      }
    });

    socket.on('unsubscribe:route', (routeId: string) => {
      if (typeof routeId === 'string') void socket.leave(rooms.route(routeId));
    });

    socket.on('subscribe:bus', async (busId: string) => {
      if (typeof busId !== 'string') return;
      await socket.join(rooms.bus(busId));
    });

    socket.on('unsubscribe:bus', (busId: string) => {
      if (typeof busId === 'string') void socket.leave(rooms.bus(busId));
    });

    // The whole-network map view. Acceptable at demo scale; a production
    // deployment would bound this by viewport bounding box instead.
    socket.on('subscribe:fleet', async () => {
      await socket.join(rooms.fleet);
      const live = await getAllLive();
      for (const v of live) {
        const predictions = v.tripId ? ((await getCachedEta(v.tripId)) ?? []) : [];
        socket.emit('bus:location', toVehicleEvent(v, predictions));
      }
    });

    socket.on('unsubscribe:fleet', () => void socket.leave(rooms.fleet));

    socket.on('disconnect', (reason) => {
      rtLog.debug({ id: socket.id, reason }, 'client disconnected');
    });
  });

  attachRealtime(io);
  return io;
}
