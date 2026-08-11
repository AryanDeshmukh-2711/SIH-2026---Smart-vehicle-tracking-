import pino from 'pino';
import { env, isProduction } from './env.ts';

/**
 * Structured logging. JSON in production so it can be shipped somewhere; a
 * readable stream in development so a hackathon team can actually watch the
 * GPS pipeline work.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'himgati-api' },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
      },
});

export const gpsLog = logger.child({ module: 'gps' });
export const etaLog = logger.child({ module: 'eta' });
export const rtLog = logger.child({ module: 'realtime' });
