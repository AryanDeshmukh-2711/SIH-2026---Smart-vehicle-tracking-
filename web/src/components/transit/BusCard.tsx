import { Link } from 'react-router-dom';
import { Accessibility, Bell, BellRing, Users } from 'lucide-react';
import type { LiveBus, StopPrediction } from '@/types';
import { OCCUPANCY_LABEL, OCCUPANCY_LEVEL } from '@/lib/format';
import { OccupancyMeter } from '@/components/ui/Meters';
import { GreenStrip } from './Green';
import { EtaDisplay, LiveStatusLine, StatusBadge } from './Eta';
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

  // The stop this card is about is the one the prediction is for. Callers used to
  // pass the user's *location label* here, which is only sometimes a stop name:
  // resolve by landmark and the card read "Arriving at Near Kufri Fun World",
  // by map pin "Arriving at Pinned location". The prediction is authoritative;
  // `stopName` is now only a fallback for cards rendered without one.
  const boardingLabel =
    shortStopName(prediction?.stopId) || stopName || shortStopName(live.route.stopIds[0]);

  // Only badge the states a passenger can act on. A pill reading "Scheduled"
  // beside "Departs 1 min" asks the reader to reconcile two facts that do not
  // need reconciling — and a vehicle still in its bay is not yet late in any
  // sense they can use, however its paperwork reads.
  const abnormal =
    cancelled || live.live.status === 'signal-lost' || live.live.status === 'delayed';

  return (
    <div
      className={cn(
        'card overflow-hidden transition-shadow hover:shadow-sm',
        cancelled && 'opacity-70',
        className,
      )}
    >
      <Link to={`/bus/${live.bus.id}`} className="block p-4 pb-3.5">
        {/* 1. which bus, where to */}
        <div className="flex items-center gap-2">
          <span className="rounded-[7px] bg-ink px-2 py-[3px] font-display text-[13px] font-extrabold leading-[17px] tracking-[0.01em] text-white">
            {live.route.shortName}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-2">
            {live.route.destination}
          </span>
          {abnormal && <StatusBadge status={live.live.status} delayMin={live.live.delayMin} />}
        </div>

        {/* 2. when — the one number the card exists for */}
        <div className="mt-2.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {prediction ? (
              <>
                <EtaDisplay prediction={prediction} />
                <div className="mt-1 truncate text-[12px] text-ink-3">
                  {waiting ? 'Departs' : 'Arrives'} {boardingLabel}
                  {platform && <span className="text-ink-4"> · {platform}</span>}
                </div>
              </>
            ) : (
              <>
                <div className="font-display text-[24px] font-extrabold leading-none text-ink">
                  {cancelled ? 'Cancelled' : live.live.status === 'signal-lost' ? 'No signal' : `${live.live.speedKmph} km/h`}
                </div>
                <div className="mt-1 truncate text-[12px] text-ink-3">
                  {cancelled ? 'No replacement listed' : `Next stop ${nextStopName}`}
                </div>
              </>
            )}
          </div>

          {/* 3. what it is like to board */}
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-1.5 text-[11.5px] text-ink-3">
              <OccupancyMeter level={OCCUPANCY_LEVEL[live.live.occupancy]} />
              {OCCUPANCY_LABEL[live.live.occupancy]}
            </div>
            <div className="mt-1.5 flex items-center justify-end gap-1.5">
              <GreenStrip bus={live.bus} score={live.greenScore} showScore={false} />
              {live.bus.wheelchairAccessible && (
                <Accessibility size={13} className="shrink-0 text-ink-4" strokeWidth={2.2} />
              )}
            </div>
          </div>
        </div>

        {/* one caveat, at most */}
        <LiveStatusLine live={live.live} className="mt-2.5" />
      </Link>

      {showTrack && !cancelled && (
        <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2 px-4 py-2">
          <span className="truncate font-display text-[12px] font-bold text-ink-3">
            {live.bus.registration}
          </span>
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
        </div>
      )}
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
