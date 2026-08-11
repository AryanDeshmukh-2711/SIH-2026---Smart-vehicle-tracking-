/**
 * Seed the database from the canonical dataset in `@himgati/shared/data`.
 *
 * Idempotent: every write is an upsert keyed on the natural id, so this can be
 * re-run against a populated database without duplicating anything. Route shapes
 * are written as real PostGIS LINESTRINGs — the ETA engine locates a bus along
 * one with ST_LineLocatePoint, so a shape that is merely "roughly right" would
 * corrupt every arrival time on that corridor.
 */

import { BUSES, ROUTES, STOPS } from '@himgati/shared/data';
import type { EmissionNorm, RouteCategory, StopKind } from '@himgati/shared';
import { prisma, connectDatabase, disconnectDatabase } from '../db/prisma.ts';
import { logger } from '../config/logger.ts';

/* ------------------------- enum mapping (TS → SQL) ------------------------ */
// Postgres enum labels cannot contain '-', so the wire values are remapped.

const STOP_KIND: Record<StopKind, 'isbt' | 'bus_stand' | 'stop' | 'halt'> = {
  isbt: 'isbt',
  'bus-stand': 'bus_stand',
  stop: 'stop',
  halt: 'halt',
};

const NORM: Record<EmissionNorm, 'zero_tailpipe' | 'BS_VI' | 'BS_IV' | 'BS_III'> = {
  'zero-tailpipe': 'zero_tailpipe',
  'BS-VI': 'BS_VI',
  'BS-IV': 'BS_IV',
  'BS-III': 'BS_III',
};

async function seedStops(): Promise<void> {
  for (const stop of STOPS) {
    const data = {
      name: stop.name,
      nameHi: stop.nameHi,
      kind: STOP_KIND[stop.kind],
      town: stop.town,
      lat: stop.position.lat,
      lng: stop.position.lng,
      landmarks: stop.landmarks,
      platforms: stop.platforms ?? [],
      amenities: stop.amenities,
      smsCode: stop.smsCode,
    };
    await prisma.stop.upsert({
      where: { id: stop.id },
      create: { id: stop.id, code: stop.id, ...data },
      update: data,
    });
  }
  logger.info({ count: STOPS.length }, 'seeded stops');
}

async function seedRoutes(): Promise<void> {
  for (const route of ROUTES) {
    const distanceKm = route.distancesKm[route.distancesKm.length - 1];
    const data = {
      shortName: route.shortName,
      longName: route.longName,
      origin: route.origin,
      destination: route.destination,
      category: route.category as RouteCategory,
      operator: route.operator,
      distanceKm,
      typicalDurationMin: route.typicalDurationMin,
      fareInr: route.fareInr,
      departures: route.departures,
    };

    await prisma.route.upsert({
      where: { id: route.id },
      create: { id: route.id, ...data },
      update: data,
    });

    // The shape is geometry, so Prisma cannot write it — build a WKT LINESTRING
    // and let PostGIS parse it in one statement.
    const wkt = `LINESTRING(${route.shape.map((p) => `${p.lng} ${p.lat}`).join(',')})`;
    await prisma.$executeRaw`
      UPDATE routes SET shape = ST_GeomFromText(${wkt}, 4326) WHERE id = ${route.id}
    `;

    // Replace the stop pattern wholesale; sequence is positional, and editing it
    // in place risks a partially-updated ordering.
    await prisma.routeStop.deleteMany({ where: { routeId: route.id } });
    await prisma.routeStop.createMany({
      data: route.stopIds.map((stopId, i) => ({
        routeId: route.id,
        stopId,
        sequence: i,
        distanceKm: route.distancesKm[i],
      })),
    });
  }
  logger.info({ count: ROUTES.length }, 'seeded routes and stop patterns');
}

async function seedBuses(): Promise<void> {
  for (const bus of BUSES) {
    const data = {
      registration: bus.registration,
      operator: bus.operator,
      routeId: bus.routeId,
      fuel: bus.fuel,
      norm: NORM[bus.norm],
      year: bus.year,
      seats: bus.seats,
      wheelchairAccessible: bus.wheelchairAccessible,
      amenities: bus.amenities,
      emissionDataEstimated: bus.emissionDataEstimated,
    };
    await prisma.bus.upsert({
      where: { id: bus.id },
      create: { id: bus.id, ...data },
      update: data,
    });
  }
  logger.info({ count: BUSES.length }, 'seeded fleet');
}

/**
 * One open trip per bus, on the departure slot its index maps to. Incoming GPS
 * is attached to these; without them a reading has nothing to belong to.
 */
async function seedTrips(): Promise<void> {
  let created = 0;

  for (const route of ROUTES) {
    const fleet = BUSES.filter((b) => b.routeId === route.id);

    for (const [i, bus] of fleet.entries()) {
      const existing = await prisma.trip.findFirst({
        where: { busId: bus.id, status: { in: ['scheduled', 'running', 'delayed', 'signal_lost'] } },
      });
      if (existing) continue;

      await prisma.trip.create({
        data: {
          busId: bus.id,
          routeId: route.id,
          scheduledAt: route.departures[i % route.departures.length],
          status: 'scheduled',
        },
      });
      created++;
    }
  }
  logger.info({ created }, 'seeded trips');
}

async function verify(): Promise<void> {
  const [stops, routes, buses, trips] = await Promise.all([
    prisma.stop.count(),
    prisma.route.count(),
    prisma.bus.count(),
    prisma.trip.count(),
  ]);

  // A route without geometry silently breaks map-matching, so assert it here
  // rather than discovering it later as a wrong arrival time.
  const [{ count: withShape }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM routes WHERE shape IS NOT NULL
  `;
  const [{ count: withGeom }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM stops WHERE geom IS NOT NULL
  `;

  logger.info(
    {
      stops,
      routes,
      buses,
      trips,
      routesWithShape: Number(withShape),
      stopsWithGeom: Number(withGeom),
    },
    'seed verified',
  );

  if (Number(withShape) !== routes) throw new Error('some routes have no shape geometry');
  if (Number(withGeom) !== stops) throw new Error('some stops have no point geometry');
}

async function main(): Promise<void> {
  await connectDatabase();
  await seedStops();
  await seedRoutes();
  await seedBuses();
  await seedTrips();
  await verify();
}

main()
  .then(async () => {
    await disconnectDatabase();
    logger.info('seed complete');
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error({ err: err instanceof Error ? err.message : err }, 'seed failed');
    await disconnectDatabase();
    process.exit(1);
  });
