import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

/* --------------------------------- stars ---------------------------------- */

export function Stars({
  value,
  size = 13,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-[1.5px]', className)} aria-label={`${value} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-line-strong" fill="currentColor" strokeWidth={0} />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} className="text-[#E8A93B]" fill="currentColor" strokeWidth={0} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Horizontal score bar used for the four review dimensions. */
export function ScoreBar({
  label,
  value,
  max = 5,
  hint,
}: {
  label: string;
  value: number;
  max?: number;
  hint?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span className="text-[13px] font-bold text-ink tnum">{value.toFixed(1)}</span>
      </div>
      <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && <p className="mt-1 text-[11px] text-ink-4">{hint}</p>}
    </div>
  );
}

/* ---------------------------------- ring ---------------------------------- */

/**
 * Score ring. Deliberately thin-stroked and single-colour — a thick multi-colour
 * donut reads as a game HUD, which is not what a transport department wants
 * beside an emissions figure.
 */
export function Ring({
  value,
  max = 100,
  size = 92,
  stroke = 7,
  color = 'var(--color-brand-600)',
  track = 'var(--color-surface-3)',
  label,
  sublabel,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: string;
  sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[21px] font-extrabold leading-none text-ink tnum">
          {label ?? Math.round(value)}
        </span>
        {sublabel && (
          <span className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-ink-4">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- bar chart -------------------------------- */

/** Compact column chart for the sustainability dashboard. */
export function BarChart({
  data,
  unit = '',
  height = 96,
}: {
  data: Array<{ label: string; value: number; highlight?: boolean }>;
  unit?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-semibold text-ink-3 tnum">
            {d.value > 0 ? `${d.value}${unit}` : ''}
          </span>
          <div
            className={cn(
              'w-full rounded-t-[4px] transition-[height] duration-500',
              d.highlight ? 'bg-brand-600' : 'bg-brand-200',
            )}
            style={{ height: `${Math.max(3, (d.value / max) * (height - 34))}px` }}
          />
          <span className="text-[9.5px] font-medium text-ink-4">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- occupancy -------------------------------- */

export function OccupancyMeter({ level, className }: { level: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-end gap-[2px]', className)} aria-hidden>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'w-[3px] rounded-[1px] transition-colors',
            i === 1 && 'h-[6px]',
            i === 2 && 'h-[9px]',
            i === 3 && 'h-[12px]',
            i <= level
              ? level === 3
                ? 'bg-warn'
                : 'bg-ok'
              : 'bg-line-strong',
          )}
        />
      ))}
    </span>
  );
}
