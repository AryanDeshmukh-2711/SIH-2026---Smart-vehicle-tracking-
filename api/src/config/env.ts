import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// The repo keeps one .env at the root so docker compose and the API cannot
// disagree about ports or credentials. An api/.env may override it locally.
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — copy .env.example to .env'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  MQTT_URL: z.string().default('mqtt://localhost:1883'),

  /** SRS FR-3: discard readings implying an impossible speed. */
  GPS_MAX_SPEED_KMPH: z.coerce.number().positive().default(120),
  /** SRS FR-7: a fix further than this from the shape means the bus is off route. */
  GPS_MAX_OFFROUTE_M: z.coerce.number().positive().default(250),
  /** SRS FR-11: refresh every upcoming-stop ETA on this cadence. */
  ETA_REFRESH_MS: z.coerce.number().int().positive().default(30_000),

  SIM_TIME_SCALE: z.coerce.number().positive().default(12),
  SIM_REPORT_MS: z.coerce.number().int().positive().default(2000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  // Fail loudly at boot rather than throwing an opaque error on first query.
  console.error(`Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === 'production';
