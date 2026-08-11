import { Link } from 'react-router-dom';
import { Bus as BusIcon } from 'lucide-react';
import type { LiveBus } from '@/types';
import { STOP_BY_ID } from '@/data/stops';
import { formatEta } from '@/lib/eta';
import { pretty24 } from '@/lib/format';
import { ConfidenceMark } from './Eta';
import { cn } from '@/lib/cn';

/**
 * Stop-by-stop timeline for a running trip.
 *
 * Every upcoming stop carries its own ETA and confidence mark (FR-8, FR-12) —
 * the passenger three stops down the line needs the same honesty as the one at
 * the next stop. Passed stops are dimmed but kept, so a boarding passenger can
 * confirm the bus is going the direction they think it is.
 */
export function RouteTimeline({
  live,
  highlightStopId,
  compact,
}: {
  live: LiveBus;
  highlightStopId?: string;
  compact?: boolean;
}) {
  const { route, live: pos } = live;
  const predictions = new Map(pos.predictions.map((p) => [p.stopId, p]));

  return (
    <ol className="relative">
      {route.stopIds.map((stopId, i) => {
        const stop = STOP_BY_ID.get(stopId);
        const prediction = predictions.get(stopId);
        const passed = i < pos.nextStopIndex;
        const isNext = i === pos.nextStopIndex && pos.status !== 'cancelled';
        const highlighted = stopId === highlightStopId;
        const last = i === route.stopIds.length - 1;

        return (
          <li key={stopId} className="relative flex gap-3">
            {/* rail */}
            <div className="relative flex w-4 shrink-0 flex-col items-center">
              {!last && (
                <span
                  className={cn(
                    'absolute top-[18px] bottom-0 w-[2px]',
                    passed ? 'bg-line' : 'bg-brand-200',
                  )}
                />
              )}
              <span
                className={cn(
                  'relative z-10 mt-[13px] rounded-full border-2 bg-surface transition-colors',
                  isNext
                    ? 'h-[11px] w-[11px] border-brand-600'
                    : passed
                      ? 'h-[7px] w-[7px] border-line-strong bg-line-strong'
                      : 'h-[9px] w-[9px] border-brand-300',
                )}
              />
              {isNext && (
                <span className="absolute top-[7px] z-20 flex h-[23px] w-[23px] items-center justify-center rounded-full bg-brand-600 shadow-sm">
                  <BusIcon size={12} strokeWidth={2.6} className="text-white" />
                </span>
              )}
            </div>

            {/* content */}
            <div
              className={cn(
                'min-w-0 flex-1 border-b border-line py-2.5',
                last && 'border-b-0',
                highlighted && 'bg-brand-50/60',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/stop/${stopId}`}
                    className={cn(
                      'block truncate text-[13.5px] font-semibold transition-colors hover:text-brand-600',
                      passed ? 'text-ink-4' : 'text-ink',
                    )}
                  >
                    {stop?.name ?? stopId}
                  </Link>
                  {!compact && (
                    <div className="mt-0.5 text-[11.5px] text-ink-4 tnum">
                      {route.distancesKm[i]} km
                      {prediction && prediction.distanceKm > 0 && !passed && (
                        <span> · {prediction.distanceKm} km away</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  {passed ? (
                    <span className="text-[12px] font-medium text-ink-4">Departed</span>
                  ) : prediction ? (
                    <>
                      <div className="flex items-center justify-end gap-1.5">
                        <span
                          className={cn(
                            'text-[13.5px] font-bold tnum',
                            isNext ? 'text-brand-700' : 'text-ink',
                          )}
                        >
                          {formatEta(prediction)}
                        </span>
                        <ConfidenceMark confidence={prediction.confidence} />
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-4 tnum">
                        sched. {pretty24(prediction.scheduled)}
                      </div>
                    </>
                  ) : (
                    <span className="text-[12px] text-ink-4">—</span>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
