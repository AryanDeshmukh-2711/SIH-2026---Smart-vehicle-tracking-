import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpDown,
  Bus,
  ChevronRight,
  Footprints,
  MapPin,
  Navigation,
} from 'lucide-react';
import type { BoardingPlan } from '@/services/destination';
import { routeOf } from '@/services/destination';
import { useDepartures } from '@/hooks/useLive';
import { StateBlock } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { EtaDisplay } from './Eta';
import { GreenStrip } from './Green';
import { rupees } from '@/lib/format';

/**
 * The answer to "I am here, I want to go there".
 *
 * Ordered by what the passenger has to do next, not by what the data model finds
 * interesting: which bus to get on, when it arrives, where to get off, what walk
 * remains. Live ETAs come from the same departure board as everywhere else, so
 * this cannot drift from the stop screen.
 *
 * Only direct services are resolved here. Anything needing an interchange is
 * handed to the full planner rather than half-answered — a partial itinerary at a
 * bus stop is worse than an honest redirect.
 */
export function BoardingGuide({ plan }: { plan: BoardingPlan }) {
  const { destination: dest } = plan;

  // Live board at this stop, narrowed to services that actually get there.
  const departures = useDepartures(plan.fromStopId, 8);
  const usable = departures.filter((d) => plan.directRouteIds.includes(d.live.route.id));

  /* ------------------------ already at the destination ------------------------ */
  if (plan.alreadyHere) {
    return (
      <Guide dest={dest}>
        <StateBlock
          compact
          tone="brand"
          icon={<MapPin size={19} strokeWidth={2.2} />}
          title="You are already at the right stop"
          body={
            dest.walkMin > 0
              ? `${dest.name} is about a ${dest.walkMin} minute walk from where you are standing. No bus needed.`
              : `This is ${dest.name}. You have arrived.`
          }
        />
      </Guide>
    );
  }

  /* --------------------------- only the other way ---------------------------- */
  if (plan.reverseOnlyRouteId) {
    const route = routeOf(plan.reverseOnlyRouteId);
    return (
      <Guide dest={dest}>
        <StateBlock
          compact
          tone="warn"
          icon={<ArrowUpDown size={19} strokeWidth={2.2} />}
          title={`Route ${route?.shortName ?? ''} only runs the other way here`}
          body={`Both stops are on ${route?.longName ?? 'this corridor'}, but this build carries it in the ${route?.origin} → ${route?.destination} direction only. The return service exists in reality; it is not in this dataset yet.`}
          actions={
            <Link
              to={`/map?route=${plan.reverseOnlyRouteId}`}
              className="text-[13px] font-semibold text-brand-600"
            >
              See the corridor on the map →
            </Link>
          }
        />
      </Guide>
    );
  }

  /* ------------------------------ needs a change ----------------------------- */
  if (plan.needsTransfer) {
    return (
      <Guide dest={dest}>
        <StateBlock
          compact
          icon={<Navigation size={19} strokeWidth={2.2} />}
          title="No direct bus from this stop"
          body={`Getting to ${dest.name} from here means at least one change. The planner will work out the combination.`}
          actions={
            <Link
              to="/plan"
              state={{ fromStopId: plan.fromStopId, toStopId: dest.alightStopId }}
              className="text-[13px] font-semibold text-brand-600"
            >
              Plan it with transfers →
            </Link>
          }
        />
      </Guide>
    );
  }

  /* ------------------------------- direct buses ------------------------------ */
  return (
    <Guide dest={dest}>
      {/* where to get off, stated before the bus list so it is not missed */}
      <div className="mt-2.5 flex items-start gap-2.5 rounded-field border border-brand-100 bg-brand-50 px-3 py-2.5">
        <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-brand-600 text-white">
          <MapPin size={13} strokeWidth={2.6} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold text-brand-800">
            Get off at {dest.alightStopName.replace(/,.*$/, '')}
          </div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-brand-700/85">
            {dest.walkMin > 0 ? (
              <>
                Then about a {dest.walkMin} minute walk to {dest.name}.
              </>
            ) : (
              <>That is {dest.name} itself — no walk at the far end.</>
            )}
          </div>
        </div>
      </div>

      {/* what to board */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
            Board any of these
          </span>
          <span className="text-[11px] text-ink-4">
            {plan.directRouteIds.length} route{plan.directRouteIds.length === 1 ? '' : 's'}
          </span>
        </div>

        {usable.length > 0 ? (
          <div className="card divide-y divide-line overflow-hidden">
            {usable.map(({ live, prediction }) => {
              const leg = plan.ride[live.route.id];
              return (
                <Link
                  key={live.bus.id}
                  to={`/bus/${live.bus.id}`}
                  className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="w-11 shrink-0 rounded-[7px] bg-ink px-1.5 py-1 text-center font-display text-[12px] font-extrabold text-white">
                    {live.route.shortName}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {live.bus.registration}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-3 tnum">
                      {leg ? `${leg.stops} stop${leg.stops === 1 ? '' : 's'} · ${leg.km} km · ` : ''}
                      {leg ? rupees(leg.fareInr) : ''}
                    </span>
                    <span className="mt-1 flex">
                      <GreenStrip bus={live.bus} score={live.greenScore} showScore={false} />
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <EtaDisplay prediction={prediction} size="sm" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          // The routes exist, but nothing is currently running on them.
          <StateBlock
            compact
            icon={<Bus size={19} strokeWidth={2} />}
            title="Nothing on the way just yet"
            body={`${plan.directRouteIds
              .map((id) => routeOf(id)?.shortName)
              .filter(Boolean)
              .join(', ')} serve${plan.directRouteIds.length === 1 ? 's' : ''} ${dest.alightStopName.replace(/,.*$/, '')}, but no vehicle is currently en route to this stop. The printed timetable still applies.`}
            actions={
              <Link
                to={`/stop/${plan.fromStopId}`}
                className="text-[13px] font-semibold text-brand-600"
              >
                Open the timetable →
              </Link>
            }
          />
        )}
      </div>

      <Link
        to="/plan"
        state={{ fromStopId: plan.fromStopId, toStopId: dest.alightStopId }}
        className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-field border border-line-strong bg-surface text-[13px] font-semibold text-ink transition-colors hover:bg-surface-3"
      >
        <Navigation size={14} strokeWidth={2.3} />
        See the full journey
        <ChevronRight size={14} strokeWidth={2.5} />
      </Link>
    </Guide>
  );
}

/* --------------------------------- shell ---------------------------------- */

function Guide({
  dest,
  children,
}: {
  dest: BoardingPlan['destination'];
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[12px] text-ink-3">
        <span className="truncate font-semibold text-ink">Going to</span>
        <ArrowRight size={12} strokeWidth={2.6} className="shrink-0 text-ink-4" />
        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{dest.name}</span>
        {dest.walkMin > 0 && (
          <Badge tone="neutral">
            <Footprints size={9} strokeWidth={2.8} />
            {dest.walkMin} min
          </Badge>
        )}
        {dest.kind === 'place' && <Badge tone="brand">{dest.detail}</Badge>}
      </div>
      {children}
    </div>
  );
}
