import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info';

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-2 border-line',
  brand: 'bg-brand-50 text-brand-700 border-brand-100',
  ok: 'bg-ok-bg text-ok border-ok-line',
  warn: 'bg-warn-bg text-warn border-warn-line',
  bad: 'bg-bad-bg text-bad border-bad-line',
  info: 'bg-info-bg text-info border-info-line',
};

/** Small status token. Rounded, not pill — pills are reserved for live status. */
export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[7px] border px-1.5 py-0.5',
        'text-[11px] font-semibold leading-[16px] tracking-[0.01em]',
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Live status token — the one place a fully rounded shape is used. */
export function StatusPill({
  tone = 'ok',
  pulse,
  children,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const dot = {
    neutral: 'bg-ink-4',
    brand: 'bg-brand-500',
    ok: 'bg-ok',
    warn: 'bg-warn',
    bad: 'bg-bad',
    info: 'bg-info',
  }[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px]',
        'text-[11.5px] font-semibold leading-[16px]',
        TONE[tone],
        className,
      )}
    >
      <span className={cn('h-[6px] w-[6px] shrink-0 rounded-full', dot, pulse && 'pulse-dot')} />
      {children}
    </span>
  );
}

/** Filter / selection chip. */
export function Chip({
  active,
  icon,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border px-3 py-[7px]',
        'text-[13px] font-semibold transition-colors focus-ring',
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Horizontally scrolling chip row with edge padding that matches the screen. */
export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4', className)}>
      {children}
    </div>
  );
}
