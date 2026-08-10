import { Link, useParams } from 'react-router-dom';
import {
  Bookmark,
  Bus,
  ChevronRight,
  Clock,
  Footprints,
  MapPin,
  Navigation,
  Share2,
  Star,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, SectionHeader, Stat } from '@/components/ui/Card';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Stars } from '@/components/ui/Meters';
import { StateBlock } from '@/components/ui/States';
import { PlaceArt } from '@/components/art/PlaceArt';
import { TransitMap } from '@/components/map/TransitMap';
import { EtaDisplay } from '@/components/transit/Eta';
import { FuelBadge } from '@/components/transit/Green';
import { useAsync, useDepartures } from '@/hooks/useLive';
import { useApp } from '@/store/AppState';
import { getNearbyPlaces, getPlace, getPlaceAccess } from '@/services/places';
import { CATEGORY_LABEL } from '@/data/places';
import { STOP_BY_ID } from '@/data/stops';
import { duration } from '@/lib/format';
import { formatDistance, haversineKm } from '@/lib/geo';
import type { FuelType } from '@/types';
import { cn } from '@/lib/cn';

/**
 * Destination detail.
 *
 * "Get there by bus" is the primary panel, not an afterthought at the bottom —
 * it carries the alighting stop, the walk, and the *live* next service with its
 * confidence mark, so the decision to leave now can be made on this screen.
 */
