import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Accessibility,
  Armchair,
  Bus,
  Clock,
  Lightbulb,
  MapPin,
  MessageSquare,
  Navigation,
  QrCode,
  Ticket,
  Umbrella,
  Zap,
} from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, List, SectionHeader, Stat } from '@/components/ui/Card';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { StateBlock, Notice } from '@/components/ui/States';
import { BusCard } from '@/components/transit/BusCard';
import { AlertStrip } from '@/components/transit/AlertCard';
import { PlaceArt } from '@/components/art/PlaceArt';
import { TransitMap } from '@/components/map/TransitMap';
import { useAsync, useDepartures } from '@/hooks/useLive';
import { useApp } from '@/store/AppState';
import { STOP_BY_ID } from '@/data/stops';
import { routesServingStop } from '@/data/routes';
import { placesNearStop, CATEGORY_LABEL } from '@/data/places';
import { getTimetable, smsReply, upcomingTimetable } from '@/services/transit';
import { resolveByStop } from '@/services/location';
import { formatDistance, haversineKm, walkMinutes } from '@/lib/geo';
import { pretty24 } from '@/lib/format';

const AMENITY_META = {
  shelter: { label: 'Shelter', icon: Umbrella },
  seating: { label: 'Seating', icon: Armchair },
  lighting: { label: 'Lit at night', icon: Lightbulb },
  'ticket-counter': { label: 'Ticket counter', icon: Ticket },
  restroom: { label: 'Restroom', icon: MapPin },
  ramp: { label: 'Step-free', icon: Accessibility },
} as const;

/**
 * Stop detail.
 *
 * The live board comes first; the printed timetable sits alongside it as a peer
 * rather than a fallback, because in the hills the timetable is what people
 * actually rely on when the feed is stale (FR-31).
 */
