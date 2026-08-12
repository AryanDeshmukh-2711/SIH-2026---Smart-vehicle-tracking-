import { describe, expect, it } from 'vitest';
import { OCCUPANCY_DRIVER_TTL_SEC, mergeOps, type VehicleOps } from './ops.ts';

/**
 * Crowd level is the one field two parties report about the same bus at the same
 * time, and they disagree. The driver taps it once; the vehicle's telemetry
 * publishes it every couple of seconds. Whoever wins by default decides whether
 * the driver app does anything at all — before this rule existed, a driver's
 * report was overwritten by the next device tick and vanished from the passenger
 * app within seconds.
 */

const T0 = 1_700_000_000_000;
const secondsLater = (n: number) => T0 + n * 1000;

const driverSaidFull: VehicleOps = {
  occupancy: 'full',
  occupancySource: 'driver',
  occupancyAt: T0,
};

describe('a driver outranks the vehicle on how full the bus is', () => {
  it('keeps the driver report when telemetry disagrees moments later', () => {
    const next = mergeOps(driverSaidFull, { occupancy: 'comfortable' }, 'device', secondsLater(2));

    expect(next.occupancy).toBe('full');
    expect(next.occupancySource).toBe('driver');
    // The hold does not renew itself — otherwise a chatty device would extend a
    // driver's report indefinitely and it would never expire.
    expect(next.occupancyAt).toBe(T0);
  });

  it('still holds just before the window closes', () => {
    const next = mergeOps(
      driverSaidFull,
      { occupancy: 'empty' },
      'device',
      secondsLater(OCCUPANCY_DRIVER_TTL_SEC - 1),
    );
    expect(next.occupancy).toBe('full');
  });

  it('hands back to telemetry once the report has gone stale', () => {
    const next = mergeOps(
      driverSaidFull,
      { occupancy: 'empty' },
      'device',
      secondsLater(OCCUPANCY_DRIVER_TTL_SEC),
    );

    expect(next.occupancy).toBe('empty');
    expect(next.occupancySource).toBe('device');
  });

  it('lets a driver correct themselves inside the window', () => {
    const next = mergeOps(driverSaidFull, { occupancy: 'empty' }, 'driver', secondsLater(30));

    expect(next.occupancy).toBe('empty');
    expect(next.occupancyAt).toBe(secondsLater(30));
  });

  it('takes a device reading when no driver has reported', () => {
    const next = mergeOps({}, { occupancy: 'comfortable' }, 'device', T0);

    expect(next.occupancy).toBe('comfortable');
    expect(next.occupancySource).toBe('device');
  });
});

describe('the hold covers crowd level only', () => {
  it('lets the depot set delay and cancellation regardless', () => {
    // The depot cancels services; the driver does not. Extending the hold to
    // these fields would let a stale driver report suppress a real cancellation.
    const next = mergeOps(
      { ...driverSaidFull, delayMin: 0, cancelled: false },
      { delayMin: 25, cancelled: true },
      'device',
      secondsLater(5),
    );

    expect(next.delayMin).toBe(25);
    expect(next.cancelled).toBe(true);
    expect(next.occupancy).toBe('full');
  });

  it('leaves a held report alone when a report carries no crowd level', () => {
    const next = mergeOps(driverSaidFull, { delayMin: 12 }, 'device', secondsLater(5));

    expect(next.occupancy).toBe('full');
    expect(next.occupancySource).toBe('driver');
    expect(next.delayMin).toBe(12);
  });

  it('does not invent a source for reports that never mention crowding', () => {
    const next = mergeOps({}, { delayMin: 3 }, 'device', T0);
    expect(next.occupancySource).toBeUndefined();
    expect(next.occupancyAt).toBeUndefined();
  });
});
