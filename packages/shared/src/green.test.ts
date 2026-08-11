import { describe, expect, it } from 'vitest';
import {
  EMISSION_FACTORS,
  GREEN_WEIGHTS,
  NORM_NOTE,
  busEmissionFactor,
  co2SavedKg,
  greenBand,
  greenScore,
  greenScoreBreakdown,
  treesEquivalent,
} from './green';
import type { Bus } from './types';

/**
 * These figures get shown to a transport department, so they are tested against
 * the worked examples in the SRS itself (§9.2, §9.3) rather than against
 * whatever the implementation happens to produce.
 */

const NOW = new Date('2026-08-11T00:00:00Z');

function bus(over: Partial<Bus> = {}): Bus {
  return {
    id: 'B-TEST',
    registration: 'HP-01-0000',
    operator: 'HRTC',
    routeId: 'R-TEST',
    category: 'ordinary',
    fuel: 'diesel',
    norm: 'BS-VI',
    year: 2024,
    seats: 40,
    wheelchairAccessible: false,
    amenities: [],
    emissionDataEstimated: false,
    ...over,
  };
}

describe('Green Score, worked examples from SRS §9.2', () => {
  it('scores a new electric bus 100', () => {
    // (100 × 0.50) + (100 × 0.35) + (100 × 0.15) = 100
    const score = greenScore(
      bus({ fuel: 'electric', norm: 'zero-tailpipe', year: 2024 }),
      NOW,
    );
    expect(score).toBe(100);
  });

  it('scores a ten-year-old BS-IV diesel 50', () => {
    // (40 × 0.50) + (65 × 0.35) + (45 × 0.15) = 49.5, rounded to 50
    const score = greenScore(bus({ fuel: 'diesel', norm: 'BS-IV', year: 2016 }), NOW);
    expect(score).toBe(50);
  });

  it('weights fuel, norm and age as 50/35/15', () => {
    expect(GREEN_WEIGHTS.fuel).toBe(0.5);
    expect(GREEN_WEIGHTS.norm).toBe(0.35);
    expect(GREEN_WEIGHTS.age).toBe(0.15);
    expect(GREEN_WEIGHTS.fuel + GREEN_WEIGHTS.norm + GREEN_WEIGHTS.age).toBeCloseTo(1);
  });

  it('shows its working, so a score can be challenged', () => {
    const b = greenScoreBreakdown(bus({ fuel: 'cng', norm: 'BS-VI', year: 2020 }), NOW);

    expect(b.fuel.points).toBe(80);
    expect(b.norm.points).toBe(100);
    expect(b.age.years).toBe(6);
    expect(b.age.points).toBe(70);
    expect(b.score).toBe(Math.round(80 * 0.5 + 100 * 0.35 + 70 * 0.15));
  });

  it('stays within 0–100 across the whole fleet space', () => {
    for (const fuel of ['electric', 'cng', 'hybrid', 'diesel'] as const) {
      for (const norm of ['zero-tailpipe', 'BS-VI', 'BS-IV', 'BS-III'] as const) {
        for (const year of [2026, 2020, 2014, 1998]) {
          const score = greenScore(bus({ fuel, norm, year }), NOW);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('ranks cleaner vehicles above dirtier ones', () => {
    const electric = greenScore(bus({ fuel: 'electric', norm: 'zero-tailpipe', year: 2024 }), NOW);
    const cng = greenScore(bus({ fuel: 'cng', norm: 'BS-VI', year: 2024 }), NOW);
    const bsvi = greenScore(bus({ fuel: 'diesel', norm: 'BS-VI', year: 2024 }), NOW);
    const bsiii = greenScore(bus({ fuel: 'diesel', norm: 'BS-III', year: 2010 }), NOW);

    expect(electric).toBeGreaterThan(cng);
    expect(cng).toBeGreaterThan(bsvi);
    expect(bsvi).toBeGreaterThan(bsiii);
  });

  it('penalises age even when the fuel and norm are identical', () => {
    const young = greenScore(bus({ fuel: 'diesel', norm: 'BS-VI', year: 2025 }), NOW);
    const old = greenScore(bus({ fuel: 'diesel', norm: 'BS-VI', year: 2010 }), NOW);

    expect(young).toBeGreaterThan(old);
  });
});

describe('CO₂ saved, worked example from SRS §9.3', () => {
  it('saves 3.75 kg over 25 km on an electric bus', () => {
    // (0.17 − 0.02) × 25 = 3.75
    expect(co2SavedKg('electric', 25)).toBe(3.75);
  });

  it('uses the emission factors the SRS specifies', () => {
    expect(EMISSION_FACTORS.carPetrolSolo).toBe(0.17);
    expect(busEmissionFactor('electric')).toBe(0.02);
    expect(busEmissionFactor('cng')).toBe(0.04);
    expect(busEmissionFactor('diesel')).toBe(0.05);
  });

  it('saves more on a cleaner bus over the same distance', () => {
    const km = 100;
    expect(co2SavedKg('electric', km)).toBeGreaterThan(co2SavedKg('cng', km));
    expect(co2SavedKg('cng', km)).toBeGreaterThan(co2SavedKg('diesel', km));
  });

  it('scales linearly with distance', () => {
    expect(co2SavedKg('diesel', 100)).toBeCloseTo(co2SavedKg('diesel', 50) * 2, 5);
  });

  it('saves nothing over no distance', () => {
    expect(co2SavedKg('electric', 0)).toBe(0);
  });

  it('converts to trees at the documented rate', () => {
    // 22 kg absorbed per mature tree per year.
    expect(treesEquivalent(22)).toBe(1);
    expect(treesEquivalent(44)).toBe(2);
  });
});

describe('emission standards are described honestly', () => {
  it('does not call a superseded standard clean', () => {
    // The SRS is explicit that mislabelling BS-IV as clean is unacceptable, and
    // it is the fastest way to lose a transport department's trust.
    expect(NORM_NOTE['BS-IV']).toMatch(/superseded/i);
    expect(NORM_NOTE['BS-IV']).not.toMatch(/\bclean\b/i);

    expect(NORM_NOTE['BS-III']).toMatch(/obsolete/i);
    expect(NORM_NOTE['BS-III']).not.toMatch(/\bclean\b/i);
  });

  it('bands a modern electric bus as excellent and an old diesel as poor', () => {
    expect(greenBand(greenScore(bus({ fuel: 'electric', norm: 'zero-tailpipe', year: 2025 }), NOW)))
      .toBe('excellent');
    expect(greenBand(greenScore(bus({ fuel: 'diesel', norm: 'BS-III', year: 2008 }), NOW)))
      .toBe('poor');
  });

  it('carries the estimated flag through to the breakdown', () => {
    const b = greenScoreBreakdown(bus({ emissionDataEstimated: true }), NOW);
    expect(b.estimated).toBe(true);
  });
});
