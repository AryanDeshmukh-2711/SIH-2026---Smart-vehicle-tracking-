import { describe, expect, it } from 'vitest';
import { SIGNAL_LOST_AFTER_SEC } from '@himgati/shared';
import { validateReading, type RawReading, type ValidationContext } from './validate.ts';

/**
 * GPS cleaning is the gate everything downstream depends on: a reading that
 * gets through becomes "where the bus is". These tests pin both halves of the
 * contract — what must be thrown away, and, just as importantly, what must not.
 */

const SHIMLA = { lat: 31.1048, lng: 77.1734 };
const T0 = new Date('2026-08-11T10:00:00Z');

function reading(over: Partial<RawReading> = {}): RawReading {
  return {
    busId: 'B-4021',
    lat: SHIMLA.lat,
    lng: SHIMLA.lng,
    speedKmph: 30,
    heading: 90,
    accuracyM: 8,
    timestamp: T0.toISOString(),
    ...over,
  };
}

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return { maxSpeedKmph: 120, ...over };
}

/** A point `km` east of Shimla — roughly, which is enough to imply a speed. */
function eastOf(km: number) {
  return { lat: SHIMLA.lat, lng: SHIMLA.lng + km / (111.32 * Math.cos((SHIMLA.lat * Math.PI) / 180)) };
}

describe('accepting a good reading', () => {
  it('accepts a plausible fix and normalises its fields', () => {
    const result = validateReading(reading(), ctx());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.busId).toBe('B-4021');
    expect(result.reading.position).toEqual(SHIMLA);
    expect(result.reading.recordedAt.toISOString()).toBe(T0.toISOString());
    expect(result.reading.buffered).toBe(false);
  });

  it('reads a device timestamp in seconds or milliseconds', () => {
    const secs = validateReading(reading({ timestamp: Math.floor(T0.getTime() / 1000) }), ctx());
    const ms = validateReading(reading({ timestamp: T0.getTime() }), ctx());

    expect(secs.ok && secs.reading.recordedAt.getTime()).toBe(T0.getTime());
    expect(ms.ok && ms.reading.recordedAt.getTime()).toBe(T0.getTime());
  });

  it('defaults a missing accuracy rather than rejecting the fix', () => {
    const result = validateReading(reading({ accuracyM: undefined }), ctx());
    expect(result.ok && result.reading.accuracyM).toBe(10);
  });
});

describe('rejecting bad readings', () => {
  it('rejects a payload with no coordinates', () => {
    const result = validateReading({ busId: 'B-1', timestamp: T0.toISOString() } as RawReading, ctx());
    expect(result).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('rejects an unparseable timestamp', () => {
    const result = validateReading(reading({ timestamp: 'not-a-date' }), ctx());
    expect(result).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('rejects coordinates outside Himachal, which catches swapped lat/lng', () => {
    const swapped = validateReading(reading({ lat: 77.1734, lng: 31.1048 }), ctx());
    expect(swapped).toMatchObject({ ok: false, reason: 'bad-coordinates' });

    const nullIsland = validateReading(reading({ lat: 0, lng: 0 }), ctx());
    expect(nullIsland).toMatchObject({ ok: false, reason: 'bad-coordinates' });
  });

  it('rejects a fix from the future, which means a broken device clock', () => {
    const result = validateReading(reading({ timestamp: Date.now() + 10 * 60_000 }), ctx());
    expect(result).toMatchObject({ ok: false, reason: 'future-timestamp' });
  });

  it('rejects a fix too imprecise to move an icon, when a floor is set', () => {
    const result = validateReading(reading({ accuracyM: 800 }), ctx({ maxAccuracyM: 500 }));
    expect(result).toMatchObject({ ok: false, reason: 'poor-accuracy' });
  });

  it('rejects a duplicate of the reading we already hold', () => {
    const result = validateReading(
      reading(),
      ctx({ previous: { position: SHIMLA, recordedAt: T0 } }),
    );
    expect(result).toMatchObject({ ok: false, reason: 'duplicate' });
  });
});

describe('impossible speed (SRS FR-3)', () => {
  it('rejects a jump implying more than the configured ceiling', () => {
    // 10 km in 60 s is 600 km/h.
    const result = validateReading(
      reading({ ...eastOf(10), timestamp: new Date(T0.getTime() + 60_000).toISOString() }),
      ctx({ previous: { position: SHIMLA, recordedAt: T0 } }),
    );
    expect(result).toMatchObject({ ok: false, reason: 'impossible-speed' });
  });

  it('accepts a normal road speed over the same interval', () => {
    // 0.8 km in 60 s is 48 km/h.
    const result = validateReading(
      reading({ ...eastOf(0.8), timestamp: new Date(T0.getTime() + 60_000).toISOString() }),
      ctx({ previous: { position: SHIMLA, recordedAt: T0 } }),
    );
    expect(result.ok).toBe(true);
  });

  it('ignores the check over a sub-5-second gap, where jitter dominates', () => {
    // 30 m of drift in 2 s implies 54 km/h — meaningless at this timescale, and
    // discarding it would throw away a perfectly good stationary vehicle.
    const result = validateReading(
      reading({ ...eastOf(0.03), timestamp: new Date(T0.getTime() + 2_000).toISOString() }),
      ctx({ previous: { position: SHIMLA, recordedAt: T0 } }),
    );
    expect(result.ok).toBe(true);
  });

  /**
   * Regression test. Every buffered reading uploaded after a coverage gap was
   * compared against the same pre-blackout fix and rejected as impossible, so
   * the last-accepted position never advanced and the vehicle could never
   * re-acquire. Recovery from a dead zone was impossible.
   */
  it('does not judge a jump across a signal-loss gap', () => {
    const gapSec = SIGNAL_LOST_AFTER_SEC + 120;
    const result = validateReading(
      reading({ ...eastOf(30), timestamp: new Date(T0.getTime() + gapSec * 1000).toISOString() }),
      ctx({
        previous: { position: SHIMLA, recordedAt: T0 },
        maxGapSec: SIGNAL_LOST_AFTER_SEC,
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('still judges a jump inside the window', () => {
    const result = validateReading(
      reading({ ...eastOf(30), timestamp: new Date(T0.getTime() + 60_000).toISOString() }),
      ctx({
        previous: { position: SHIMLA, recordedAt: T0 },
        maxGapSec: SIGNAL_LOST_AFTER_SEC,
      }),
    );
    expect(result).toMatchObject({ ok: false, reason: 'impossible-speed' });
  });
});

describe('buffered readings from a dead zone (SRS §8.5, FR-6)', () => {
  it('accepts an out-of-order fix and flags it as buffered', () => {
    const result = validateReading(
      reading({ timestamp: new Date(T0.getTime() - 120_000).toISOString() }),
      ctx({ previous: { position: SHIMLA, recordedAt: T0 } }),
    );

    expect(result.ok).toBe(true);
    // Late is not the same as wrong: this is real history recorded while the
    // device was out of coverage, and discarding it would lose the path the bus
    // actually took.
    expect(result.ok && result.reading.buffered).toBe(true);
  });
});