export function PlaceDetailScreen() {
  const { placeId } = useParams<{ placeId: string }>();
  const { location, savedPlaceIds, toggleSavedPlace } = useApp();

  const place = useAsync(() => getPlace(placeId!), [placeId]);
  const access = useAsync(() => getPlaceAccess(placeId!), [placeId]);
  const nearby = useAsync(() => getNearbyPlaces(placeId!, 4), [placeId]);

  const stopId = place.data?.nearestStopId;
  const departures = useDepartures(stopId, 3);

  if (place.status === 'error') {
    return (
      <Screen>
        <ScreenHeader title="Place" />
        <ScreenBody>
          <StateBlock
            icon={<MapPin size={24} strokeWidth={1.9} />}
            title="Place not found"
            body="This destination is not in the tourism dataset."
            actions={
              <ButtonLink to="/explore" variant="secondary" block>
                Back to Explore
              </ButtonLink>
            }
          />
        </ScreenBody>
      </Screen>
    );
  }

  if (!place.data) {
    return (
      <Screen>
        <ScreenHeader title="" transparent />
        <ScreenBody>
          <div className="skeleton h-[200px] rounded-card" />
        </ScreenBody>
      </Screen>
    );
  }

  const p = place.data;
  const stop = STOP_BY_ID.get(p.nearestStopId);
  const saved = savedPlaceIds.includes(p.id);
  const distanceFromUser = haversineKm(location.position, p.position);

  return (
    <Screen>
      {/* -------------------------------- hero -------------------------------- */}
      <div className="relative shrink-0">
        <div className="h-[196px]">
          <PlaceArt seed={p.photoSeed} category={p.category} />
        </div>
        <div className="absolute inset-x-0 top-0">
          <ScreenHeader
            transparent
            actions={
              <>
                <IconButton
                  label="Share"
                  className="h-9 w-9 border-0 bg-surface/90 shadow-sm backdrop-blur"
                >
                  <Share2 size={16} strokeWidth={2.2} />
                </IconButton>
                <IconButton
                  label={saved ? 'Remove from saved' : 'Save'}
                  onClick={() => toggleSavedPlace(p.id)}
                  className={cn(
                    'h-9 w-9 border-0 shadow-sm backdrop-blur',
                    saved ? 'bg-brand-600 text-white' : 'bg-surface/90',
                  )}
                >
                  <Bookmark size={16} strokeWidth={2.2} fill={saved ? 'currentColor' : 'none'} />
                </IconButton>
              </>
            }
          />
        </div>
      </div>

      <ScreenBody className="-mt-5 pt-0">
        <Stack>
          {/* ------------------------------ identity --------------------------- */}
          <Card className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-[21px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
                  {p.name}
                </h1>
                <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                  <MapPin size={13} strokeWidth={2.3} />
                  {p.town} · {formatDistance(distanceFromUser)} from you
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <Stars value={p.rating} size={14} />
              <span className="text-[13px] font-bold text-ink tnum">{p.rating}</span>
              <span className="text-[11.5px] text-ink-4">
                ({p.reviewCount.toLocaleString('en-IN')})
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="brand">{CATEGORY_LABEL[p.category]}</Badge>
              {p.tags.slice(0, 3).map((t) => (
                <Badge key={t}>{t.replace(/-/g, ' ')}</Badge>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3.5">
              <Stat label="Hours" value={p.hours.split(',')[0]} hint={p.hours.includes(',') ? p.hours.split(',')[1]?.trim() : undefined} />
              <Stat label="Typical visit" value={duration(p.typicalVisitMin)} />
              <Stat
                label="Entry"
                value={p.entryFeeInr ? `₹${p.entryFeeInr}` : 'Free'}
                tone={p.entryFeeInr ? 'default' : 'ok'}
              />
            </div>

            <div className="mt-3.5 flex items-center gap-2 border-t border-line pt-3">
              <TrendingUp size={14} strokeWidth={2.3} className="shrink-0 text-ink-3" />
              <span className="text-[12px] text-ink-2">
                {p.popularity >= 85
                  ? 'Very busy — arrive early or late in the day'
                  : p.popularity >= 65
                    ? 'Moderately busy at peak hours'
                    : 'Usually quiet'}
              </span>
              <span className="ml-auto flex items-center gap-1 text-[11.5px] text-ink-4">
                <Users size={11} strokeWidth={2.4} />
                {p.popularity}/100
              </span>
            </div>
          </Card>

          {/* --------------------------- get there by bus ---------------------- */}
          <section>
            <SectionHeader
              title="Get there by bus"
              hint="Live service to the nearest stop"
              action="Plan full journey"
              actionTo="/plan"
            />

            <Card className="border-brand-200">
              {/* the walk */}
              <Link
                to={`/stop/${p.nearestStopId}`}
                className="flex items-center gap-3 rounded-field border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:bg-surface-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-600 text-white">
                  <Bus size={16} strokeWidth={2.3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-[0.055em] text-ink-4">
                    Nearest bus stop
                  </span>
                  <span className="block truncate text-[13.5px] font-bold text-ink">
                    {stop?.name ?? '—'}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-ink-3">
                    <Footprints size={11} strokeWidth={2.4} />
                    {p.walkFromStopMin} min walk
                    {access.data && ` · ${formatDistance(access.data.distanceFromStopKm)}`}
                  </span>
                </span>
                <ChevronRight size={15} className="shrink-0 text-ink-4" />
              </Link>

              {/* the next bus */}
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
                  Next services
                </div>

                {departures.length > 0 ? (
                  <div className="space-y-2">
                    {departures.map(({ live, prediction }) => (
                      <Link
                        key={live.bus.id}
                        to={`/bus/${live.bus.id}`}
                        className="flex items-center gap-2.5 rounded-field border border-line px-3 py-2.5 transition-colors hover:bg-surface-2"
                      >
                        <span className="w-10 shrink-0 rounded-[6px] bg-ink py-1 text-center text-[11.5px] font-extrabold text-white">
                          {live.route.shortName}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold text-ink">
                            {live.route.destination}
                          </span>
                          <span className="mt-0.5 block">
                            <FuelBadge fuel={live.bus.fuel as FuelType} />
                          </span>
                        </span>
                        <EtaDisplay prediction={prediction} size="sm" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <StateBlock
                    compact
                    icon={<Bus size={19} strokeWidth={2} />}
                    title="No bus en route right now"
                    body="Check the printed timetable at the stop page for scheduled departures."
                  />
                )}
              </div>

              <ButtonLink to="/plan" block size="lg" className="mt-3">
                <Navigation size={16} strokeWidth={2.3} />
                Start journey
              </ButtonLink>
            </Card>
          </section>

          {/* -------------------------------- map ------------------------------ */}
          <div className="card h-[168px] overflow-hidden p-0">
            <TransitMap
              stops={stop ? [stop] : []}
              activeStopId={stop?.id}
              pin={p.position}
              center={p.position}
              zoom={14}
              interactive={false}
            />
          </div>

          {/* ------------------------------- about ----------------------------- */}
          <section>
            <SectionHeader title="About" />
            <Card>
              <p className="text-[13px] leading-relaxed text-ink-2">{p.description}</p>
            </Card>
          </section>

          {/* --------------------------- pair it with -------------------------- */}
          {(nearby.data ?? []).length > 0 && (
            <section>
              <SectionHeader
                title="Pair it with"
                hint="Nearby, and on the same bus corridor"
                action="Build a plan"
                actionTo="/itinerary"
              />
              <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4">
                {(nearby.data ?? []).map((n) => (
                  <Link key={n.id} to={`/place/${n.id}`} className="w-[152px] shrink-0">
                    <Card padded={false} className="overflow-hidden">
                      <PlaceArt seed={n.photoSeed} category={n.category} className="h-[80px]" />
                      <div className="p-2.5">
                        <div className="truncate text-[12.5px] font-bold text-ink">{n.name}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-3">
                          <Star size={9} fill="#E8A93B" strokeWidth={0} />
                          {n.rating} · {formatDistance(haversineKm(p.position, n.position))}
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ----------------------------- practical --------------------------- */}
          <Card>
            <div className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
              Before you go
            </div>
            <ul className="mt-2 space-y-2">
              <li className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2">
                <Clock size={13} strokeWidth={2.3} className="mt-0.5 shrink-0 text-ink-4" />
                Open {p.hours.toLowerCase()}. Allow about {duration(p.typicalVisitMin)} here.
              </li>
              <li className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2">
                <Ticket size={13} strokeWidth={2.3} className="mt-0.5 shrink-0 text-ink-4" />
                {p.entryFeeInr
                  ? `Entry ₹${p.entryFeeInr} per person. Carry cash — card machines are unreliable in the hills.`
                  : 'No entry fee.'}
              </li>
              <li className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2">
                <Bus size={13} strokeWidth={2.3} className="mt-0.5 shrink-0 text-ink-4" />
                Last bus back from {stop?.name.replace(/,.*$/, '')} is usually in the early evening —
                check the stop page before you set out.
              </li>
            </ul>
          </Card>

          <Button variant="secondary" block size="lg" onClick={() => toggleSavedPlace(p.id)}>
            <Bookmark size={16} strokeWidth={2.3} fill={saved ? 'currentColor' : 'none'} />
            {saved ? 'Saved to your places' : 'Save this place'}
          </Button>
        </Stack>
      </ScreenBody>
    </Screen>
  );
}
