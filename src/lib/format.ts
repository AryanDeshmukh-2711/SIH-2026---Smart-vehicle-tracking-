import type { Occupancy } from '@/types';

/**
 * The whole app runs off one clock so screenshots, ETAs and timetables never
 * disagree with each other.
 */
export function now(): Date {
  return new Date();
}

export function hhmm(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function hhmm24(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "10:30" → "10:30 AM" */
export function pretty24(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return hhmm(d);
}

export function addMinutes(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60_000;
}

/** 375 → "6h 15m", 45 → "45 min" */
export function duration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

export function rupees(v: number): string {
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

export function kg(v: number): string {
  return `${v.toFixed(v < 10 ? 2 : 1)} kg`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const OCCUPANCY_LABEL: Record<Occupancy, string> = {
  empty: 'Seats free',
  comfortable: 'Comfortable',
  full: 'Full',
  unknown: 'Not reported',
};

/** 0–3 filled bars, matching the three occupancy levels the SRS defines. */
export const OCCUPANCY_LEVEL: Record<Occupancy, number> = {
  empty: 1,
  comfortable: 2,
  full: 3,
  unknown: 0,
};

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Deterministic 0–1 pseudo-random from a seed, so mock data never flickers. */
export function seeded(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
