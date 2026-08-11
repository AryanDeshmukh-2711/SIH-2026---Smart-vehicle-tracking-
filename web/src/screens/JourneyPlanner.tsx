import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation as useRouterLocation } from 'react-router-dom';
import {
  ArrowUpDown,
  Bus,
  ChevronRight,
  CircleDot,
  Clock,
  Footprints,
  Leaf,
  MapPin,
  Search,
  SearchX,
  Ticket,
  X,
} from 'lucide-react';
import type { JourneyOption, JourneyPreference, Stop } from '@/types';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Badge, Chip, ChipRow } from '@/components/ui/Badge';
import { FieldButton, TextField } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton, StateBlock } from '@/components/ui/States';
import { GreenStrip } from '@/components/transit/Green';
import { PREFERENCE_LABEL, planJourney } from '@/services/journey';
import { matchStops } from '@/services/transit';
import { STOP_BY_ID } from '@/data/stops';
import { BUS_BY_ID } from '@/data/buses';
import { ROUTE_BY_ID } from '@/data/routes';
import { duration, kg, pluralise, pretty24, rupees } from '@/lib/format';
import { greenScore } from '@/lib/green';
import { useApp } from '@/store/AppState';
import { cn } from '@/lib/cn';

const PREFERENCES: JourneyPreference[] = [
  'fastest',
  'cheapest',
  'fewest-transfers',
  'most-sustainable',
];

/**
 * Journey planner.
 *
 * The four preference chips are not cosmetic — each one re-sorts the result set
 * and the winning option is labelled with why it won, so a user choosing
 * "most sustainable" over "fastest" can see exactly what the trade costs them
 * in minutes and rupees.
 */
