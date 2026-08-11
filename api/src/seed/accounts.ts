import type { UserRole } from '@prisma/client';
import { prisma } from '../db/prisma.ts';
import { logger } from '../config/logger.ts';
import { hashPassword } from '../services/auth/password.ts';

/**
 * Demo accounts, one per role.
 *
 * The passwords here are obviously not secrets — they exist so a reviewer can
 * sign in and see each surface. Nothing in the seed grants access to real data,
 * and a deployment would create its first admin out of band rather than run this.
 */

interface AccountSeed {
  phone: string;
  name: string;
  role: UserRole;
  employeeId?: string;
  depot?: string;
  /** Only desk roles get one; drivers and passengers sign in with an OTP. */
  password?: string;
}

export const DEMO_ACCOUNTS: AccountSeed[] = [
  {
    phone: '+919800000001',
    name: 'Aryan Deshmukh',
    role: 'passenger',
  },
  {
    phone: '+919800000002',
    name: 'Rakesh Thakur',
    role: 'driver',
    employeeId: 'HRTC-D-4021',
    depot: 'Shimla',
  },
  {
    phone: '+919800000003',
    name: 'Sunita Verma',
    role: 'driver',
    employeeId: 'HRTC-D-1187',
    depot: 'Shimla',
  },
  {
    phone: '+919800000004',
    name: 'Vikram Chauhan',
    role: 'depot_manager',
    employeeId: 'HRTC-M-SML',
    depot: 'Shimla',
    password: 'shimla-depot-2026',
  },
  {
    phone: '+919800000005',
    name: 'Neha Sharma',
    role: 'admin',
    employeeId: 'HRTC-ADMIN',
    password: 'himgati-admin-2026',
  },
  {
    phone: '+919800000006',
    name: 'HP Transport Authority',
    role: 'transport_authority',
    employeeId: 'HPTA-001',
    password: 'authority-oversight-2026',
  },
];

export async function seedAccounts(): Promise<void> {
  for (const account of DEMO_ACCOUNTS) {
    const passwordHash = account.password ? await hashPassword(account.password) : null;

    const data = {
      name: account.name,
      role: account.role,
      employeeId: account.employeeId ?? null,
      depot: account.depot ?? null,
      passwordHash,
      active: true,
    };

    await prisma.user.upsert({
      where: { phone: account.phone },
      create: { phone: account.phone, ...data },
      update: data,
    });
  }

  logger.info({ count: DEMO_ACCOUNTS.length }, 'seeded demo accounts');
}

/** Attach the seeded drivers to the trips their vehicles are running. */
export async function assignDriversToTrips(): Promise<void> {
  const pairs: Array<[employeeId: string, busId: string]> = [
    ['HRTC-D-4021', 'B-4021'],
    ['HRTC-D-1187', 'B-1187'],
  ];

  let assigned = 0;

  for (const [employeeId, busId] of pairs) {
    const driver = await prisma.user.findUnique({ where: { employeeId }, select: { id: true } });
    if (!driver) continue;

    const { count } = await prisma.trip.updateMany({
      where: { busId, driverId: null },
      data: { driverId: driver.id },
    });
    assigned += count;
  }

  logger.info({ assigned }, 'assigned drivers to trips');
}
