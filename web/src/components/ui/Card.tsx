import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={cn('card', padded && 'p-4', className)}>{children}</div>;
}

/** Card that navigates. Keeps the tap target and the chevron consistent. */
export function CardLink({
  to,
  children,
  className,
  padded = true,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'card block transition-all duration-150 hover:border-line-strong hover:shadow-sm active:scale-[0.995]',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Section heading with an optional trailing action. Used at the top of every
 * grouped block so the rhythm of the page is identical on every screen.
 */
export function SectionHeader({
  title,
  hint,
  action,
  actionTo,
  onAction,
  className,
}: {
  title: string;
  hint?: string;
  action?: string;
  actionTo?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('mb-2.5 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold leading-tight text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{hint}</p>}
      </div>

      {action && actionTo && (
        <Link
          to={actionTo}
          className="flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700"
        >
          {action}
          <ChevronRight size={14} strokeWidth={2.5} />
        </Link>
      )}
      {action && !actionTo && (
        <button
          onClick={onAction}
          className="flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700"
        >
          {action}
          <ChevronRight size={14} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

/** Hairline-separated list container. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('card divide-y divide-line overflow-hidden', className)}>{children}</div>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  trailing,
  to,
  onClick,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const inner = (
    <>
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-3 text-ink-2">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-ink">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{subtitle}</span>
        )}
      </span>
      {trailing ?? (to || onClick ? <ChevronRight size={16} className="shrink-0 text-ink-4" /> : null)}
    </>
  );

  const cls = cn(
    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
    (to || onClick) && 'hover:bg-surface-2 active:bg-surface-3',
    className,
  );

  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** Small labelled figure — the unit of most detail panels. */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'ok' | 'warn' | 'bad' | 'brand';
  className?: string;
}) {
  const toneCls = {
    default: 'text-ink',
    ok: 'text-ok',
    warn: 'text-warn',
    bad: 'text-bad',
    brand: 'text-brand-600',
  }[tone];

  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
        {label}
      </div>
      <div className={cn('mt-1 font-display text-[17px] font-bold leading-tight tnum', toneCls)}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{hint}</div>}
    </div>
  );
}
