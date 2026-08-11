import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Bus,
  ChevronRight,
  Compass,
  Crosshair,
  Leaf,
  MapPin,
  Navigation,
  Route as RouteIcon,
  ScanLine,
  Signal,
} from 'lucide-react';
import { Screen, ScreenBody, Stack } from '@/components/layout/Screen';
import { Logo } from '@/components/layout/AppShell';
import { SearchField } from '@/components/ui/Field';
import { Card, CardLink, SectionHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BusCard } from '@/components/transit/BusCard';
import { AlertStrip } from '@/components/transit/AlertCard';
import { PlaceCover } from '@/components/art/PlaceArt';
import { StateBlock } from '@/components/ui/States';
import { useApp } from '@/store/AppState';
import { useAsync, useDepartures } from '@/hooks/useLive';
import { getNearbyStops } from '@/services/transit';
import { getPlaces } from '@/services/places';
import { summarise, tripsWithin, TRIPS } from '@/data/trips';
import { greeting, kg } from '@/lib/format';
import { METHOD_LABEL } from '@/services/location';
import { cn } from '@/lib/cn';

/**
 * Home.
 *
 * Answers the three questions the SRS says the whole product exists for —
 * where is my bus, when does it reach me, how clean is it — above the fold and
 * within one tap. Tourism content sits below that, never above it.
 */
