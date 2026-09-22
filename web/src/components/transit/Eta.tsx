import { AlertTriangle, Gauge, Info, SignalHigh, SignalLow, SignalMedium, TrafficCone } from 'lucide-react';
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
import { conditionLabel } from '@/services/simulation/traffic';
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
 * One line about the vehicle, not three.
 *
 * Freshness, road conditions and confidence used to each get their own row, so a
 * bus card stacked up to three sentences of caveat under a single number and the
 * reader had to work out which one mattered. They are mutually ranked instead:
 * the worst true thing wins and nothing else is said.
 *
 * Order is by what changes the passenger's decision — a cancelled service beats a
 * lost signal, which beats traffic, which beats an ordinary freshness note.
 */
export function LiveStatusLine({
  live,
  className,
}: {
  live: VehiclePosition;
  className?: string;
}) {
  if (live.status === 'cancelled') {
    return (
      <Line tone="bad" icon={AlertTriangle} className={className}>
        <span className="font-semibold">This service is cancelled.</span>
      </Line>
    );
  }

  if (live.status === 'signal-lost') {
    return (
      <Line tone="warn" icon={AlertTriangle} className={className}>
        <span className="font-semibold">Signal lost.</span> Last seen at{' '}
        {live.lastSeenStopName?.replace(/,.*$/, '') ?? 'an earlier stop'}, {relativeAge(live.ageSec)}.
      </Line>
    );
  }

  const level = live.congestion === undefined ? 'normal' : conditionLabel(live.congestion);

  if (level === 'slow' || level === 'heavy') {
    const pct = Math.round((1 - (live.congestion ?? 1)) * 100);
    return (
      <Line tone={level === 'heavy' ? 'warn' : 'muted'} icon={TrafficCone} className={className}>
        {live.delayCause ? (
          <>
            <span className="font-semibold">{live.delayCause}</span> · {pct}% slower than usual
          </>
        ) : (
          <>
            {level === 'heavy' ? 'Heavy traffic' : 'Slow traffic'} ahead · {pct}% slower than usual
          </>
        )}
      </Line>
    );
  }

  if (level === 'clear') {
    return (
      <Line tone="ok" icon={Gauge} className={className}>
        Road is clear — running ahead of the usual pace
      </Line>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5 text-[11.5px] text-ink-4', className)}>
      <span
        className={cn('h-[6px] w-[6px] rounded-full', live.ageSec < 60 ? 'bg-ok pulse-dot' : 'bg-warn')}
      />
      <span>Updated {relativeAge(live.ageSec)}</span>
    </div>
  );
}

const LINE_TONE = {
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  muted: 'text-ink-3',
} as const;

function Line({
  tone,
  icon: Icon,
  className,
  children,
}: {
  tone: keyof typeof LINE_TONE;
  icon: typeof AlertTriangle;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn('flex items-start gap-1.5 text-[11.5px] leading-snug', LINE_TONE[tone], className)}
    >
      <Icon size={12} strokeWidth={2.4} className="mt-px shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * Why the number is a range, and where it came from.
 *
 * Detail screens only. A card gets `LiveStatusLine` and nothing else.
 */
export function ConfidenceNote({
  confidence,
  live,
}: {
  confidence: Confidence;
  live?: VehiclePosition;
}) {
  const onTimetable = live ? live.ageSec >= TIMETABLE_FALLBACK_AFTER_SEC : false;
  if (confidence === 'high' && !onTimetable) return null;

  return (
    <div className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-3">
      <Info size={12} strokeWidth={2.3} className="mt-[2px] shrink-0" />
      <span>
        <span className="font-semibold">{CONFIDENCE_LABEL[confidence]}.</span>{' '}
        {onTimetable
          ? 'Too stale to predict from, so these times come from the printed timetable.'
          : CONFIDENCE_NOTE[confidence]}
      </span>
    </div>
  );
}
