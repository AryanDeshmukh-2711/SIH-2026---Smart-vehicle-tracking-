import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bus,
  Camera,
  Clock,
  Coffee,
  Footprints,
  Landmark,
  Leaf,
  Loader2,
  Mountain,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Ticket,
  UtensilsCrossed,
} from 'lucide-react';
import type { Interest, Itinerary } from '@/types';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, Stat } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip, ChipRow, Badge } from '@/components/ui/Badge';
import { StateBlock } from '@/components/ui/States';
import { PlaceArt } from '@/components/art/PlaceArt';
import { TransitMap } from '@/components/map/TransitMap';
import { BASE_TOWNS, DURATIONS, INTERESTS, generateItinerary } from '@/services/itinerary';
import { STOP_BY_ID } from '@/data/stops';
import { duration, kg, pretty24, rupees } from '@/lib/format';
import { cn } from '@/lib/cn';

const INTEREST_ICON: Record<Interest, typeof Mountain> = {
  nature: Mountain,
  food: UtensilsCrossed,
  culture: Landmark,
  shopping: ShoppingBag,
  adventure: Footprints,
  cafe: Coffee,
  scenic: Camera,
};

/**
 * Smart itinerary.
 *
 * The constraint that makes this different from a generic "things to do" list:
 * every hop is priced in bus time, including headway and the walk at each end.
 * A plan that ignores how you physically move between two points is not a plan.
 */
