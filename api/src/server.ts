import { createServer } from 'node:http';
import { env } from './config/env.ts';
import { logger } from './config/logger.ts';
import { connectDatabase, disconnectDatabase } from './db/prisma.ts';
import { connectRedis, disconnectRedis } from './db/redis.ts';
import { refreshNetwork } from './state/network.ts';
import { createApp } from './app.ts';
import { createSocketServer } from './realtime/socket.ts';
import { startGpsConsumer, stopGpsConsumer } from './services/gps/mqtt-consumer.ts';
import { refreshAllEtas } from './services/gps/ingest.ts';
import { etaLog } from './config/logger.ts';

async function main(): Promise<void> {
  // Order matters: the network graph must be in memory before the GPS consumer
  // starts, or the first readings arrive with nothing to match them against.
  await connectDatabase();
  await connectRedis();
  await refreshNetwork();

  const app = createApp();
  const httpServer = createServer(app);
  createSocketServer(httpServer);

  startGpsConsumer();

  /**
   * Periodic ETA refresh (FR-11).
   *
   * This runs whether or not new GPS arrives, which is the point: a bus sitting
   * in a dead zone gets no new fix, so its age climbs here and the client watches
   * confidence fall from a firm "7 min" to a range and finally to the timetable.
   */
  const etaTimer = setInterval(() => {
    refreshAllEtas()
      .then((n) => {
        if (n > 0) etaLog.debug({ vehicles: n }, 'eta refresh');
      })
      .catch((err) => etaLog.error({ err: err.message }, 'eta refresh failed'));
  }, env.ETA_REFRESH_MS);

  httpServer.listen(env.API_PORT, () => {
    logger.info(
      { port: env.API_PORT, env: env.NODE_ENV },
      `HimGati API listening on http://localhost:${env.API_PORT}`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    clearInterval(etaTimer);
    httpServer.close();
    await stopGpsConsumer();
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'failed to start');
  process.exit(1);
});
