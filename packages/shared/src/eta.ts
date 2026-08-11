/**
 * ETA presentation rules (SRS §6.2 + §8.3).
 *
 * The governing principle: confidence is a function of *data freshness*, and we
 * never show a precision we do not have. A stale feed produces a range, not a
 * sharper-looking single number.
 */

import type { Confidence, StopPrediction, TripStatus } from './types';

/** SRS §8.3 freshness thresholds, in seconds. */
export const FRESHNESS_THRESHOLDS = { high: 60, medium: 300 } as const;

/** After this long without a fix, the vehicle is declared Signal Lost (FR-5). */
export const SIGNAL_LOST_AFTER_SEC = 180;

/** Beyond this, live prediction is abandoned and we fall back to the timetable. */
export const TIMETABLE_FALLBACK_AFTER_SEC = 900;

export function confidenceFromAge(ageSec: number): Confidence {
  if (ageSec < FRESHNESS_THRESHOLDS.high) return 'high';
  if (ageSec < FRESHNESS_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Turn a prediction into the exact string the SRS specifies:
 *   high   → "7 min"
 *   medium → "7 min (±2)"
 *   low    → "8–14 min"
 * FR-14: this never returns an empty string.
 */
export function formatEta(p: Pick<StopPrediction, 'etaMin' | 'rangeMin' | 'confidence'>): string {
  if (p.etaMin <= 0) return 'Arriving';
  if (p.etaMin < 1) return 'Under a minute';

  switch (p.confidence) {
    case 'high':
      return `${Math.round(p.etaMin)} min`;
    case 'medium': {
      const spread = Math.max(1, Math.round((p.rangeMin[1] - p.rangeMin[0]) / 2));
      return `${Math.round(p.etaMin)} min (±${spread})`;
    }
    case 'low':
      return `${Math.round(p.rangeMin[0])}–${Math.round(p.rangeMin[1])} min`;
  }
}

/** Short form for dense lists — the range collapses but the ± is kept. */
export function formatEtaCompact(p: Pick<StopPrediction, 'etaMin' | 'rangeMin' | 'confidence'>): string {
  if (p.etaMin <= 0) return 'Now';
  if (p.confidence === 'low') return `${Math.round(p.rangeMin[0])}–${Math.round(p.rangeMin[1])}m`;
  return `${Math.round(p.etaMin)}m`;
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export const CONFIDENCE_NOTE: Record<Confidence, string> = {
  high: 'Live position updated less than a minute ago.',
  medium: 'Last position is a few minutes old, so the arrival time carries a margin.',
  low: 'The bus has not reported recently. This is a modelled range, not a live reading.',
};

/** Widen the point estimate into an honest range for the given confidence. */
export function rangeFor(etaMin: number, confidence: Confidence): [number, number] {
  switch (confidence) {
    case 'high':
      return [Math.max(0, etaMin - 1), etaMin + 1];
    case 'medium':
      return [Math.max(0, etaMin - 2), etaMin + 2];
    case 'low': {
      const spread = Math.max(3, etaMin * 0.35);
      return [Math.max(0, Math.round(etaMin - spread)), Math.round(etaMin + spread)];
    }
  }
}

/* ------------------------------- statuses -------------------------------- */

export const STATUS_LABEL: Record<TripStatus, string> = {
  scheduled: 'Scheduled',
  running: 'On time',
  delayed: 'Delayed',
  cancelled: 'Cancelled',
  'signal-lost': 'Signal lost',
  ended: 'Trip ended',
};

export type StatusTone = 'ok' | 'warn' | 'bad' | 'neutral';

export function statusTone(status: TripStatus): StatusTone {
  switch (status) {
    case 'running':
      return 'ok';
    case 'delayed':
    case 'signal-lost':
      return 'warn';
    case 'cancelled':
      return 'bad';
    default:
      return 'neutral';
  }
}

/** "4 min ago" / "just now" — used wherever we admit how old the data is. */
export function relativeAge(ageSec: number): string {
  if (ageSec < 15) return 'just now';
  if (ageSec < 60) return `${Math.round(ageSec)}s ago`;
  const min = Math.round(ageSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return `${hr} hr ago`;
}

/**
 * Uses the same 5-minute threshold that promotes a trip to `delayed`, so the
 * status badge and this line can never contradict each other.
 */
export function delayLabel(delayMin: number): string {
  if (delayMin <= -3) return `${Math.abs(Math.round(delayMin))} min early`;
  if (delayMin < 5) return 'Running to schedule';
  return `${Math.round(delayMin)} min behind schedule`;
}
