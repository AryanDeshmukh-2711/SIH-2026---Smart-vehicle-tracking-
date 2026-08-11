import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bus,
  Clock,
  Compass,
  MapPin,
  Route as RouteIcon,
  SearchX,
  Sparkles,
  X,
} from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { SearchField } from '@/components/ui/Field';
import { Card, List, ListRow, SectionHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StateBlock, Skeleton } from '@/components/ui/States';
import { GreenStrip } from '@/components/transit/Green';
import { PlaceArt } from '@/components/art/PlaceArt';
import { search, RECENT_SEARCHES, SEARCH_EXAMPLES, type SearchResults } from '@/services/search';
import { CATEGORY_LABEL } from '@/data/places';
import { formatDistance, haversineKm } from '@/lib/geo';
import { useApp } from '@/store/AppState';

/**
 * Global search.
 *
 * Two distinct behaviours share one field. A plain noun ("Manali") produces a
 * grouped index across stops, routes, vehicles and places. A sentence
 * ("bus from shimla to manali tomorrow morning") is recognised as a journey
 * request, restated back so the user can confirm we read it correctly, and
 * handed to the planner.
 */
export function SearchScreen() {
  const navigate = useNavigate();
  const { location } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setBusy(false);
      return;
    }

    setBusy(true);
    const handle = setTimeout(() => {
      search(query)
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setBusy(false));
    }, 220);

    return () => clearTimeout(handle);
  }, [query]);

  const hasResults = Boolean(results) && !results!.isEmpty;

  return (
    <Screen>
      <ScreenHeader back title="Search" />

      <div className="shrink-0 bg-surface px-4 pb-3">
        <SearchField
          inputRef={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Destination, stop, route, bus number or landmark"
          trailing={
            query ? (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-ink-3"
              >
                <X size={13} strokeWidth={2.6} />
              </button>
            ) : undefined
          }
        />
      </div>

      <ScreenBody className="pt-3">
        {!query.trim() && <IdleState onPick={setQuery} />}

        {query.trim() && busy && !results && <SearchSkeleton />}

        {results && (
          <Stack gap={4}>
            {/* natural-language journey intent */}
            {results.intent && (
              <button
                onClick={() =>
                  navigate('/plan', {
                    state: {
                      fromStopId: results.intent!.fromStopId,
                      toStopId: results.intent!.toStopId,
                    },
                  })
                }
                className="w-full text-left"
              >
                <Card className="border-brand-200 bg-brand-50">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-brand-600 text-white">
                      <Sparkles size={15} strokeWidth={2.3} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold uppercase tracking-[0.055em] text-brand-600">
                        Understood as a journey
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 font-display text-[15px] font-bold leading-snug text-brand-800">
                        <span>{results.intent.fromLabel}</span>
                        <ArrowRight size={14} strokeWidth={2.6} className="text-brand-500" />
                        <span>{results.intent.toLabel}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="brand">
                          {results.intent.when.day === 'tomorrow' ? 'Tomorrow' : 'Today'}
                        </Badge>
                        {results.intent.when.part && (
                          <Badge tone="brand" className="capitalize">
                            {results.intent.when.part}
                          </Badge>
                        )}
                        {(!results.intent.fromStopId || !results.intent.toStopId) && (
                          <span className="text-[11px] font-medium text-warn">
                            One end still needs picking
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-[12.5px] font-semibold text-brand-700">
                        Plan this journey →
                      </div>
                    </div>
                  </div>
                </Card>
              </button>
            )}

            {results.isEmpty && (
              <StateBlock
                icon={<SearchX size={24} strokeWidth={1.9} />}
                title={`No matches for "${results.query}"`}
                body="Try a town, a bus stand, a route number like 42B, or a registration like HP-01-4021."
                actions={
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {SEARCH_EXAMPLES.slice(0, 3).map((s) => (
                      <button
                        key={s}
                        onClick={() => setQuery(s)}
                        className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-ink-2"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                }
              />
            )}

            {results.stops.length > 0 && (
              <section>
                <SectionHeader title="Bus stops" />
                <List>
                  {results.stops.map((s) => (
                    <ListRow
                      key={s.id}
                      to={`/stop/${s.id}`}
                      icon={<MapPin size={16} strokeWidth={2.2} />}
                      title={s.name}
                      subtitle={`${s.town} · ${formatDistance(haversineKm(location.position, s.position))} away · code ${s.smsCode}`}
                    />
                  ))}
                </List>
              </section>
            )}

            {results.routes.length > 0 && (
              <section>
                <SectionHeader title="Routes" />
                <List>
                  {results.routes.map((r) => (
                    <ListRow
                      key={r.id}
                      to={`/map?route=${r.id}`}
                      icon={<RouteIcon size={16} strokeWidth={2.2} />}
                      title={
                        <span className="flex items-center gap-2">
                          <span className="rounded-[5px] bg-ink px-1.5 py-[1px] text-[11px] font-extrabold text-white">
                            {r.shortName}
                          </span>
                          {r.longName}
                        </span>
                      }
                      subtitle={`${r.operator} · ${r.stopIds.length} stops · ₹${r.fareInr}`}
                    />
                  ))}
                </List>
              </section>
            )}

            {results.vehicles.length > 0 && (
              <section>
                <SectionHeader title="Buses" hint="Tracked by registration or route number" />
                <List>
                  {results.vehicles.map((lb) => (
                    <ListRow
                      key={lb.bus.id}
                      to={`/bus/${lb.bus.id}`}
                      icon={<Bus size={16} strokeWidth={2.2} />}
                      title={lb.bus.registration}
                      subtitle={
                        <span className="flex items-center gap-1.5">
                          {lb.route.shortName} · {lb.route.longName}
                        </span>
                      }
                      trailing={<GreenStrip bus={lb.bus} score={lb.greenScore} showScore={false} />}
                    />
                  ))}
                </List>
              </section>
            )}

            {results.places.length > 0 && (
              <section>
                <SectionHeader title="Places" hint="Attractions, cafés, markets and viewpoints" />
                <div className="space-y-2">
                  {results.places.map((p) => (
                    <Link key={p.id} to={`/place/${p.id}`} className="card flex gap-3 overflow-hidden p-0">
                      <div className="h-[68px] w-[76px] shrink-0">
                        <PlaceArt seed={p.photoSeed} category={p.category} />
                      </div>
                      <div className="min-w-0 flex-1 py-2.5 pr-3">
                        <div className="truncate text-[13.5px] font-bold text-ink">{p.name}</div>
                        <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
                          {CATEGORY_LABEL[p.category]} · {p.town}
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-brand-600">
                          <Bus size={11} strokeWidth={2.5} />
                          {p.walkFromStopMin} min walk from the stop
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {hasResults && <div className="h-1" />}
          </Stack>
        )}
      </ScreenBody>
    </Screen>
  );
}

/* --------------------------------- pieces --------------------------------- */

function IdleState({ onPick }: { onPick: (q: string) => void }) {
  const examples = useMemo(() => SEARCH_EXAMPLES, []);

  return (
    <Stack gap={4}>
      <section>
        <SectionHeader title="Recent" />
        <List>
          {RECENT_SEARCHES.map((r) => (
            <ListRow
              key={r.label}
              onClick={() => onPick(r.label)}
              icon={<Clock size={15} strokeWidth={2.2} />}
              title={r.label}
              subtitle={
                r.kind === 'journey'
                  ? 'Journey'
                  : r.kind === 'route'
                    ? 'Route'
                    : r.kind === 'place'
                      ? 'Place'
                      : 'Bus stop'
              }
            />
          ))}
        </List>
      </section>

      <section>
        <SectionHeader
          title="Search understands plain language"
          hint="Type a sentence and it becomes a journey search"
        />
        <div className="space-y-2">
          {examples.map((e) => (
            <button
              key={e}
              onClick={() => onPick(e)}
              className="card flex w-full items-center gap-2.5 p-3 text-left transition-colors hover:border-line-strong"
            >
              <Compass size={15} strokeWidth={2.2} className="shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-2">
                “{e}”
              </span>
              <ArrowRight size={14} className="shrink-0 text-ink-4" />
            </button>
          ))}
        </div>
      </section>
    </Stack>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-24" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="card flex items-center gap-3 p-3.5">
          <Skeleton className="h-9 w-9 rounded-[10px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
