import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Bottom sheet. Sits inside the app frame rather than the viewport so it
 * behaves the same in the desktop device preview as on a phone.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeight = '82%',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxHeight?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-ink/35 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="absolute inset-x-0 bottom-0 z-50 flex flex-col rounded-t-sheet bg-surface shadow-sheet"
            style={{ maxHeight }}
          >
            <div className="flex justify-center pb-1 pt-2.5">
              <span className="h-1 w-9 rounded-full bg-line-strong" />
            </div>

            {(title || subtitle) && (
              <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-1">
                <div className="min-w-0">
                  {title && (
                    <h2 className="font-display text-[17px] font-bold leading-tight text-ink">
                      {title}
                    </h2>
                  )}
                  {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-3">{subtitle}</p>}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-3"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            <div className="scroll-area min-h-0 flex-1 px-4 pb-4">{children}</div>

            {footer && (
              <div className="border-t border-line bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Non-modal sheet permanently docked over a map. */
export function DockedSheet({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'rounded-t-sheet border-t border-line bg-surface shadow-sheet',
        className,
      )}
    >
      <div className="flex justify-center pb-1 pt-2.5">
        <span className="h-1 w-9 rounded-full bg-line-strong" />
      </div>
      {children}
    </motion.div>
  );
}
