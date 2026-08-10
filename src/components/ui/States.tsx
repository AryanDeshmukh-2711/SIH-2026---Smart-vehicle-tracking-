import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* ------------------------------- skeletons -------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-[8px]', className)} />;
}

/** Loading placeholder shaped like the bus cards it replaces. */
export function BusCardSkeleton() {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-14" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="ml-auto h-5 w-16 rounded-full" />
      </div>
      <div className="flex items-end justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <BusCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ------------------------------ state blocks ------------------------------ */

export type StateTone = 'neutral' | 'warn' | 'bad' | 'brand';

const ICON_TONE: Record<StateTone, string> = {
  neutral: 'bg-surface-3 text-ink-3',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  brand: 'bg-brand-50 text-brand-600',
};

/**
 * The single component behind every empty, error and permission state. Each one
 * states what happened, why, and gives at least one way forward — a dead end
 * with a shrug icon is not an acceptable state in a transport app.
 */
export function StateBlock({
  icon,
  title,
  body,
  tone = 'neutral',
  actions,
  compact,
  className,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  tone?: StateTone;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'px-4 py-7' : 'px-6 py-12',
        className,
      )}
    >
      <span
        className={cn(
          'mb-3.5 flex items-center justify-center rounded-[14px]',
          compact ? 'h-11 w-11' : 'h-14 w-14',
          ICON_TONE[tone],
        )}
      >
        {icon}
      </span>
      <h3 className={cn('font-display font-bold text-ink', compact ? 'text-[15px]' : 'text-[17px]')}>
        {title}
      </h3>
      {body && (
        <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-ink-3">{body}</p>
      )}
      {actions && <div className="mt-5 flex w-full max-w-[300px] flex-col gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------ inline notice ----------------------------- */

const NOTICE_TONE = {
  info: 'bg-info-bg border-info-line text-info',
  warn: 'bg-warn-bg border-warn-line text-warn',
  bad: 'bg-bad-bg border-bad-line text-bad',
  ok: 'bg-ok-bg border-ok-line text-ok',
  neutral: 'bg-surface-3 border-line text-ink-2',
} as const;

/** Contextual strip — stale data, degraded confidence, active disruption. */
export function Notice({
  tone = 'info',
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof NOTICE_TONE;
  icon?: ReactNode;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-field border px-3 py-2.5',
        NOTICE_TONE[tone],
        className,
      )}
    >
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <div className="text-[13px] font-bold leading-snug">{title}</div>}
        {children && (
          <div className={cn('text-[12.5px] leading-relaxed', title && 'mt-0.5 opacity-90')}>
            {children}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}
