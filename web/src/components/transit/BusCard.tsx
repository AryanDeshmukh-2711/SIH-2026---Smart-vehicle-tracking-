import { Link } from 'react-router-dom';
import { Accessibility, Bell, BellRing, MapPin, Users } from 'lucide-react';
import type { LiveBus, StopPrediction } from '@/types';
import { OCCUPANCY_LABEL, OCCUPANCY_LEVEL } from '@/lib/format';
import { OccupancyMeter } from '@/components/ui/Meters';
import { GreenStrip } from './Green';
import { EtaDisplay, FreshnessLine, StatusBadge } from './Eta';
import { useApp } from '@/store/AppState';
import { stopName as lookupStopName } from '@/data/stops';
import { cn } from '@/lib/cn';

/** "Shimla ISBT, Tutikandi" → "Shimla ISBT". Cards never have room for the rest. */
function shortStopName(stopId: string | undefined): string {
  if (!stopId) return '';
  return lookupStopName(stopId).replace(/,.*$/, '');
}

/**
 * The core repeated unit of the app.
 *
 * Layout order is fixed by SRS §10: route and headsign, then ETA as the largest
 * element, then where the bus is now, then the green identity. Neither the ETA
 * nor the green badge is ever collapsed behind an interaction.
 */
export function BusCard({
  live,
  prediction,
  stopName,
  platform,
  showTrack = true,
  className,
}: {
  live: LiveBus;
  prediction?: StopPrediction;
  stopName?: string;
  platform?: string;
  showTrack?: boolean;
  className?: string;
}) {
  const { isTracked, toggleTracked } = useApp();
  const tracked = isTracked(live.bus.id);
  const cancelled = live.live.status === 'cancelled';
  const waiting = live.live.status === 'scheduled';

  const nextStopName = shortStopName(live.route.stopIds[live.live.nextStopIndex]);
  // "Now near" is the last stop *passed*, not the one being approached —
  // otherwise the card says the bus is already where it is heading.
  const passedStopName = shortStopName(
    live.route.stopIds[Math.max(0, live.live.nextStopIndex - 1)],
  );

  // A vehicle still in its origin bay is departing, not arriving — saying
  // "arriving" there would be wrong in the one place it matters most.
  const boardingLabel = stopName ?? shortStopName(live.route.stopIds[0]);
  const whereLabel = waiting
    ? `Waiting at ${shortStopName(live.route.stopIds[0])}`
    : `Now near ${live.live.lastSeenStopName?.replace(/,.*$/, '') ?? passedStopName}`;

  return (
    <div
      className={cn(
        'card overflow-hidden transition-shadow hover:shadow-sm',
        cancelled && 'opacity-70',
        className,
      )}
    >
      <Link to={`/bus/${live.bus.id}`} className="block p-4 pb-3">
        {/* route identity */}
        <div className="flex items-center gap-2">
          <span className="rounded-[7px] bg-ink px-2 py-[3px] font-display text-[13px] font-extrabold leading-[17px] tracking-[0.01em] text-white">
            {live.route.shortName}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-2">
            {live.route.longName}
          </span>
          <StatusBadge status={live.live.status} delayMin={live.live.delayMin} />
        </div>

        {/* the number that matters */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {prediction ? (
              <>
                <EtaDisplay prediction={prediction} />
                <div className="mt-1 truncate text-[12px] text-ink-3">
                  {waiting ? `Departs from ${boardingLabel}` : `Arriving at ${boardingLabel}`}
                  {platform && <span className="text-ink-4"> · {platform}</span>}
                </div>
              </>
            ) : (
              <>
                <div className="font-display text-[24px] font-extrabold leading-none text-ink">
                  {cancelled
                    ? 'Cancelled'
                    : live.live.status === 'signal-lost'
                      ? 'No signal'
                      : `${live.live.speedKmph} km/h`}
                </div>
                <div className="mt-1 truncate text-[12px] text-ink-3">
                  {cancelled ? 'Replacement service at 18:15' : `Next stop ${nextStopName}`}
                </div>
              </>
            )}
          </div>

          <div className="shrink-0 text-right">
            <div className="font-display text-[13px] font-bold text-ink">
              {live.bus.registration}
            </div>
            <div className="mt-1 flex items-center justify-end gap-1.5 text-[11.5px] text-ink-3">
              <OccupancyMeter level={OCCUPANCY_LEVEL[live.live.occupancy]} />
              {OCCUPANCY_LABEL[live.live.occupancy]}
            </div>
          </div>
        </div>

        {/* where it is right now */}
        <div className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-2">
          <MapPin size={13} strokeWidth={2.3} className="shrink-0 text-ink-4" />
          <span className="truncate">{whereLabel}</span>
        </div>

        <FreshnessLine live={live.live} className="mt-1.5" />
      </Link>

      {/* green identity + actions */}
      <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-4 py-2.5">
        <GreenStrip bus={live.bus} score={live.greenScore} className="min-w-0 flex-1" />

        {live.bus.wheelchairAccessible && (
          <Accessibility size={14} className="shrink-0 text-ink-3" strokeWidth={2.2} />
        )}

        {showTrack && !cancelled && (
          <button
            onClick={() => toggleTracked(live.bus.id)}
            aria-label={tracked ? 'Stop notifying me' : 'Notify me'}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-[9px] border px-2 py-1 text-[11.5px] font-semibold transition-colors',
              tracked
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-line bg-surface text-ink-2 hover:border-line-strong',
            )}
          >
            {tracked ? <BellRing size={12} strokeWidth={2.4} /> : <Bell size={12} strokeWidth={2.4} />}
            {tracked ? 'Tracking' : 'Notify me'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Condensed row for dense lists — timetable, route detail, search results. */
export function BusRow({
  live,
  prediction,
  className,
}: {
  live: LiveBus;
  prediction?: StopPrediction;
  className?: string;
}) {
  // On a board at the route's own terminus, printing the destination would just
  // name the stop the reader is standing at.
  const terminatesHere =
    prediction?.stopId === live.route.stopIds[live.route.stopIds.length - 1];

  return (
    <Link
      to={`/bus/${live.bus.id}`}
      className={cn(
        'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2',
        className,
      )}
    >
      <span className="w-11 shrink-0 rounded-[7px] bg-ink px-1.5 py-1 text-center font-display text-[12px] font-extrabold text-white">
        {live.route.shortName}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-ink">
          {terminatesHere ? (
            <>
              From {live.route.origin}{' '}
              <span className="font-medium text-ink-3">· terminates here</span>
            </>
          ) : (
            live.route.destination
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <GreenStrip bus={live.bus} score={live.greenScore} showScore={false} />
        </span>
      </span>

      <span className="shrink-0 text-right">
        {prediction ? (
          <EtaDisplay prediction={prediction} size="sm" />
        ) : (
          <span className="text-[13px] font-semibold text-ink-3">—</span>
        )}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-ink-4">
          <Users size={10} strokeWidth={2.4} />
          {OCCUPANCY_LABEL[live.live.occupancy]}
        </span>
      </span>
    </Link>
  );
}
