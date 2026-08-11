import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Bus, ChevronRight, Clock, Leaf, Route as RouteIcon, Star, Ticket } from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, CardLink, SectionHeader, Stat } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Field';
import { StateBlock } from '@/components/ui/States';
import { FuelBadge } from '@/components/transit/Green';
import { BusCard } from '@/components/transit/BusCard';
import { useLiveFleet } from '@/hooks/useLive';
import { useApp } from '@/store/AppState';
import { TRIPS, summarise, tripsWithin } from '@/data/trips';
import { ROUTE_BY_ID } from '@/data/routes';
import { STOP_BY_ID } from '@/data/stops';
import { dayLabel, duration, kg, rupees } from '@/lib/format';

type Tab = 'upcoming' | 'history';

/**
 * My trips.
 *
 * History doubles as the evidence base for the sustainability dashboard —
 * every kilogram claimed there is traceable to a row here, which is what keeps
 * the environmental figures from being decorative.
 */
export function MyTripsScreen() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const { trackedBusIds } = useApp();
  const fleet = useLiveFleet();

  const tracked = useMemo(
    () => fleet.filter((b) => trackedBusIds.includes(b.bus.id)),
    [fleet, trackedBusIds],
  );

  const month = useMemo(() => summarise(tripsWithin(TRIPS, 30)), []);
  const all = useMemo(() => summarise(TRIPS), []);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof TRIPS>();
    for (const t of TRIPS) {
      const key = dayLabel(t.date);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <Screen>
      <ScreenHeader
        back={false}
        large
        title="My trips"
        subtitle="What you're tracking now, and everywhere you've been"
      />

      <div className="shrink-0 border-b border-line bg-surface px-4 pb-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: `Tracking (${tracked.length})` },
            { value: 'history', label: `History (${TRIPS.length})` },
          ]}
        />
      </div>

      <ScreenBody className="pt-4">
        {tab === 'upcoming' ? (
          <Stack>
            {tracked.length === 0 ? (
              <StateBlock
                icon={<Bell size={24} strokeWidth={1.9} />}
                title="You're not tracking any bus"
                body="Tap Notify me on any bus and we'll buzz you when it's 10 minutes and 5 minutes away, so you don't have to keep checking."
                tone="brand"
                actions={
                  <Link
                    to="/map"
                    className="flex h-11 items-center justify-center rounded-field bg-brand-600 text-[14px] font-semibold text-white"
                  >
                    Find a bus to track
                  </Link>
                }
              />
            ) : (
              <section>
                <SectionHeader
                  title="Tracking now"
                  hint="You'll be alerted at 10 minutes and 5 minutes out"
                />
                <div className="space-y-2.5">
                  {tracked.map((lb) => (
                    <BusCard
                      key={lb.bus.id}
                      live={lb}
                      prediction={lb.live.predictions[0]}
                      stopName={
                        lb.live.predictions[0]
                          ? STOP_BY_ID.get(lb.live.predictions[0].stopId)?.name.replace(/,.*$/, '')
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            <CardLink to="/alerts">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-surface-3 text-ink-2">
                  <Bell size={19} strokeWidth={2.1} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-ink">Service alerts</div>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">
                    Delays, cancellations and road closures on your saved routes
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-ink-4" />
              </div>
            </CardLink>
          </Stack>
        ) : (
          <Stack>
            {/* ------------------------- running totals ---------------------- */}
            <Card>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Trips" value={String(all.trips)} hint="All time" />
                <Stat label="Distance" value={`${Math.round(all.distanceKm)} km`} />
                <Stat label="CO₂ saved" value={kg(all.co2SavedKg)} tone="ok" />
              </div>
              <Link
                to="/impact"
                className="mt-3.5 flex items-center gap-1.5 border-t border-line pt-3 text-[12.5px] font-semibold text-brand-600"
              >
                <Leaf size={14} strokeWidth={2.4} />
                See your full impact — {month.trips} trips in the last 30 days
                <ChevronRight size={14} strokeWidth={2.5} className="ml-auto" />
              </Link>
            </Card>

            {/* ---------------------------- history -------------------------- */}
            {grouped.map(([label, trips]) => (
              <section key={label}>
                <SectionHeader title={label} />
                <div className="space-y-2.5">
                  {trips.map((t) => {
                    const route = ROUTE_BY_ID.get(t.routeId);
                    return (
                      <Card key={t.id} padded={false}>
                        <div className="p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="rounded-[6px] bg-ink px-1.5 py-[2px] text-[11px] font-extrabold text-white">
                                  {route?.shortName}
                                </span>
                                <span className="truncate font-display text-[12.5px] font-bold text-ink-2">
                                  {t.registration}
                                </span>
                              </div>
                              <div className="mt-1.5 truncate text-[14px] font-bold text-ink">
                                {t.from.replace(/,.*$/, '')} → {t.to.replace(/,.*$/, '')}
                              </div>
                            </div>
                            <span className="shrink-0 text-right">
                              <span className="block font-display text-[13px] font-bold text-ink tnum">
                                {new Date(t.date).toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </span>
                          </div>

                          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-ink-3">
                            <span className="inline-flex items-center gap-1">
                              <Clock size={11} strokeWidth={2.4} />
                              {duration(t.durationMin)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <RouteIcon size={11} strokeWidth={2.4} />
                              {t.distanceKm} km
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Ticket size={11} strokeWidth={2.4} />
                              {rupees(t.fareInr)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-3.5 py-2.5">
                          <FuelBadge fuel={t.fuel} />
                          <Badge tone="ok">
                            <Leaf size={10} strokeWidth={2.6} />
                            {kg(t.co2SavedKg)} saved
                          </Badge>
                          <Link
                            to={`/bus/${t.busId}/reviews`}
                            className="ml-auto flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-brand-600"
                          >
                            <Star size={11} strokeWidth={2.5} />
                            {t.reviewed ? 'Reviewed' : 'Rate this trip'}
                          </Link>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}

            {TRIPS.length === 0 && (
              <StateBlock
                icon={<Bus size={24} strokeWidth={1.9} />}
                title="No journeys yet"
                body="Once you travel with HimGati, your trips, fares and carbon savings appear here."
              />
            )}
          </Stack>
        )}
      </ScreenBody>
    </Screen>
  );
}
