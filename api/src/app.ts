import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { corsOrigins } from './config/env.ts';
import { logger } from './config/logger.ts';
import { api } from './http/routes.ts';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '512kb' }));

  app.use(
    pinoHttp({
      logger,
      // Health checks are polled constantly; logging each one buries the signal.
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'debug';
      },
    }),
  );

  app.use('/api/v1', api);

  app.use((_req, res) => res.status(404).json({ data: null, error: { message: 'not found' } }));

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error({ err: err.message, stack: err.stack }, 'unhandled error');
      res.status(500).json({ data: null, error: { message: 'internal error' } });
    },
  );

  return app;
}
