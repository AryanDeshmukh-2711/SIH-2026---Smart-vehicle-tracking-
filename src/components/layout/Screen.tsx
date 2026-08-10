import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Screen chrome.
 *
 * Every screen uses the same header geometry (48 px bar, 20 px title, 16 px
 * gutter) so moving between them never shifts the eye. Screens that own the
 * full viewport — the live map — opt out with `FullBleed`.
 */
export function ScreenHeader({
  title,
  subtitle,
  back = true,
  onBack,
  actions,
  transparent,
  large,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  actions?: ReactNode;
  transparent?: boolean;
  large?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();

  return (
    <header
      className={cn(
        'sticky top-0 z-20 shrink-0',
        transparent ? 'bg-transparent' : 'border-b border-line bg-surface/92 backdrop-blur-md',
        className,
      )}
    >
      <div className="flex h-12 items-center gap-2 px-2.5">
        {back && (
          <button
            onClick={() => (onBack ? onBack() : navigate(-1))}
            aria-label="Back"
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
              transparent
                ? 'bg-surface/90 text-ink shadow-sm backdrop-blur hover:bg-surface'
                : 'text-ink-2 hover:bg-surface-3',
            )}
          >
            <ChevronLeft size={20} strokeWidth={2.4} />
          </button>
        )}

        {!large && title && (
          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate font-display text-[16px] font-bold leading-tight text-ink">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-[11.5px] leading-tight text-ink-3">{subtitle}</p>
            )}
          </div>
        )}
        {large && <div className="flex-1" />}

        {actions && <div className="flex shrink-0 items-center gap-1.5 pr-1">{actions}</div>}
      </div>

      {large && title && (
        <div className="px-4 pb-3 pt-0.5">
          <h1 className="font-display text-[26px] font-extrabold leading-[1.15] tracking-[-0.025em] text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-[13px] leading-snug text-ink-3">{subtitle}</p>}
        </div>
      )}
    </header>
  );
}

/** Standard scrolling body with the app's gutter and bottom breathing room. */
export function ScreenBody({
  children,
  className,
  gutter = true,
}: {
  children: ReactNode;
  className?: string;
  gutter?: boolean;
}) {
  return (
    <div className={cn('scroll-area min-h-0 flex-1 bg-canvas', gutter && 'px-4', className)}>
      {children}
      <div className="h-5" />
    </div>
  );
}

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-h-0 flex-1 flex-col bg-canvas', className)}>{children}</div>;
}

/** Vertical rhythm helper — 20 px between sections, everywhere. */
export function Stack({
  children,
  gap = 5,
  className,
}: {
  children: ReactNode;
  gap?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const gapCls = { 2: 'space-y-2', 3: 'space-y-3', 4: 'space-y-4', 5: 'space-y-5', 6: 'space-y-6' }[gap];
  return <div className={cn(gapCls, className)}>{children}</div>;
}
