import { Link } from 'react-router-dom';
import {
  Bookmark,
  BookmarkX,
  Bus,
  ChevronRight,
  Compass,
  Footprints,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Star,
} from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, List, ListRow, SectionHeader } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StateBlock } from '@/components/ui/States';
import { PlaceArt } from '@/components/art/PlaceArt';
import { useApp } from '@/store/AppState';
import { CATEGORY_LABEL, PLACE_BY_ID } from '@/data/places';
import { STOP_BY_ID } from '@/data/stops';
import { ROUTE_BY_ID } from '@/data/routes';
import { formatDistance, haversineKm } from '@/lib/geo';

/**
 * Saved places and routes.
 *
 * Saving a place used to write to state that nothing ever read back: the bookmark
 * filled in, and that was the end of it. Profile counted them and linked to
 * Explore, which is the opposite of a saved list — it is the whole catalogue.
 *
 * Each saved place carries what is needed to act on it rather than just admire
 * it: the stop that serves it, the walk from there, and a journey link that
 * arrives at the planner already pointed at the right stand.
 */
export function SavedScreen() {
  const { savedPlaceIds, toggleSavedPlace, savedRouteIds, toggleSavedRoute, location } = useApp();

  const places = savedPlaceIds
    .map((id) => PLACE_BY_ID.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const routes = savedRouteIds
    .map((id) => ROUTE_BY_ID.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const nothingSaved = places.length === 0 && routes.length === 0;

  return (
    <Screen>
      <ScreenHeader
        title="Saved"
        subtitle={
          nothingSaved
            ? 'Places and routes you bookmark'
            : `${places.length} place${places.length === 1 ? '' : 's'} · ${routes.length} route${routes.length === 1 ? '' : 's'}`
        }
      />

      <ScreenBody className="pt-4">
        {nothingSaved ? (
          <StateBlock
            icon={<Bookmark size={24} strokeWidth={1.9} />}
            title="Nothing saved yet"
            body="Tap the bookmark on any destination to keep it here, with the stop that serves it and the bus to take."
            actions={
              <ButtonLink to="/explore" variant="secondary" block>
                <Compass size={15} strokeWidth={2.3} />
                Explore Himachal
              </ButtonLink>
            }
          />
        ) : (
          <Stack>
            {/* ----------------------------- places ---------------------------- */}
            <section>
              <SectionHeader
                title="Saved places"
                hint={places.length > 0 ? 'With the stop that serves each one' : undefined}
                action="Find more"
                actionTo="/explore"
              />

              {places.length === 0 ? (
                <Card>
                  <StateBlock
                    compact
                    icon={<MapPin size={19} strokeWidth={2} />}
                    title="No saved places"
                    body="Bookmark a destination and it will appear here."
                  />
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {places.map((p) => {
                    const stop = STOP_BY_ID.get(p.nearestStopId);
                    const km = haversineKm(location.position, p.position);

                    return (
                      <div key={p.id} className="card overflow-hidden p-0">
                        <Link to={`/place/${p.id}`} className="flex gap-3">
                          <div className="h-[92px] w-[86px] shrink-0">
                            <PlaceArt seed={p.photoSeed} category={p.category} placeId={p.id} alt={p.name} />
                          </div>

                          <div className="min-w-0 flex-1 py-2.5 pr-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-[13.5px] font-bold text-ink">
                                  {p.name}
                                </div>
                                <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
                                  {CATEGORY_LABEL[p.category]} · {p.town} · {formatDistance(km)} away
                                </div>
                              </div>
                              <span className="flex shrink-0 items-center gap-0.5 text-[11.5px] font-bold text-ink tnum">
                                <Star size={10} strokeWidth={2.8} className="text-warn" />
                                {p.rating.toFixed(1)}
                              </span>
                            </div>

                            {/* the part that makes a saved place actionable */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Badge tone="brand">
                                <Bus size={9} strokeWidth={2.8} />
                                {stop?.name.replace(/,.*$/, '') ?? 'No stop'}
                              </Badge>
                              {p.walkFromStopMin > 0 && (
                                <Badge tone="neutral">
                                  <Footprints size={9} strokeWidth={2.8} />
                                  {p.walkFromStopMin} min walk
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Link>

                        <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-3 py-2">
                          <Link
                            to="/plan"
                            state={{
                              toStopId: p.nearestStopId,
                              toPlaceName: p.name,
                              toWalkMin: p.walkFromStopMin,
                            }}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] font-semibold text-brand-600"
                          >
                            <Navigation size={13} strokeWidth={2.4} />
                            <span className="truncate">
                              Plan a journey to {stop?.name.replace(/,.*$/, '') ?? 'the stop'}
                            </span>
                          </Link>

                          <button
                            onClick={() => toggleSavedPlace(p.id)}
                            aria-label={`Remove ${p.name} from saved`}
                            className="flex shrink-0 items-center gap-1 rounded-[8px] border border-line bg-surface px-2 py-1 text-[11.5px] font-semibold text-ink-3 transition-colors hover:border-line-strong hover:text-bad"
                          >
                            <BookmarkX size={12} strokeWidth={2.4} />
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ----------------------------- routes ---------------------------- */}
            <section>
              <SectionHeader title="Saved routes" hint="Straight to the live map" />

              {routes.length === 0 ? (
                <Card>
                  <StateBlock
                    compact
                    icon={<RouteIcon size={19} strokeWidth={2} />}
                    title="No saved routes"
                    body="Save a route from its map view to pin it here."
                  />
                </Card>
              ) : (
                <List>
                  {routes.map((r) => (
                    <div key={r.id} className="flex items-center">
                      <Link
                        to={`/map?route=${r.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                      >
                        <span className="w-11 shrink-0 rounded-[6px] bg-ink py-1 text-center text-[11.5px] font-extrabold text-white">
                          {r.shortName}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-ink">
                            {r.longName}
                          </span>
                          <span className="block truncate text-[11.5px] text-ink-3">
                            {r.operator} · {r.stopIds.length} stops · ₹{r.fareInr}
                          </span>
                        </span>
                        <ChevronRight size={15} className="shrink-0 text-ink-4" />
                      </Link>
                      <button
                        onClick={() => toggleSavedRoute(r.id)}
                        aria-label={`Remove route ${r.shortName} from saved`}
                        className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-3 hover:text-bad"
                      >
                        <BookmarkX size={14} strokeWidth={2.4} />
                      </button>
                    </div>
                  ))}
                </List>
              )}
            </section>

            <List>
              <ListRow
                to="/explore"
                icon={<Compass size={15} strokeWidth={2.3} />}
                title="Explore Himachal"
                subtitle="Find more places you can reach by bus"
              />
            </List>
          </Stack>
        )}
      </ScreenBody>
    </Screen>
  );
}
