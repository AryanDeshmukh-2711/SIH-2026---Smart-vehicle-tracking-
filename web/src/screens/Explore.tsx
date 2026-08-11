import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bus, Clock, Compass, Search, SearchX, Sparkles, Star, Ticket } from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, CardLink, SectionHeader } from '@/components/ui/Card';
import { Chip, ChipRow, Badge } from '@/components/ui/Badge';
import { StateBlock, Skeleton } from '@/components/ui/States';
import { PlaceArt, PlaceCover } from '@/components/art/PlaceArt';
import { useAsync } from '@/hooks/useLive';
import { useApp } from '@/store/AppState';
import { EXPLORE_FILTERS, getPlaces, type ExploreFilter } from '@/services/places';
import { CATEGORY_LABEL } from '@/data/places';
import { STOP_BY_ID } from '@/data/stops';
import { duration } from '@/lib/format';
import { formatDistance, haversineKm } from '@/lib/geo';

/**
 * Explore.
 *
 * Every card answers the transport question up front — which stop, how far a
 * walk — because a tourism listing that leaves "how do I get there?" to the
 * reader is exactly the gap this app exists to close.
 */
export function ExploreScreen() {
  const { location } = useApp();
  const [filter, setFilter] = useState<ExploreFilter>('popular');

  const places = useAsync(() => getPlaces(filter, location.position), [filter, location.position.lat]);
  const list = places.data ?? [];

  const featured = useMemo(() => list.slice(0, 3), [list]);
  const rest = useMemo(() => list.slice(3), [list]);

  return (
    <Screen>
      <ScreenHeader
        back={false}
        large
        title="Explore Himachal"
        subtitle="Discover places. Plan your journey. Travel smarter."
        actions={
          <Link
            to="/search"
            aria-label="Search"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-3"
          >
            <Search size={18} strokeWidth={2.2} />
          </Link>
        }
      />

      <div className="shrink-0 border-b border-line bg-surface px-4 pb-3">
        <ChipRow>
          {EXPLORE_FILTERS.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <ScreenBody className="pt-4">
        <Stack>
          {/* itinerary generator entry point */}
          <CardLink to="/itinerary" className="border-brand-200 bg-brand-50">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-brand-600 text-white">
                <Sparkles size={19} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-brand-800">
                  Not sure where to start?
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-brand-700/85">
                  Tell us what you enjoy and how long you have. We'll build a day that actually
                  works on public transport.
                </p>
                <span className="mt-2 inline-block text-[12.5px] font-semibold text-brand-700">
                  Build my plan →
                </span>
              </div>
            </div>
          </CardLink>

          {places.status === 'loading' && <ExploreSkeleton />}

          {places.status === 'ready' && list.length === 0 && (
            <StateBlock
              icon={<SearchX size={24} strokeWidth={1.9} />}
              title="Nothing in this category yet"
              body="We are still adding places for this filter. Try Popular, or search for somewhere specific."
              actions={
                <Chip onClick={() => setFilter('popular')} active>
                  Show popular places
                </Chip>
              }
            />
          )}

          {/* --------------------------- featured ---------------------------- */}
          {featured.length > 0 && (
            <section>
              <SectionHeader
                title={filter === 'popular' ? 'Most visited' : CATEGORY_LABEL[filter]}
                hint="Sorted by how close they are to you"
              />
              <div className="space-y-3">
                {featured.map((p) => {
                  const stop = STOP_BY_ID.get(p.nearestStopId);
                  const km = haversineKm(location.position, p.position);
                  return (
                    <Link key={p.id} to={`/place/${p.id}`} className="block">
                      <Card padded={false} className="overflow-hidden">
                        <PlaceCover seed={p.photoSeed} category={p.category} className="h-[136px]">
                          <div className="flex items-end justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="truncate font-display text-[17px] font-extrabold leading-tight text-white">
                                {p.name}
                              </h3>
                              <div className="mt-0.5 truncate text-[11.5px] text-white/80">
                                {p.town} · {formatDistance(km)} away
                              </div>
                            </div>
                            <span className="flex shrink-0 items-center gap-1 rounded-[7px] bg-white/92 px-1.5 py-[3px] text-[11.5px] font-bold text-ink">
                              <Star size={11} fill="#E8A93B" strokeWidth={0} />
                              {p.rating}
                            </span>
                          </div>
                        </PlaceCover>

                        <div className="p-3.5">
                          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-2">
                            {p.summary}
                          </p>

                          <div className="mt-3 flex items-center gap-2 rounded-field border border-line bg-surface-2 px-3 py-2">
                            <Bus size={15} strokeWidth={2.3} className="shrink-0 text-brand-600" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-semibold text-ink">
                                {stop?.name ?? '—'}
                              </span>
                              <span className="block text-[11px] text-ink-3">
                                {p.walkFromStopMin} min walk from the stop
                              </span>
                            </span>
                            <span className="shrink-0 text-[11.5px] font-semibold text-brand-600">
                              Get there →
                            </span>
                          </div>

                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <Badge>{CATEGORY_LABEL[p.category]}</Badge>
                            <Badge>
                              <Clock size={10} strokeWidth={2.6} />
                              {duration(p.typicalVisitMin)}
                            </Badge>
                            <Badge tone={p.entryFeeInr ? 'neutral' : 'ok'}>
                              <Ticket size={10} strokeWidth={2.6} />
                              {p.entryFeeInr ? `₹${p.entryFeeInr}` : 'Free entry'}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ------------------------------ grid ----------------------------- */}
          {rest.length > 0 && (
            <section>
              <SectionHeader title="More to see" hint="All reachable by bus" />
              <div className="grid grid-cols-2 gap-2.5">
                {rest.map((p) => (
                  <Link key={p.id} to={`/place/${p.id}`}>
                    <Card padded={false} className="h-full overflow-hidden">
                      <PlaceArt seed={p.photoSeed} category={p.category} className="h-[92px]" />
                      <div className="p-2.5">
                        <div className="line-clamp-2 text-[12.5px] font-bold leading-snug text-ink">
                          {p.name}
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[10.5px] text-ink-3">
                          <Star size={9} fill="#E8A93B" strokeWidth={0} />
                          <span className="font-semibold text-ink-2">{p.rating}</span>
                          <span className="truncate">· {p.town}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-brand-600">
                          <Bus size={10} strokeWidth={2.6} />
                          {p.walkFromStopMin} min from stop
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="flex items-start gap-2 pt-1 text-[11px] leading-relaxed text-ink-4">
            <Compass size={12} strokeWidth={2.2} className="mt-px shrink-0" />
            <span>
              Opening hours and entry fees are from the HP Tourism dataset and can change
              seasonally. Confirm before travelling in winter, when several routes close.
            </span>
          </div>
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

function ExploreSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="card overflow-hidden p-0">
          <Skeleton className="h-[136px] rounded-none" />
          <div className="space-y-2 p-3.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-11 w-full rounded-field" />
          </div>
        </div>
      ))}
    </div>
  );
}
