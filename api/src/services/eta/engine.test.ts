import { describe, expect, it } from 'vitest';
import { TIMETABLE_FALLBACK_AFTER_SEC } from '@himgati/shared';
import {
  ORIGIN_BAY_KM,
  computeEta,
  minutesUntilDeparture,
  nextStopIndexFor,
} from './engine.ts';
import type { NetworkRoute } from '../../state/network.ts';

/**
 * A deliberately round test corridor: 60 km in 120 minutes is exactly 30 km/h,
 * with stops every 20 km. Real routes have awkward numbers; a fixture that does
 * not lets a wrong answer be spotted by eye.
 */
function route(over: Partial<NetworkRoute> = {}): NetworkRoute {
  return {
    id: 'R-TEST',
    shortName: 'T1',
    longName: 'Origin → Terminus',
    origin: 'Origin',
    destination: 'Terminus',
    category: 'ordinary',
    operator: 'HRTC',
    distanceKm: 60,
    typicalDurationMin: 120,
    fareInr: 100,
    departures: ['08:00', '12:00', '18:00'],
    stopIds: ['S0', 'S1', 'S2', 'S3'],
    distancesKm: [0, 20, 40, 60],
    shape: [],
    ...over,
  };
}

describe('choosing the next stop', () => {
  it('picks the first stop the vehicle has not yet reached', () => {
    expect(nextStopIndexFor(route(), 0)).toBe(1);
    expect(nextStopIndexFor(route(), 10)).toBe(1);
    expect(nextStopIndexFor(route(), 25)).toBe(2);
    expect(nextStopIndexFor(route(), 45)).toBe(3);
  });

  it('clamps to the terminus once the route is complete', () => {
    expect(nextStopIndexFor(route(), 60)).toBe(3);
    expect(nextStopIndexFor(route(), 999)).toBe(3);
  });
});

describe('predicting arrivals (FR-8, FR-9, FR-10)', () => {
  it('predicts every upcoming stop and none already passed', () => {
    const { predictions } = computeEta({ route: route(), progressKm: 25, ageSec: 0, delayMin: 0 });

    expect(predictions.map((p) => p.stopId)).toEqual(['S2', 'S3']);
  });

  it('uses road distance along the route, not straight-line distance', () => {
    // 10 km still to run at 30 km/h is 20 minutes.
    const { predictions } = computeEta({ route: route(), progressKm: 10, ageSec: 0, delayMin: 0 });

    expect(predictions[0].stopId).toBe('S1');
    expect(predictions[0].etaMin).toBe(20);
    expect(predictions[0].distanceKm).toBe(10);
  });

  it('adds dwell time for the stops in between', () => {
    const { predictions } = computeEta({ route: route(), progressKm: 10, ageSec: 0, delayMin: 0 });

    // S2 is 30 km away (60 min) plus one intermediate stop at 1.5 min dwell.
    expect(predictions[1].stopId).toBe('S2');
    expect(predictions[1].etaMin).toBe(62);
  });

  it('gives arrivals in increasing order', () => {
    const { predictions } = computeEta({ route: route(), progressKm: 5, ageSec: 0, delayMin: 0 });
    const etas = predictions.map((p) => p.etaMin);

    expect(etas).toEqual([...etas].sort((a, b) => a - b));
  });

  it('never returns a negative arrival time', () => {
    const { predictions } = computeEta({ route: route(), progressKm: 59.9, ageSec: 0, delayMin: 0 });

    for (const p of predictions) expect(p.etaMin).toBeGreaterThanOrEqual(0);
  });
});

describe('confidence degrades with the age of the fix', () => {
  it('is high on a fresh fix and low on a stale one', () => {
    expect(computeEta({ route: route(), progressKm: 10, ageSec: 10, delayMin: 0 }).confidence).toBe(
      'high',
    );
    expect(computeEta({ route: route(), progressKm: 10, ageSec: 120, delayMin: 0 }).confidence).toBe(
      'medium',
    );
    expect(computeEta({ route: route(), progressKm: 10, ageSec: 400, delayMin: 0 }).confidence).toBe(
      'low',
    );
  });

  it('assumes the bus kept moving while it was silent', () => {
    const fresh = computeEta({ route: route(), progressKm: 10, ageSec: 0, delayMin: 0 });
    const stale = computeEta({ route: route(), progressKm: 10, ageSec: 240, delayMin: 0 });

    // Four minutes of silence at 30 km/h is 2 km of ground covered. Treating the
    // bus as parked where it was last seen would overstate every arrival on the
    // corridor.
    expect(stale.predictions[0].etaMin).toBeLessThan(fresh.predictions[0].etaMin);
  });
});

