import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/cn';

export function TextField({
  icon,
  trailing,
  className,
  inputClassName,
  inputRef,
  ...rest
}: {
  icon?: ReactNode;
  trailing?: ReactNode;
  inputClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-field border border-line bg-surface px-3.5',
        'h-12 transition-colors focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100',
        className,
      )}
    >
      {icon && <span className="shrink-0 text-ink-4">{icon}</span>}
      <input
        ref={inputRef}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-[14.5px] font-medium text-ink outline-none',
          'placeholder:font-normal placeholder:text-ink-4',
          inputClassName,
        )}
        {...rest}
      />
      {trailing}
    </div>
  );
}

/** The large search entry point used on Home and Search. */
export function SearchField(
  props: InputHTMLAttributes<HTMLInputElement> & {
    trailing?: ReactNode;
    inputRef?: Ref<HTMLInputElement>;
  },
) {
  const { trailing, className, ...rest } = props;
  return (
    <TextField
      icon={<Search size={18} strokeWidth={2.2} />}
      trailing={trailing}
      className={cn('h-[52px] shadow-xs', className)}
      inputClassName="text-[15px]"
      {...rest}
    />
  );
}

/** Read-only field that acts as a navigation target (Home search, planner rows). */
export function FieldButton({
  icon,
  label,
  value,
  placeholder,
  onClick,
  trailing,
  className,
}: {
  icon?: ReactNode;
  label?: string;
  value?: string;
  placeholder?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
}) {
  const filled = Boolean(value);
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-field border border-line bg-surface px-3.5 py-2.5',
        'text-left transition-colors hover:border-line-strong focus-ring',
        className,
      )}
    >
      {icon && <span className="shrink-0 text-ink-4">{icon}</span>}
      <span className="min-w-0 flex-1">
        {label && (
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
            {label}
          </span>
        )}
        <span
          className={cn(
            'block truncate text-[14.5px]',
            filled ? 'font-semibold text-ink' : 'text-ink-4',
          )}
        >
          {value || placeholder}
        </span>
      </span>
      {trailing}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 focus-ring',
        checked ? 'bg-brand-600' : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[21px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}

/** Segmented control — used for tabs inside a screen, never for navigation. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex gap-0.5 rounded-field border border-line bg-surface-3 p-0.5',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-[9px] px-2 py-[7px] text-[12.5px] font-semibold transition-all duration-150',
            value === o.value
              ? 'bg-surface text-ink shadow-xs'
              : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