export function SmartItineraryScreen() {
  const [town, setTown] = useState(BASE_TOWNS[0]);
  const [interests, setInterests] = useState<Interest[]>(['culture', 'scenic']);
  const [minutes, setMinutes] = useState<number>(240);
  const [result, setResult] = useState<Itinerary | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (i: Interest) =>
    setInterests((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]));

  const build = () => {
    setBusy(true);
    setResult(null);
    generateItinerary({ baseTown: town, interests, minutes })
      .then(setResult)
      .finally(() => setBusy(false));
  };

  return (
    <Screen>
      <ScreenHeader title="Build a day plan" subtitle="Routed on public transport, not by car" />

      <ScreenBody className="pt-4">
        <Stack>
          {/* ----------------------------- the brief --------------------------- */}
          <Card>
            <div className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
              Where are you based?
            </div>
            <ChipRow className="mt-2">
              {BASE_TOWNS.map((t) => (
                <Chip key={t} active={town === t} onClick={() => setTown(t)}>
                  {t}
                </Chip>
              ))}
            </ChipRow>

            <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
              What do you want to do?
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {INTERESTS.map((i) => {
                const Icon = INTEREST_ICON[i.id];
                const active = interests.includes(i.id);
                return (
                  <button
                    key={i.id}
                    onClick={() => toggle(i.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-field border px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'border-brand-600 bg-brand-50 text-brand-800'
                        : 'border-line bg-surface text-ink-2 hover:border-line-strong',
                    )}
                  >
                    <Icon
                      size={16}
                      strokeWidth={2.2}
                      className={active ? 'text-brand-600' : 'text-ink-3'}
                    />
                    <span className="text-[13px] font-semibold">{i.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
              How much time do you have?
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.minutes}
                  onClick={() => setMinutes(d.minutes)}
                  className={cn(
                    'rounded-field border py-2.5 text-[12.5px] font-semibold transition-colors',
                    minutes === d.minutes
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-line bg-surface text-ink-2 hover:border-line-strong',
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <Button
              block
              size="lg"
              className="mt-4"
              disabled={interests.length === 0 || busy}
              onClick={build}
            >
              {busy ? (
                <>
                  <Loader2 size={16} strokeWidth={2.4} className="animate-spin" />
                  Working out the connections…
                </>
              ) : (
                <>
                  <Sparkles size={16} strokeWidth={2.3} />
                  {result ? 'Rebuild the plan' : 'Generate my plan'}
                </>
              )}
            </Button>
          </Card>

          {/* ------------------------------ result ----------------------------- */}
          {busy && !result && (
            <StateBlock
              icon={<Loader2 size={24} strokeWidth={2.2} className="animate-spin" />}
              title="Fitting your day around the bus timetable"
              body="Checking which places connect on the same corridor, then costing in headway and walking time at both ends."
              tone="brand"
            />
          )}

          {result && result.stops.length === 0 && (
            <StateBlock
              icon={<Bus size={24} strokeWidth={1.9} />}
              title="Nothing fits in that time"
              body="With this much time there is no combination in this town that works on public transport. Try a longer window, or add another interest."
              tone="warn"
              actions={
                <Button variant="secondary" onClick={() => setMinutes(480)}>
                  Try a full day instead
                </Button>
              }
            />
          )}

          {result && result.stops.length > 0 && <ItineraryResult itinerary={result} onRebuild={build} />}
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

/* -------------------------------- result ---------------------------------- */

function ItineraryResult({ itinerary, onRebuild }: { itinerary: Itinerary; onRebuild: () => void }) {
  const mapPoints = itinerary.stops.map((s) => s.place.position);
  const stops = itinerary.stops
    .map((s) => STOP_BY_ID.get(s.place.nearestStopId))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <Stack>
      <section>
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[19px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
              {itinerary.title}
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-3">
              {itinerary.stops.length} stops · {duration(itinerary.totalMinutes)} total
            </p>
          </div>
          <button
            onClick={onRebuild}
            className="flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-brand-600"
          >
            <RefreshCw size={13} strokeWidth={2.5} />
            Rebuild
          </button>
        </div>

        <Card className="mb-3">
          <div className="grid grid-cols-4 gap-2">
            <Stat
              label="Bus legs"
              value={itinerary.busLegs === 0 ? 'None' : String(itinerary.busLegs)}
              hint={itinerary.busLegs === 0 ? 'all walkable' : undefined}
            />
            <Stat label="Walking" value={`${itinerary.walkMin} min`} />
            <Stat
              label="Est. cost"
              value={itinerary.estimatedCostInr === 0 ? 'Free' : rupees(itinerary.estimatedCostInr)}
              tone={itinerary.estimatedCostInr === 0 ? 'ok' : 'default'}
            />
            <Stat label="CO₂ saved" value={kg(itinerary.co2SavedKg)} tone="ok" />
          </div>
        </Card>

        <div className="card mb-3 h-[168px] overflow-hidden p-0">
          <TransitMap stops={stops} fitTo={mapPoints} interactive={false} />
        </div>

        {/* ---------------------------- the timeline ------------------------- */}
        <ol className="relative">
          {itinerary.stops.map((s, i) => {
            const last = i === itinerary.stops.length - 1;
            return (
              <li key={s.place.id}>
                {/* transfer into this stop */}
                {s.transfer && (
                  <div className="flex gap-3 py-1">
                    <div className="flex w-7 shrink-0 justify-center">
                      <span className="w-[2px] border-l-2 border-dashed border-brand-200" />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
                      {s.transfer.mode === 'bus' ? (
                        <>
                          <Bus size={13} strokeWidth={2.4} className="shrink-0 text-brand-600" />
                          <span className="min-w-0 flex-1 text-[12px] text-ink-2">
                            {s.transfer.routeShortName && (
                              <span className="mr-1 rounded-[5px] bg-ink px-1.5 py-[1px] text-[10.5px] font-extrabold text-white">
                                {s.transfer.routeShortName}
                              </span>
                            )}
                            {s.transfer.note}
                          </span>
                        </>
                      ) : (
                        <>
                          <Footprints size={13} strokeWidth={2.4} className="shrink-0 text-ink-3" />
                          <span className="min-w-0 flex-1 text-[12px] text-ink-2">
                            {s.transfer.note}
                          </span>
                        </>
                      )}
                      <span className="shrink-0 text-[11.5px] font-semibold text-ink-3 tnum">
                        {s.transfer.durationMin} min
                      </span>
                    </div>
                  </div>
                )}

                {/* the stop itself */}
                <div className="flex gap-3">
                  <div className="relative flex w-7 shrink-0 flex-col items-center">
                    <span className="z-10 mt-3 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 font-display text-[12px] font-extrabold text-white">
                      {i + 1}
                    </span>
                    {!last && <span className="w-[2px] flex-1 bg-brand-200" />}
                  </div>

                  <Link to={`/place/${s.place.id}`} className="mb-2 min-w-0 flex-1">
                    <Card padded={false} className="overflow-hidden">
                      <div className="flex gap-3">
                        <div className="h-[86px] w-[84px] shrink-0">
                          <PlaceArt seed={s.place.photoSeed} category={s.place.category} />
                        </div>
                        <div className="min-w-0 flex-1 py-2.5 pr-3">
                          <div className="flex items-baseline gap-2">
                            <span className="font-display text-[13px] font-bold text-brand-700 tnum">
                              {pretty24(s.arrive)}
                            </span>
                            <span className="text-[11px] text-ink-4">–</span>
                            <span className="text-[12px] text-ink-3 tnum">{pretty24(s.depart)}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[14px] font-bold text-ink">
                            {s.place.name}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge>
                              <Clock size={9} strokeWidth={2.8} />
                              {duration(s.place.typicalVisitMin)}
                            </Badge>
                            <Badge tone={s.place.entryFeeInr ? 'neutral' : 'ok'}>
                              <Ticket size={9} strokeWidth={2.8} />
                              {s.place.entryFeeInr ? `₹${s.place.entryFeeInr}` : 'Free'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <Card className="border-ok-line bg-ok-bg">
        <div className="flex items-start gap-2.5">
          <Leaf size={16} strokeWidth={2.3} className="mt-0.5 shrink-0 text-ok" />
          <p className="text-[12.5px] leading-relaxed text-ok">
            {itinerary.busLegs === 0 ? (
              <>
                Every stop on this plan is within walking distance of the last — no bus needed at
                all. Covering the same {itinerary.distanceKm} km by taxi would emit roughly{' '}
                <span className="font-bold">{kg(itinerary.co2SavedKg)}</span> of CO₂.
              </>
            ) : (
              <>
                Doing this day on public transport instead of by private taxi avoids roughly{' '}
                <span className="font-bold">{kg(itinerary.co2SavedKg)}</span> of CO₂ across{' '}
                {itinerary.distanceKm} km.
              </>
            )}{' '}
            Total cost is about{' '}
            <span className="font-bold">{rupees(itinerary.estimatedCostInr)}</span> including entry
            fees. Estimated — see the impact page for the assumptions.
          </p>
        </div>
      </Card>

      <p className="text-[11px] leading-relaxed text-ink-4">
        Timings assume you leave now and include average waiting time at each stop. Check the live
        board before each leg — a single delayed service shifts everything after it.
      </p>
    </Stack>
  );
}