describe('timetable fallback past fifteen minutes of silence (SRS §8.5)', () => {
  it('abandons the live position and answers from the schedule', () => {
    const result = computeEta({
      route: route(),
      progressKm: 10,
      ageSec: TIMETABLE_FALLBACK_AFTER_SEC,
      delayMin: 0,
    });

    expect(result.fromTimetable).toBe(true);
    // A timetable is a plan, not an observation.
    expect(result.confidence).toBe('low');
    for (const p of result.predictions) expect(p.confidence).toBe('low');
  });

  it('still predicts from the live position just under the threshold', () => {
    const result = computeEta({
      route: route(),
      progressKm: 10,
      ageSec: TIMETABLE_FALLBACK_AFTER_SEC - 1,
      delayMin: 0,
    });

    expect(result.fromTimetable).toBe(false);
  });
});

describe('a vehicle waiting in the origin bay', () => {
  /**
   * Regression test. A parked bus had made no progress, so it was treated as
   * having already passed the first stop and predicted arrivals only from the
   * second onward. Shimla ISBT — the origin of six routes and the busiest stop
   * in the network — showed no departures at all.
   */
  it('predicts a departure from the stop it is parked at', () => {
    const result = computeEta({
      route: route(),
      progressKm: 0,
      ageSec: 0,
      delayMin: 0,
      departsInMin: 5,
    });

    expect(result.nextStopIndex).toBe(0);
    expect(result.predictions[0].stopId).toBe('S0');
    expect(result.predictions[0].etaMin).toBe(5);
  });

  it('pushes every downstream arrival back by the wait', () => {
    const rolling = computeEta({ route: route(), progressKm: 0, ageSec: 0, delayMin: 0 });
    const waiting = computeEta({
      route: route(),
      progressKm: 0,
      ageSec: 0,
      delayMin: 0,
      departsInMin: 10,
    });

    const s1Rolling = rolling.predictions.find((p) => p.stopId === 'S1')!;
    const s1Waiting = waiting.predictions.find((p) => p.stopId === 'S1')!;

    expect(s1Waiting.etaMin).toBe(s1Rolling.etaMin + 10);
  });

  it('treats only a vehicle within the bay radius as waiting', () => {
    // Guards the threshold the ingest path uses to decide "still in the bay".
    expect(ORIGIN_BAY_KM).toBeGreaterThan(0);
    expect(ORIGIN_BAY_KM).toBeLessThan(1);
  });
});

describe('next scheduled departure', () => {
  it('finds the next service later today', () => {
    const now = new Date('2026-08-11T09:00:00');
    expect(minutesUntilDeparture(route(), now)).toBe(180); // 12:00
  });

  it('rolls to tomorrow when the day is done', () => {
    const now = new Date('2026-08-11T20:00:00');
    // Next is 08:00 tomorrow, twelve hours away.
    expect(minutesUntilDeparture(route(), now)).toBe(720);
  });

  it('returns a non-negative wait at any hour', () => {
    for (const hour of [0, 6, 11, 17, 23]) {
      const now = new Date(`2026-08-11T${String(hour).padStart(2, '0')}:30:00`);
      expect(minutesUntilDeparture(route(), now)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('delay is reflected in arrivals', () => {
  it('pushes arrivals later when the service is running behind', () => {
    const onTime = computeEta({ route: route(), progressKm: 10, ageSec: 0, delayMin: 0 });
    const late = computeEta({ route: route(), progressKm: 10, ageSec: 0, delayMin: 20 });

    expect(late.predictions[0].etaMin).toBeGreaterThan(onTime.predictions[0].etaMin);
  });
});