export function HomeScreen() {
  const navigate = useNavigate();
  const { location, alerts, unreadAlerts } = useApp();

  const departures = useDepartures(location.stopId, 3);
  const nearby = useAsync(() => getNearbyStops(location.position, 4), [location.position.lat]);
  const places = useAsync(() => getPlaces('popular', location.position), [location.position.lat]);

  const activeAlert = alerts.find((a) => a.severity !== 'info' && !a.read);
  const month = summarise(tripsWithin(TRIPS, 30));

  return (
    <Screen>
      {/* ------------------------------- header ------------------------------ */}
      <div className="shrink-0 bg-surface px-4 pb-4 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-3">{greeting()} 👋</p>
            <h1 className="mt-0.5 font-display text-[23px] font-extrabold leading-tight tracking-[-0.025em] text-ink">
              Where are you going?
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/alerts"
              aria-label="Notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-3"
            >
              <Bell size={20} strokeWidth={2} />
              {unreadAlerts > 0 && (
                <span className="absolute right-2 top-2 h-[8px] w-[8px] rounded-full border-2 border-surface bg-bad" />
              )}
            </Link>
            <Link to="/profile" aria-label="Profile" className="shrink-0">
              <Logo size={36} />
            </Link>
          </div>
        </div>

        <button onClick={() => navigate('/search')} className="mt-3.5 w-full text-left">
          <SearchField
            readOnly
            placeholder="Search destination, stop, route or landmark"
            className="pointer-events-none"
          />
        </button>

        {/* current location, and how we know it */}
        <Link
          to="/locate"
          className="mt-2.5 flex items-center gap-2 rounded-field bg-surface-3 px-3 py-2 transition-colors hover:bg-line"
        >
          <MapPin size={14} strokeWidth={2.4} className="shrink-0 text-brand-600" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
            {location.label}
          </span>
          <Badge tone="neutral">
            <Crosshair size={9} strokeWidth={2.8} />
            {METHOD_LABEL[location.method]}
          </Badge>
          <ChevronRight size={14} className="shrink-0 text-ink-4" />
        </Link>

        {/* four transport actions */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <QuickAction to="/plan" icon={<Navigation size={18} strokeWidth={2.1} />} label="Plan journey" />
          <QuickAction to="/locate" icon={<MapPin size={18} strokeWidth={2.1} />} label="Nearby stops" />
          <QuickAction to="/map" icon={<Bus size={18} strokeWidth={2.1} />} label="Track bus" />
          <QuickAction to="/scan" icon={<ScanLine size={18} strokeWidth={2.1} />} label="Scan stop" accent />
        </div>
      </div>

      {/* -------------------------------- body ------------------------------- */}
      <ScreenBody className="pt-4">
        <Stack>
          {activeAlert && <AlertStrip alert={activeAlert} />}

          {/* live departures from wherever the user is */}
          <section>
            <SectionHeader
              title="Departing near you"
              hint={location.stopId ? location.label : 'Pick a stop to see live arrivals'}
              action={location.stopId ? 'All departures' : undefined}
              actionTo={location.stopId ? `/stop/${location.stopId}` : undefined}
            />

            {departures.length > 0 ? (
              <div className="space-y-2.5">
                {departures.map(({ live, prediction }) => (
                  <BusCard
                    key={live.bus.id}
                    live={live}
                    prediction={prediction}
                    stopName={location.label.replace(/,.*$/, '')}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <StateBlock
                  compact
                  icon={<Bus size={20} strokeWidth={2} />}
                  title="No buses approaching right now"
                  body="Nothing is currently en route to this stop. The printed timetable is still available offline."
                  actions={
                    location.stopId ? (
                      <Link
                        to={`/stop/${location.stopId}`}
                        className="text-[13px] font-semibold text-brand-600"
                      >
                        View timetable →
                      </Link>
                    ) : (
                      <Link to="/locate" className="text-[13px] font-semibold text-brand-600">
                        Choose a stop →
                      </Link>
                    )
                  }
                />
              </Card>
            )}
          </section>

          {/* nearby stops */}
          <section>
            <SectionHeader
              title="Stops around you"
              action="Map"
              actionTo="/map"
              hint="Walking distance from your current location"
            />
            <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
              {(nearby.data ?? []).map(({ stop, walkMin, routes }) => (
                <Link
                  key={stop.id}
                  to={`/stop/${stop.id}`}
                  className="card w-[168px] shrink-0 p-3 transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-brand-50 text-brand-600">
                      <MapPin size={14} strokeWidth={2.4} />
                    </span>
                    <span className="text-[11.5px] font-semibold text-ink-3 tnum">
                      {walkMin} min walk
                    </span>
                  </div>
                  <div className="mt-2 line-clamp-2 text-[13.5px] font-bold leading-snug text-ink">
                    {stop.name}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {routes.slice(0, 3).map((r) => (
                      <span
                        key={r.id}
                        className="rounded-[5px] bg-surface-3 px-1.5 py-[1px] text-[10.5px] font-bold text-ink-2"
                      >
                        {r.shortName}
                      </span>
                    ))}
                    {routes.length > 3 && (
                      <span className="text-[10.5px] font-semibold text-ink-4">
                        +{routes.length - 3}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {nearby.status === 'loading' &&
                [0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-[104px] w-[168px] shrink-0 rounded-card" />
                ))}
            </div>
          </section>

          {/* the differentiator, stated plainly */}
          <CardLink to="/locate" className="border-brand-100 bg-brand-50">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-600 text-white">
                <Signal size={17} strokeWidth={2.3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-brand-800">GPS not working?</div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-brand-700/85">
                  Find your bus by stop name, landmark, map pin, QR plate or route number. Six ways
                  in — GPS is only one of them.
                </p>
              </div>
              <ChevronRight size={16} className="mt-1 shrink-0 text-brand-600" />
            </div>
          </CardLink>

          {/* your impact so far */}
          <CardLink to="/impact">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-ok-bg text-ok">
                <Leaf size={19} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
                  Last 30 days
                </div>
                <div className="mt-0.5 font-display text-[15px] font-bold text-ink">
                  {month.trips} bus trips ·{' '}
                  <span className="text-ok">{kg(month.co2SavedKg)} CO₂ saved</span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-4">
                  Estimated against driving alone in a petrol car
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-ink-4" />
            </div>
          </CardLink>

          {/* tourism, kept below transit */}
          <section>
            <SectionHeader
              title="Explore Himachal"
              hint="Places you can reach on public transport"
              action="See all"
              actionTo="/explore"
            />
            <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
              {(places.data ?? []).slice(0, 6).map((p) => (
                <Link key={p.id} to={`/place/${p.id}`} className="w-[176px] shrink-0">
                  <div className="card overflow-hidden p-0 transition-shadow hover:shadow-sm">
                    <PlaceCover seed={p.photoSeed} category={p.category} className="h-[96px]" />
                    <div className="p-2.5">
                      <div className="truncate text-[13px] font-bold text-ink">{p.name}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
                        <Bus size={11} strokeWidth={2.4} className="text-brand-600" />
                        <span className="truncate">{p.walkFromStopMin} min from stop</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* itinerary entry point */}
          <CardLink to="/itinerary" className="border-line">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-surface-3 text-ink-2">
                <Compass size={19} strokeWidth={2.1} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-ink">Build a day plan</div>
                <p className="mt-0.5 text-[12.5px] text-ink-3">
                  Tell us what you like and how long you have. We'll route it by bus.
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-ink-4" />
            </div>
          </CardLink>

          <FooterNote />
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

/* -------------------------------- pieces ---------------------------------- */

function QuickAction({
  to,
  icon,
  label,
  accent,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-field border px-1 py-2.5 transition-colors',
        accent
          ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
          : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
      )}
    >
      <span className={accent ? 'text-brand-600' : 'text-ink-2'}>{icon}</span>
      <span className="text-center text-[10.5px] font-semibold leading-tight">{label}</span>
    </Link>
  );
}

function FooterNote() {
  return (
    <div className="flex items-start gap-2 pt-1 text-[11px] leading-relaxed text-ink-4">
      <RouteIcon size={12} strokeWidth={2.2} className="mt-px shrink-0" />
      <span>
        Live positions are simulated for this build. Arrival times always carry a confidence mark;
        an ETA without one is never shown.
      </span>
    </div>
  );
}
