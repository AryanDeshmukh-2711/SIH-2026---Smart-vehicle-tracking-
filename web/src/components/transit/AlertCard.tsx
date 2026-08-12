import { Link } from 'react-router-dom';
import {
  ChevronRight,
  AlertTriangle,
  Ban,
  BellRing,
  CloudSnow,
  Construction,
  Info,
  MapPinOff,
  Timer,
} from 'lucide-react';
import type { AlertKind, AlertSeverity, ServiceAlert } from '@/types';
import { ROUTE_BY_ID } from '@/data/routes';
import { relativeAge } from '@/lib/eta';
import { cn } from '@/lib/cn';

const KIND_ICON: Record<AlertKind, typeof Info> = {
  delay: Timer,
  cancellation: Ban,
  'route-change': Construction,
  'road-closure': AlertTriangle,
  weather: CloudSnow,
  'stop-change': MapPinOff,
  arrival: BellRing,
};

const SEVERITY_STYLE: Record<AlertSeverity, { chip: string; icon: string; border: string }> = {
  info: { chip: 'bg-info-bg text-info', icon: 'bg-info-bg text-info', border: 'border-line' },
  warning: { chip: 'bg-warn-bg text-warn', icon: 'bg-warn-bg text-warn', border: 'border-warn-line' },
  severe: { chip: 'bg-bad-bg text-bad', icon: 'bg-bad-bg text-bad', border: 'border-bad-line' },
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  info: 'Notice',
  warning: 'Disruption',
  severe: 'Severe',
};

/**
 * A service alert always names its source. A landslide notice from the state
 * disaster authority and a crowd-sourced delay report are not the same claim,
 * and the passenger deciding whether to leave now needs to know which one
 * they are reading.
 */
export function AlertCard({
  alert,
  onRead,
  compact,
}: {
  alert: ServiceAlert;
  onRead?: (id: string) => void;
  compact?: boolean;
}) {
  const Icon = KIND_ICON[alert.kind];
  const style = SEVERITY_STYLE[alert.severity];
  const ageSec = (Date.now() - new Date(alert.issuedAt).getTime()) / 1000;
  const routes = alert.affectedRouteIds.map((id) => ROUTE_BY_ID.get(id)?.shortName).filter(Boolean);

  return (
    <article
      className={cn(
        'card relative overflow-hidden p-3.5',
        style.border,
        !alert.read && 'bg-surface',
      )}
      onClick={() => !alert.read && onRead?.(alert.id)}
    >
      {!alert.read && (
        <span className="absolute right-3.5 top-3.5 h-[7px] w-[7px] rounded-full bg-brand-500" />
      )}

      <div className="flex gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
            style.icon,
          )}
        >
          <Icon size={17} strokeWidth={2.2} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'rounded-[6px] px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-[0.05em]',
                style.chip,
              )}
            >
              {SEVERITY_LABEL[alert.severity]}
            </span>
            {routes.map((r) => (
              <span
                key={r}
                className="rounded-[6px] bg-surface-3 px-1.5 py-[1px] text-[10.5px] font-bold text-ink-2"
              >
                {r}
              </span>
            ))}
            <span className="text-[11px] text-ink-4">{relativeAge(ageSec)}</span>
          </div>

          <h3 className="mt-1.5 pr-4 text-[14px] font-bold leading-snug text-ink">{alert.title}</h3>

          {!compact && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{alert.body}</p>
          )}

          <p className="mt-1.5 text-[11px] text-ink-4">Source: {alert.source}</p>
        </div>
      </div>
    </article>
  );
}

/**
 * One-line banner used at the top of a route or stop screen.
 *
 * Genuinely one line now. It used to print the title *and* the full body, which
 * on Home meant a three-line paragraph of disruption prose sitting above the
 * departures the reader actually came for. The title carries the warning; the
 * body is a tap away on the notifications screen.
 */
export function AlertStrip({ alert }: { alert: ServiceAlert }) {
  const Icon = KIND_ICON[alert.kind];
  const style = SEVERITY_STYLE[alert.severity];
  const tone =
    alert.severity === 'severe' ? 'text-bad' : alert.severity === 'warning' ? 'text-warn' : 'text-info';

  return (
    <Link
      to="/alerts"
      className={cn(
        'flex items-center gap-2 rounded-field border px-3 py-2 transition-opacity hover:opacity-90',
        style.border,
        alert.severity === 'severe'
          ? 'bg-bad-bg'
          : alert.severity === 'warning'
            ? 'bg-warn-bg'
            : 'bg-info-bg',
      )}
    >
      <Icon size={15} strokeWidth={2.3} className={cn('shrink-0', tone)} />
      <span className={cn('min-w-0 flex-1 truncate text-[12.5px] font-semibold', tone)}>
        {alert.title}
      </span>
      <ChevronRight size={14} strokeWidth={2.5} className={cn('shrink-0 opacity-60', tone)} />
    </Link>
  );
}
