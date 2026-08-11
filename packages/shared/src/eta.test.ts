import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_LABEL,
  FRESHNESS_THRESHOLDS,
  SIGNAL_LOST_AFTER_SEC,
  TIMETABLE_FALLBACK_AFTER_SEC,
  confidenceFromAge,
  delayLabel,
  formatEta,
  formatEtaCompact,
  rangeFor,
  relativeAge,
  statusTone,
} from './eta';
import type { StopPrediction } from './types';

/**
 * The confidence ladder (SRS §8.3) is the product's central honesty claim: the
 * app never shows a precision the data cannot support. These tests pin the exact
 * thresholds and the exact shapes the SRS specifies, because loosening either
 * quietly turns a range back into a promise.
 */

function prediction(over: Partial<StopPrediction> = {}): StopPrediction {
  return {
    stopId: 'HP-SML-001',
    etaMin: 7,
    rangeMin: [6, 8],
    confidence: 'high',
    scheduled: '10:30',
    distanceKm: 3.5,
    ...over,
  };
}

describe('confidence is a function of data freshness alone', () => {
  it('is high under one minute', () => {
    expect(confidenceFromAge(0)).toBe('high');
    expect(confidenceFromAge(FRESHNESS_THRESHOLDS.high - 1)).toBe('high');
  });

  it('drops to medium at one minute', () => {
    expect(confidenceFromAge(FRESHNESS_THRESHOLDS.high)).toBe('medium');
    expect(confidenceFromAge(FRESHNESS_THRESHOLDS.medium - 1)).toBe('medium');
  });

  it('drops to low at five minutes', () => {
    expect(confidenceFromAge(FRESHNESS_THRESHOLDS.medium)).toBe('low');
    expect(confidenceFromAge(3600)).toBe('low');
  });

  it('orders the escalation thresholds as the SRS describes', () => {
    // The status degrades before the number does, and that is deliberate:
    // a vehicle is declared Signal Lost at three minutes (§8.5) while its ETA
    // is still medium-confidence until five (§8.3). So a passenger is warned
    // the bus has gone quiet *before* the arrival time visibly loosens.
    expect(FRESHNESS_THRESHOLDS.high).toBeLessThan(SIGNAL_LOST_AFTER_SEC);
    expect(SIGNAL_LOST_AFTER_SEC).toBeLessThan(FRESHNESS_THRESHOLDS.medium);
    expect(FRESHNESS_THRESHOLDS.medium).toBeLessThan(TIMETABLE_FALLBACK_AFTER_SEC);
  });

  it('still reports medium confidence at the moment signal is declared lost', () => {
    // Pins the overlap above so it cannot be "tidied" into a single threshold.
    expect(confidenceFromAge(SIGNAL_LOST_AFTER_SEC)).toBe('medium');
  });
});

describe('the ETA changes shape as confidence falls', () => {
  it('shows a bare number when the fix is fresh', () => {
    expect(formatEta(prediction({ etaMin: 7, confidence: 'high' }))).toBe('7 min');
  });

  it('shows a margin when the fix is a few minutes old', () => {
    expect(formatEta(prediction({ etaMin: 7, confidence: 'medium', rangeMin: [5, 9] }))).toBe(
      '7 min (±2)',
    );
  });

  it('shows a range, not a number, when the fix is stale', () => {
    expect(formatEta(prediction({ etaMin: 11, confidence: 'low', rangeMin: [8, 14] }))).toBe(
      '8–14 min',
    );
  });

  it('never returns an empty string (FR-14)', () => {
    const cases: StopPrediction[] = [
      prediction({ etaMin: 0 }),
      prediction({ etaMin: 0.5 }),
      prediction({ etaMin: 240, confidence: 'low', rangeMin: [150, 330] }),
      prediction({ etaMin: -5 }),
    ];
    for (const c of cases) {
      expect(formatEta(c).length).toBeGreaterThan(0);
      expect(formatEtaCompact(c).length).toBeGreaterThan(0);
    }
  });

  it('says a bus is arriving rather than showing zero', () => {
    expect(formatEta(prediction({ etaMin: 0 }))).toBe('Arriving');
  });
});

describe('ranges widen as confidence falls', () => {
  it('brackets tightly when fresh and loosely when stale', () => {
    const [hiLo, hiHi] = rangeFor(20, 'high');
    const [medLo, medHi] = rangeFor(20, 'medium');
    const [lowLo, lowHi] = rangeFor(20, 'low');

    expect(hiHi - hiLo).toBeLessThan(medHi - medLo);
    expect(medHi - medLo).toBeLessThan(lowHi - lowLo);
  });

  it('never produces a negative lower bound', () => {
    for (const c of ['high', 'medium', 'low'] as const) {
      expect(rangeFor(1, c)[0]).toBeGreaterThanOrEqual(0);
      expect(rangeFor(0, c)[0]).toBeGreaterThanOrEqual(0);
    }
  });

  it('always brackets the estimate it describes', () => {
    for (const eta of [1, 7, 45, 300]) {
      for (const c of ['high', 'medium', 'low'] as const) {
        const [lo, hi] = rangeFor(eta, c);
        expect(lo).toBeLessThanOrEqual(eta);
        expect(hi).toBeGreaterThanOrEqual(eta);
      }
    }
  });
});

describe('status and delay wording stay consistent', () => {
  it('uses the same five-minute threshold as the delayed status', () => {
    // A badge saying "on time" beside a line saying "4 min behind" is the kind
    // of contradiction that makes users stop believing the whole screen.
    expect(delayLabel(4)).toBe('Running to schedule');
    expect(delayLabel(5)).toContain('behind schedule');
  });

  it('reports running early rather than negative lateness', () => {
    expect(delayLabel(-6)).toBe('6 min early');
  });

  it('tones a running service positively and a cancelled one negatively', () => {
    expect(statusTone('running')).toBe('ok');
    expect(statusTone('delayed')).toBe('warn');
    expect(statusTone('signal-lost')).toBe('warn');
    expect(statusTone('cancelled')).toBe('bad');
  });

  it('labels every confidence level', () => {
    for (const c of ['high', 'medium', 'low'] as const) {
      expect(CONFIDENCE_LABEL[c]).toBeTruthy();
    }
  });
});

describe('freshness is stated in human terms', () => {
  it('describes recent fixes loosely and older ones in minutes', () => {
    expect(relativeAge(5)).toBe('just now');
    expect(relativeAge(45)).toBe('45s ago');
    expect(relativeAge(240)).toBe('4 min ago');
    expect(relativeAge(7200)).toBe('2 hr ago');
  });
});
