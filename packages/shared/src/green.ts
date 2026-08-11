/**
 * Green Score and CO₂ accounting.
 *
 * Every number here is lifted directly from the HimGati SRS §9 so the figures on
 * screen can be defended line by line. Nothing is invented, and anything we had
 * to infer is flagged via `assumptions` rather than quietly rounded in.
 */

import type { Bus, EmissionNorm, FuelType } from './types';

/* ----------------------------- Green Score ------------------------------- */
/* SRS §9.2:  Green Score = Fuel (50%) + Emission Norm (35%) + Bus Age (15%)  */

const FUEL_POINTS: Record<FuelType, number> = {
  electric: 100,
  cng: 80,
  hybrid: 70,
  diesel: 40,
};

const NORM_POINTS: Record<EmissionNorm, number> = {
  'zero-tailpipe': 100,
  'BS-VI': 100,
  'BS-IV': 65,
  'BS-III': 30,
};

/** SRS §9.2 age bands, in years. */
function agePoints(ageYears: number): number {
  if (ageYears <= 3) return 100;
  if (ageYears <= 8) return 70;
  if (ageYears <= 12) return 45;
  return 20;
}

export const GREEN_WEIGHTS = { fuel: 0.5, norm: 0.35, age: 0.15 } as const;

export interface GreenScoreBreakdown {
  score: number;
  fuel: { points: number; weighted: number };
  norm: { points: number; weighted: number };
  age: { points: number; weighted: number; years: number };
  estimated: boolean;
}

export function greenScoreBreakdown(bus: Bus, now = new Date()): GreenScoreBreakdown {
  const years = Math.max(0, now.getFullYear() - bus.year);
  const fuel = FUEL_POINTS[bus.fuel];
  const norm = NORM_POINTS[bus.norm];
  const age = agePoints(years);

  return {
    score: Math.round(fuel * GREEN_WEIGHTS.fuel + norm * GREEN_WEIGHTS.norm + age * GREEN_WEIGHTS.age),
    fuel: { points: fuel, weighted: fuel * GREEN_WEIGHTS.fuel },
    norm: { points: norm, weighted: norm * GREEN_WEIGHTS.norm },
    age: { points: age, weighted: age * GREEN_WEIGHTS.age, years },
    estimated: bus.emissionDataEstimated,
  };
}

export function greenScore(bus: Bus, now = new Date()): number {
  return greenScoreBreakdown(bus, now).score;
}

export type GreenBand = 'excellent' | 'good' | 'fair' | 'poor';

export function greenBand(score: number): GreenBand {
  if (score >= 85) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 45) return 'fair';
  return 'poor';
}

export const GREEN_BAND_LABEL: Record<GreenBand, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Below par',
};

/* -------------------------------- CO₂ ------------------------------------ */
/* SRS §9.3: CO₂ saved = (car emission − bus emission) × trip distance         */

/** kg CO₂ per passenger-km. */
export const EMISSION_FACTORS = {
  carPetrolSolo: 0.17,
  busDiesel: 0.05,
  busCng: 0.04,
  busElectric: 0.02,
  /** Not specified in the SRS; interpolated between diesel and electric. */
  busHybrid: 0.035,
} as const;

export function busEmissionFactor(fuel: FuelType): number {
  switch (fuel) {
    case 'electric':
      return EMISSION_FACTORS.busElectric;
    case 'cng':
      return EMISSION_FACTORS.busCng;
    case 'hybrid':
      return EMISSION_FACTORS.busHybrid;
    case 'diesel':
      return EMISSION_FACTORS.busDiesel;
  }
}

/**
 * CO₂ avoided by taking this bus instead of driving the same distance alone in
 * a petrol car. Always an estimate — the UI must say so.
 */
export function co2SavedKg(fuel: FuelType, distanceKm: number): number {
  const saved = (EMISSION_FACTORS.carPetrolSolo - busEmissionFactor(fuel)) * distanceKm;
  return Math.round(saved * 100) / 100;
}

export function co2EmittedKg(fuel: FuelType, distanceKm: number): number {
  return Math.round(busEmissionFactor(fuel) * distanceKm * 100) / 100;
}

/** A tree absorbs roughly 22 kg CO₂ a year (commonly cited planning figure). */
export const TREE_ABSORPTION_KG_PER_YEAR = 22;

export function treesEquivalent(kg: number): number {
  return Math.round((kg / TREE_ABSORPTION_KG_PER_YEAR) * 10) / 10;
}

/**
 * The assumptions behind every green number in the app, surfaced verbatim on
 * the Sustainability screen. Estimates presented without their basis are just
 * marketing.
 */
export const GREEN_ASSUMPTIONS: string[] = [
  'Comparison baseline is one person driving a petrol car alone (0.17 kg CO₂ per km).',
  'Bus figures are per passenger-km at typical occupancy: electric 0.02, CNG 0.04, diesel 0.05 kg CO₂/km.',
  'Hybrid buses use 0.035 kg CO₂/km, interpolated between diesel and electric — not a measured value.',
  'Electric bus figures count tailpipe emissions only; grid generation emissions are not included.',
  'Tree equivalence assumes 22 kg CO₂ absorbed per mature tree per year.',
  'Distances come from route road-distance tables, not straight-line distance.',
];

/* ------------------------------ presentation ------------------------------ */

export const FUEL_LABEL: Record<FuelType, string> = {
  electric: 'Electric',
  cng: 'CNG',
  hybrid: 'Hybrid',
  diesel: 'Diesel',
};

export const NORM_LABEL: Record<EmissionNorm, string> = {
  'zero-tailpipe': 'Zero tailpipe emission',
  'BS-VI': 'Bharat Stage VI',
  'BS-IV': 'Bharat Stage IV',
  'BS-III': 'Bharat Stage III',
};

/**
 * Honest one-line characterisation of an emission standard. BS-IV and BS-III are
 * explicitly *not* described as clean — the SRS calls this out, and mislabelling
 * them would be the single fastest way to lose a transport department's trust.
 */
export const NORM_NOTE: Record<EmissionNorm, string> = {
  'zero-tailpipe': 'No exhaust emissions at the roadside.',
  'BS-VI': 'Current Indian standard. Sharply lower NOx and particulates than BS-IV.',
  'BS-IV': 'Superseded standard. Emits materially more NOx and particulates than BS-VI.',
  'BS-III': 'Obsolete standard. Among the highest-emitting buses still in service.',
};
