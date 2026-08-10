import { AlertTriangle, Info, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';
import type { Confidence, StopPrediction, TripStatus, VehiclePosition } from '@/types';
import {
  CONFIDENCE_LABEL,
  CONFIDENCE_NOTE,
  STATUS_LABEL,
  TIMETABLE_FALLBACK_AFTER_SEC,
  formatEta,
  relativeAge,
  statusTone,
} from '@/lib/eta';
import { StatusPill } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

/**
 * ETA presentation.
 *
 * The rule the whole app hangs off: the number and its confidence are never
 * separated. A "7 min" with no freshness marker is a promise the data cannot
 * back, so the confidence indicator is part of the ETA component itself rather
 * than something a screen can forget to add.
 */

const CONFIDENCE_STYLE: Record<Confidence, { icon: typeof SignalHigh; cls: string }> = {
  high: { icon: SignalHigh, cls: 'text-ok' },
  medium: { icon: SignalMedium, cls: 'text-warn' },
  low: { icon: SignalLow, cls: 'text-ink-3' },
};

export function ConfidenceMark({
  confidence,
  withLabel,
  className,
}: {
  confidence: Confidence;
  withLabel?: boolean;
  className?: string;
}) {
  const { icon: Icon, cls } = CONFIDENCE_STYLE[confidence];
  return (
    <span
      className={cn('inline-flex items-center gap-1', cls, className)}
      title={CONFIDENCE_NOTE[confidence]}
    >
      <Icon size={13} strokeWidth={2.5} />
      {withLabel && (
        <span className="text-[11px] font-semibold capitalize">{confidence}</span>
      )}
    </span>
  );
}

/**
 * The primary ETA figure. Per SRS §10 this is the largest element on any card
 * it appears in, and it is never hidden behind a tap.
 */
export function EtaDisplay({
  prediction,
  size = 'md',
  className,
}: {
  prediction: StopPrediction;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const text = formatEta(prediction);
  const arriving = prediction.etaMin <= 0;

  const sizes = {
    sm: 'text-[17px]',
    md: 'text-[24px]',
    lg: 'text-[34px]',
  }[size];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        className={cn(
          'font-display font-extrabold leading-none tracking-[-0.02em] tnum',
          arriving ? 'text-ok' : 'text-ink',
          sizes,
        )}
      >
        {text}
      </span>
      <ConfidenceMark confidence={prediction.confidence} />
    </div>
  );
}

export function StatusBadge({ status, delayMin }: { status: TripStatus; delayMin?: number }) {
  const tone = statusTone(status);
  const toneMap = { ok: 'ok', warn: 'warn', bad: 'bad', neutral: 'neutral' } as const;

  const label =
    status === 'delayed' && delayMin
      ? `${Math.round(delayMin)} min late`
      : STATUS_LABEL[status];

  return (
    <StatusPill tone={toneMap[tone]} pulse={status === 'running'}>
      {label}
    </StatusPill>
  );
}

/**
 * The honesty line. When a vehicle stops reporting we say so, name the last
 * place it was seen and how long ago — rather than freezing the icon and
 * letting the user believe it is live (SRS §8.5).
 */
export function FreshnessLine({
  live,
  className,
}: {
  live: VehiclePosition;
  className?: string;
}) {
  if (live.status === 'signal-lost') {
    // Past the fallback threshold we stop modelling from a stale fix altogether
    // and say plainly that the timetable is now the source (SRS §8.5).
    const onTimetable = live.ageSec >= TIMETABLE_FALLBACK_AFTER_SEC;

    return (
      <div className={cn('flex items-start gap-1.5 text-[12px] leading-snug text-warn', className)}>
        <AlertTriangle size={13} strokeWidth={2.4} className="mt-px shrink-0" />
        <span>
          <span className="font-semibold">Signal lost.</span> Last seen at{' '}
          {live.lastSeenStopName ?? 'an earlier stop'}, {relativeAge(live.ageSec)}.{' '}
          {onTimetable
            ? 'Too stale to predict from — times below now come from the printed timetable.'
            : 'Times below are modelled, not live.'}
        </span>
      </div>
    );
  }

  if (live.status === 'cancelled') {
    return (
      <div className={cn('flex items-center gap-1.5 text-[12px] text-bad', className)}>
        <AlertTriangle size={13} strokeWidth={2.4} className="shrink-0" />
        <span className="font-semibold">This service is cancelled.</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5 text-[11.5px] text-ink-4', className)}>
      <span
        className={cn(
          'h-[6px] w-[6px] rounded-full',
          live.ageSec < 60 ? 'bg-ok pulse-dot' : 'bg-warn',
        )}
      />
      <span>Position updated {relativeAge(live.ageSec)}</span>
    </div>
  );
}

/** Explains, in one line, why a range is being shown instead of a number. */
export function ConfidenceNote({ confidence }: { confidence: Confidence }) {
  if (confidence === 'high') return null;
  return (
    <div className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-3">
      <Info size={12} strokeWidth={2.3} className="mt-[2px] shrink-0" />
      <span>
        <span className="font-semibold">{CONFIDENCE_LABEL[confidence]}.</span>{' '}
        {CONFIDENCE_NOTE[confidence]}
      </span>
    </div>
  );
}
