import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.ts';
import { logger } from '../config/logger.ts';

/**
 * Single Prisma client for the process. `tsx watch` reloads modules on change,
 * so the instance is cached on globalThis to avoid exhausting the connection
 * pool during development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  const [{ postgis }] = await prisma.$queryRaw<Array<{ postgis: string }>>`
    SELECT PostGIS_Lib_Version() AS postgis
  `;
  logger.info({ postgis }, 'database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