export function StopDetailScreen() {
  const { stopId } = useParams<{ stopId: string }>();
  const { location, setLocation, alerts } = useApp();
  const [tab, setTab] = useState<'live' | 'timetable'>('live');
  const [showSms, setShowSms] = useState(false);

  const stop = stopId ? STOP_BY_ID.get(stopId) : undefined;
  const departures = useDepartures(stopId, 8);
  const timetable = useAsync(() => getTimetable(stopId!), [stopId]);

  const routes = useMemo(() => (stopId ? routesServingStop(stopId) : []), [stopId]);
  const places = useMemo(() => (stopId ? placesNearStop(stopId) : []), [stopId]);
  const stopAlert = alerts.find((a) => a.affectedStopIds.includes(stopId ?? ''));

  if (!stop) {
    return (
      <Screen>
        <ScreenHeader title="Bus stop" />
        <ScreenBody>
          <StateBlock
            icon={<MapPin size={24} strokeWidth={1.9} />}
            title="Stop not found"
            body="This stop code is not in the current network data."
            actions={
              <ButtonLink to="/search" variant="secondary" block>
                Search for a stop
              </ButtonLink>
            }
          />
        </ScreenBody>
      </Screen>
    );
  }

  const isHere = location.stopId === stop.id;
  const walkKm = haversineKm(location.position, stop.position);
  const upcoming = timetable.data ? upcomingTimetable(timetable.data, 8) : [];

  return (
    <Screen>
      <ScreenHeader
        title={stop.name}
        subtitle={`${stop.town} · Stop ${stop.id}`}
        actions={
          <button
            onClick={() => setShowSms(true)}
            aria-label="SMS this stop"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-3"
          >
            <MessageSquare size={17} strokeWidth={2.2} />
          </button>
        }
      />

      <ScreenBody className="pt-4">
        <Stack>
          {stopAlert && <AlertStrip alert={stopAlert} />}

          {/* --------------------------- stop identity ------------------------ */}
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Badge tone="brand">{stop.kind === 'isbt' ? 'ISBT' : stop.kind === 'bus-stand' ? 'Bus stand' : 'Stop'}</Badge>
                  <span className="font-mono text-[11px] text-ink-4">{stop.id}</span>
                </div>
                <div className="mt-1.5 text-[12.5px] text-ink-3">
                  {stop.landmarks.slice(0, 3).join(' · ')}
                </div>
              </div>
              {isHere ? (
                <StatusPill tone="brand" pulse>
                  You are here
                </StatusPill>
              ) : (
                <span className="shrink-0 text-right">
                  <span className="block font-display text-[15px] font-bold text-ink tnum">
                    {walkMinutes(walkKm)} min
                  </span>
                  <span className="block text-[11px] text-ink-4">
                    {formatDistance(walkKm)} walk
                  </span>
                </span>
              )}
            </div>

            <div className="mt-3.5 grid grid-cols-3 gap-3 border-t border-line pt-3.5">
              <Stat label="Routes" value={String(routes.length)} />
              <Stat label="SMS code" value={stop.smsCode} hint={`Text BUS ${stop.smsCode}`} />
              <Stat
                label="Platforms"
                value={stop.platforms ? String(stop.platforms.length) : '—'}
              />
            </div>

            <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {stop.amenities.map((a) => {
                const meta = AMENITY_META[a];
                const Icon = meta.icon;
                return (
                  <Badge key={a}>
                    <Icon size={10} strokeWidth={2.6} />
                    {meta.label}
                  </Badge>
                );
              })}
            </div>

            {!isHere && (
              <Button
                variant="secondary"
                block
                className="mt-3.5"
                onClick={() => setLocation(resolveByStop(stop.id))}
              >
                <Navigation size={15} strokeWidth={2.3} />
                Set as my location
              </Button>
            )}
          </Card>

          {/* ---------------------------- departures -------------------------- */}
          <section>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold text-ink">Departures</h2>
              <Segmented<'live' | 'timetable'>
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'live', label: 'Live' },
                  { value: 'timetable', label: 'Timetable' },
                ]}
                className="w-[170px]"
              />
            </div>

            {tab === 'live' ? (
              departures.length > 0 ? (
                <div className="space-y-2.5">
                  {departures.map(({ live, prediction }, i) => (
                    <BusCard
                      key={live.bus.id}
                      live={live}
                      prediction={prediction}
                      stopName={stop.name.replace(/,.*$/, '')}
                      platform={stop.platforms?.[i % stop.platforms.length]}
                    />
                  ))}
                </div>
              ) : (
                <Card>
                  <StateBlock
                    compact
                    icon={<Bus size={20} strokeWidth={2} />}
                    title="No buses currently approaching"
                    body="Nothing is en route to this stop right now. The printed timetable below still applies."
                    actions={
                      <Button variant="secondary" size="sm" onClick={() => setTab('timetable')}>
                        Open the timetable
                      </Button>
                    }
                  />
                </Card>
              )
            ) : (
              <>
                <Notice tone="neutral" icon={<Clock size={14} strokeWidth={2.3} />}>
                  Scheduled times from the published HRTC timetable. These are saved on your device
                  and remain available with no connection.
                </Notice>
                <Card padded={false} className="mt-2.5 divide-y divide-line overflow-hidden">
                  {upcoming.map((t, i) => (
                    <div key={`${t.routeId}-${t.time}-${i}`} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-11 shrink-0 rounded-[6px] bg-ink py-1 text-center text-[11.5px] font-extrabold text-white">
                        {t.shortName}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                        {t.headsign}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-display text-[14px] font-bold text-ink tnum">
                          {pretty24(t.time)}
                        </span>
                        <span className="block text-[11px] text-ink-4">₹{t.fareInr}</span>
                      </span>
                    </div>
                  ))}
                  {upcoming.length === 0 && (
                    <div className="px-4 py-6 text-center text-[13px] text-ink-3">
                      No further departures today.
                    </div>
                  )}
                </Card>
              </>
            )}
          </section>

          {/* ------------------------------ routes ---------------------------- */}
          <section>
            <SectionHeader title="Routes calling here" />
            <List>
              {routes.map((r) => (
                <Link
                  key={r.id}
                  to={`/map?route=${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
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
                </Link>
              ))}
            </List>
          </section>

          {/* ------------------------------- map ------------------------------ */}
          <div className="card h-[168px] overflow-hidden p-0">
            <TransitMap
              stops={[stop]}
              activeStopId={stop.id}
              routes={routes}
              userPosition={location.position}
              center={stop.position}
              zoom={13}
              interactive={false}
            />
          </div>

          {/* --------------------------- nearby places ------------------------ */}
          {places.length > 0 && (
            <section>
              <SectionHeader
                title="Worth a stop here"
                hint="Places within walking distance of this stand"
              />
              <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4">
                {places.slice(0, 6).map((p) => (
                  <Link key={p.id} to={`/place/${p.id}`} className="w-[152px] shrink-0">
                    <div className="card overflow-hidden p-0">
                      <PlaceArt seed={p.photoSeed} category={p.category} className="h-[80px]" />
                      <div className="p-2.5">
                        <div className="truncate text-[12.5px] font-bold text-ink">{p.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-ink-3">
                          {CATEGORY_LABEL[p.category]} · {p.walkFromStopMin} min
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* --------------------------- QR reference ------------------------- */}
          <Card className="border-brand-100 bg-brand-50">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-600 text-white">
                <QrCode size={17} strokeWidth={2.3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-brand-800">
                  This stop has a QR plate
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-brand-700/85">
                  Scanning it identifies the stop exactly — no GPS, no typing. The code{' '}
                  <span className="font-mono font-semibold">{stop.id}</span> is printed underneath
                  for anyone whose camera cannot focus.
                </p>
              </div>
            </div>
          </Card>
        </Stack>
      </ScreenBody>

      {/* ---------------------------- SMS preview ---------------------------- */}
      <Sheet
        open={showSms}
        onClose={() => setShowSms(false)}
        title="Get these times by SMS"
        subtitle="Works on any phone, with no internet"
      >
        <div className="space-y-3.5 pb-2">
          <Card>
            <div className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
              You send
            </div>
            <div className="mt-2 rounded-field bg-brand-600 px-3.5 py-2.5 font-mono text-[13.5px] font-semibold text-white">
              BUS {stop.smsCode}
            </div>
            <div className="mt-1 text-[11px] text-ink-4">to 56070</div>
          </Card>

          <Card>
            <div className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
              You get back
            </div>
            <div className="mt-2 rounded-field bg-surface-3 px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink">
              {stopId ? smsReply(stopId) : ''}
            </div>
            <div className="mt-1 text-[11px] text-ink-4">Typically within 30 seconds</div>
          </Card>

          <Notice tone="neutral" icon={<Zap size={14} strokeWidth={2.3} />}>
            The same three departures, the ETA and the fuel tag — enough to decide whether to leave
            the house. Village and elderly users get this without ever installing the app.
          </Notice>
        </div>
      </Sheet>
    </Screen>
  );
}
