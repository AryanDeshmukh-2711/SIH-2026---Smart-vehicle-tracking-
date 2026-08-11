import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-xs',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-3 active:bg-surface-3',
  ghost: 'bg-transparent text-brand-600 hover:bg-brand-50 active:bg-brand-100',
  quiet: 'bg-surface-3 text-ink-2 hover:bg-line active:bg-line-strong',
  danger: 'bg-bad text-white hover:brightness-95 active:brightness-90 shadow-xs',
};

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-[10px]',
  md: 'h-11 px-4 text-[14px] gap-2 rounded-field',
  lg: 'h-[52px] px-5 text-[15px] gap-2 rounded-field',
};

const BASE =
  'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors duration-150 focus-ring disabled:opacity-45 disabled:pointer-events-none select-none';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
  className?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className,
  children,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(BASE, VARIANT[variant], SIZE[size], block && 'w-full', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  block,
  className,
  children,
}: CommonProps & { to: string }) {
  return (
    <Link
      to={to}
      className={cn(BASE, VARIANT[variant], SIZE[size], block && 'w-full', className)}
    >
      {children}
    </Link>
  );
}

/** Compact square action used in toolbars and card corners. */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: { label: string; children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-field border border-line bg-surface text-ink-2',
        'transition-colors hover:bg-surface-3 active:bg-line focus-ring',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
