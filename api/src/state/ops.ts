/**
 * Operator-reported vehicle state, and who gets the last word on it.
 *
 * Kept apart from `live.ts` because that module opens a Redis client on import.
 * The precedence rule below is a product decision, not plumbing, so it is a
 * plain function that can be reasoned about and tested on its own.
 */

import type { Occupancy } from '@himgati/shared';

export interface VehicleOps {
  delayMin?: number;
  occupancy?: Occupancy;
  cancelled?: boolean;
  /**
   * Minutes until this service pulls out of the origin bay, as declared by the
   * operator. Beats inferring it from the timetable: the depot knows which
   * vehicle is on which run, and the timetable only knows when *a* bus is due.
   */
  departsInMin?: number;
  /** Who last set `occupancy`, and when — see `OCCUPANCY_DRIVER_TTL_SEC`. */
  occupancySource?: OpsSource;
  occupancyAt?: number;
}

/**
 * `'driver'` is a person on the bus tapping the driver app. `'device'` is the
 * MQTT status channel: vehicle telemetry, passenger counters, depot systems.
 */
export type OpsSource = 'driver' | 'device';

/**
 * How long a driver's crowd report outranks anything the depot or the vehicle's
 * own telemetry says.
 *
 * The driver is the only party who can actually see the aisle. Everything else
 * is inference, and it arrives every few seconds — so without a hold, the human
 * answer is overwritten almost the moment it is given, and the driver watches
 * their own report disappear. Ten minutes is about how long a crowd reading
 * stays true between stops on these routes; after that the automated figure is
 * the fresher of the two and takes over again.
 */
export const OCCUPANCY_DRIVER_TTL_SEC = 600;

/**
 * Fold an incoming operator report into the stored one.
 *
 * Only crowd level has a precedence rule. Delay and cancellation are
 * last-write-wins, because for those the depot is as authoritative as the
 * driver — it is the depot that cancels a service, not the person driving it.
 */
export function mergeOps(
  existing: VehicleOps,
  incoming: VehicleOps,
  source: OpsSource,
  now: number,
): VehicleOps {
  const next: VehicleOps = { ...existing, ...incoming };
  if (incoming.occupancy === undefined) return next;

  const heldByDriver =
    existing.occupancySource === 'driver' &&
    now - (existing.occupancyAt ?? 0) < OCCUPANCY_DRIVER_TTL_SEC * 1000;

  if (source === 'device' && heldByDriver) {
    next.occupancy = existing.occupancy;
    next.occupancySource = existing.occupancySource;
    next.occupancyAt = existing.occupancyAt;
  } else {
    next.occupancySource = source;
    next.occupancyAt = now;
  }

  return next;
}