export function JourneyPlannerScreen() {
  const routerState = (useRouterLocation().state ?? {}) as {
    fromStopId?: string | null;
    toStopId?: string | null;
  };
  const { location, user } = useApp();

  const [fromId, setFromId] = useState<string | null>(
    routerState.fromStopId ?? location.stopId ?? 'HP-SML-001',
  );
  const [toId, setToId] = useState<string | null>(routerState.toStopId ?? null);
  const [preference, setPreference] = useState<JourneyPreference>(user.travelMode);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [options, setOptions] = useState<JourneyOption[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fromId || !toId) {
      setOptions(null);
      return;
    }
    setBusy(true);
    planJourney({ fromStopId: fromId, toStopId: toId, preference })
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setBusy(false));
  }, [fromId, toId, preference]);

  const from = fromId ? STOP_BY_ID.get(fromId) : undefined;
  const to = toId ? STOP_BY_ID.get(toId) : undefined;

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  return (
    <Screen>
      <ScreenHeader title="Plan a journey" subtitle="Door to door, on public transport" />

      {/* ------------------------------ endpoints ---------------------------- */}
      <div className="shrink-0 border-b border-line bg-surface px-4 pb-3.5 pt-1">
        <div className="relative">
          <div className="space-y-2">
            <FieldButton
              icon={<CircleDot size={15} strokeWidth={2.4} className="text-brand-600" />}
              label="From"
              value={from?.name}
              placeholder="Choose a starting stop"
              onClick={() => setPicking('from')}
              className="pr-12"
            />
            <FieldButton
              icon={<MapPin size={15} strokeWidth={2.4} className="text-bad" />}
              label="To"
              value={to?.name}
              placeholder="Where are you going?"
              onClick={() => setPicking('to')}
              className="pr-12"
            />
          </div>

          <button
            onClick={swap}
            aria-label="Swap origin and destination"
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-xs transition-colors hover:bg-surface-3"
          >
            <ArrowUpDown size={15} strokeWidth={2.3} />
          </button>
        </div>

        <ChipRow className="mt-3">
          {PREFERENCES.map((p) => (
            <Chip key={p} active={preference === p} onClick={() => setPreference(p)}>
              {PREFERENCE_LABEL[p]}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {/* ------------------------------- results ----------------------------- */}
      <ScreenBody className="pt-4">
        {!fromId || !toId ? (
          <StateBlock
            icon={<Search size={24} strokeWidth={1.9} />}
            title="Pick both ends of your journey"
            body="Choose where you are starting from and where you want to reach. We will find every bus combination between them."
            tone="brand"
          />
        ) : busy && !options ? (
          <ListSkeleton rows={3} />
        ) : options && options.length === 0 ? (
          <StateBlock
            icon={<SearchX size={24} strokeWidth={1.9} />}
            title="No bus route connects these stops"
            body="There is no direct or single-transfer service between them in the current timetable. Try a nearby district hub such as Shimla ISBT or Mandi."
            tone="warn"
            actions={
              <Link to="/map" className="text-[13px] font-semibold text-brand-600">
                Browse the network map →
              </Link>
            }
          />
        ) : (
          <Stack gap={4}>
            <SectionHeader
              title="Recommended journeys"
              hint={`${options?.length ?? 0} option${options?.length === 1 ? '' : 's'}, sorted by ${PREFERENCE_LABEL[preference].toLowerCase()}`}
            />
            <div className="space-y-3">
              {options?.map((o, i) => (
                <JourneyCard key={o.id} option={o} recommended={i === 0} />
              ))}
            </div>

            <p className="text-[11px] leading-relaxed text-ink-4">
              Departure times use the live position of the next vehicle where one is running, and
              the printed timetable otherwise. Fares are the current HRTC stage fare for the
              distance travelled.
            </p>
          </Stack>
        )}
      </ScreenBody>

      <StopPicker
        open={picking !== null}
        title={picking === 'from' ? 'Starting point' : 'Destination'}
        onClose={() => setPicking(null)}
        onPick={(stop) => {
          if (picking === 'from') setFromId(stop.id);
          else setToId(stop.id);
          setPicking(null);
        }}
      />
    </Screen>
  );
}

/* ------------------------------ journey card ------------------------------ */

function JourneyCard({ option, recommended }: { option: JourneyOption; recommended?: boolean }) {
  const busLegs = option.legs.filter((l) => l.kind === 'bus');
  const firstBus = busLegs[0];
  const bus = firstBus?.busId ? BUS_BY_ID.get(firstBus.busId) : undefined;

  return (
    <Card className={cn('p-0', recommended && 'border-brand-200')} padded={false}>
      {recommended && (
        <div className="flex items-center gap-1.5 rounded-t-card border-b border-brand-100 bg-brand-50 px-4 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.055em] text-brand-700">
            Recommended
          </span>
        </div>
      )}

      <div className="p-4">
        {/* headline times */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[22px] font-extrabold leading-none text-ink tnum">
                {pretty24(option.departure)}
              </span>
              <span className="text-ink-4">→</span>
              <span className="font-display text-[22px] font-extrabold leading-none text-ink tnum">
                {pretty24(option.arrival)}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-ink-3">
              <span className="inline-flex items-center gap-1 font-semibold text-ink-2">
                <Clock size={12} strokeWidth={2.4} />
                {duration(option.durationMin)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Ticket size={12} strokeWidth={2.3} />
                {rupees(option.fareInr)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Bus size={12} strokeWidth={2.3} />
                {option.transfers === 0 ? 'Direct' : pluralise(option.transfers, 'transfer')}
              </span>
              {option.walkMin > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Footprints size={12} strokeWidth={2.3} />
                  {option.walkMin} min walk
                </span>
              )}
            </div>
          </div>
        </div>

        {/* why this option */}
        {option.badges.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {option.badges.map((b) => (
              <Badge key={b} tone={b === 'most-sustainable' ? 'ok' : 'brand'}>
                {b === 'most-sustainable' && <Leaf size={10} strokeWidth={2.6} />}
                {PREFERENCE_LABEL[b]}
              </Badge>
            ))}
          </div>
        )}

        {/* legs */}
        <div className="mt-3.5 space-y-0 border-t border-line pt-3">
          {option.legs.map((leg, i) => {
            const route = leg.routeId ? ROUTE_BY_ID.get(leg.routeId) : undefined;

            if (leg.kind === 'wait') {
              return (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <span className="flex w-8 shrink-0 justify-center">
                    <span className="h-full w-[2px] border-l-2 border-dashed border-line-strong" />
                  </span>
                  <span className="text-[12px] text-ink-4">
                    Wait {leg.durationMin} min at {leg.from.replace(/,.*$/, '')}
                  </span>
                </div>
              );
            }

            if (leg.kind === 'walk') {
              return (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <span className="flex w-8 shrink-0 justify-center text-ink-4">
                    <Footprints size={14} strokeWidth={2.3} />
                  </span>
                  <span className="text-[12px] text-ink-3">
                    Walk {leg.durationMin} min to the connecting bay
                  </span>
                </div>
              );
            }

            return (
              <div key={i} className="flex gap-3 py-2">
                <span className="flex w-8 shrink-0 justify-center">
                  <span className="rounded-[6px] bg-ink px-1.5 py-1 text-[11px] font-extrabold leading-none text-white">
                    {route?.shortName}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold leading-snug text-ink">
                    {leg.from.replace(/,.*$/, '')} → {leg.to.replace(/,.*$/, '')}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-3 tnum">
                    {pretty24(leg.departure ?? '')} · {duration(leg.durationMin)} ·{' '}
                    {pluralise(leg.stopsCount ?? 0, 'stop')} · {leg.distanceKm} km
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* green + action */}
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          {bus ? (
            <GreenStrip bus={bus} score={greenScore(bus)} className="min-w-0 flex-1" />
          ) : (
            <span className="flex-1" />
          )}
          <span className="shrink-0 text-[11.5px] font-semibold text-ok">
            {kg(option.co2SavedKg)} CO₂ saved
          </span>
          {firstBus?.busId && (
            <Link
              to={`/bus/${firstBus.busId}`}
              className="flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-brand-600"
            >
              Track
              <ChevronRight size={14} strokeWidth={2.5} />
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------ stop picker ------------------------------- */

export function StopPicker({
  open,
  title,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (stop: Stop) => void;
}) {
  const [q, setQ] = useState('');
  const { location } = useApp();

  const results = useMemo(() => {
    if (!q.trim()) {
      const current = location.stopId ? STOP_BY_ID.get(location.stopId) : undefined;
      const suggested = ['HP-SML-001', 'HP-MNL-001', 'HP-SOL-001', 'HP-MND-001', 'HP-DHR-001', 'HP-KLU-001']
        .map((id) => STOP_BY_ID.get(id))
        .filter((s): s is Stop => Boolean(s));
      return current ? [current, ...suggested.filter((s) => s.id !== current.id)] : suggested;
    }
    return matchStops(q, 10);
  }, [q, location.stopId]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle="Search by stop, town or landmark">
      <TextField
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="e.g. Manali, Victory Tunnel, Mall Road"
        icon={<Search size={17} strokeWidth={2.2} />}
        trailing={
          q ? (
            <button onClick={() => setQ('')} aria-label="Clear" className="text-ink-4">
              <X size={15} strokeWidth={2.5} />
            </button>
          ) : undefined
        }
        className="mb-3"
      />

      {results.length === 0 ? (
        <StateBlock
          compact
          icon={<SearchX size={20} strokeWidth={2} />}
          title="No stop matches that"
          body="Try the town name instead — most towns have one main stand."
        />
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {results.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-3 text-ink-2">
                <MapPin size={15} strokeWidth={2.3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{s.name}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                  {s.town} · {s.landmarks.slice(0, 2).join(', ')}
                </span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-ink-4" />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
