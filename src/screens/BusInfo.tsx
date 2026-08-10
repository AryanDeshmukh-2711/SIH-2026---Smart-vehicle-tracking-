import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Accessibility,
  Armchair,
  Bell,
  BellRing,
  Car,
  Cctv,
  Gauge,
  Leaf,
  Map as MapIcon,
  Share2,
  Star,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, SectionHeader, Stat } from '@/components/ui/Card';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { OccupancyMeter, Stars } from '@/components/ui/Meters';
import { StateBlock, Notice } from '@/components/ui/States';
import { GreenScoreCard } from '@/components/transit/Green';
import {
  ConfidenceNote,
  EtaDisplay,
  FreshnessLine,
  StatusBadge,
} from '@/components/transit/Eta';
import { RouteTimeline } from '@/components/transit/RouteTimeline';
import { AlertStrip } from '@/components/transit/AlertCard';
import { TransitMap } from '@/components/map/TransitMap';
import { useLiveBus } from '@/hooks/useLive';
import { useApp } from '@/store/AppState';
import { reviewsForBus, summariseReviews } from '@/data/reviews';
import { STOP_BY_ID, stopName } from '@/data/stops';
import { routeDistanceKm } from '@/data/routes';
import { CATEGORY_LABEL } from '@/data/routeLabels';
import { co2SavedKg, EMISSION_FACTORS, FUEL_LABEL, NORM_NOTE, busEmissionFactor } from '@/lib/green';
import { delayLabel } from '@/lib/eta';
import { OCCUPANCY_LABEL, OCCUPANCY_LEVEL, duration, kg, rupees } from '@/lib/format';
import { formatDistance } from '@/lib/geo';

const AMENITY_META: Record<string, { label: string; icon: typeof Wifi }> = {
  ac: { label: 'Air conditioned', icon: Gauge },
  'usb-charging': { label: 'USB charging', icon: Zap },
  wifi: { label: 'Wi-Fi', icon: Wifi },
  luggage: { label: 'Luggage hold', icon: Armchair },
  reclining: { label: 'Reclining seats', icon: Armchair },
  cctv: { label: 'CCTV', icon: Cctv },
};

/**
 * Bus detail.
 *
 * Ordered by what a waiting passenger needs, in order: is it coming and when,
 * where is it now, is it clean, what is it like inside. The environmental panel
 * carries its own arithmetic rather than a marketing badge — see `GreenScoreCard`.
 */
export function BusInfoScreen() {
  const { busId } = useParams<{ busId: string }>();
  const live = useLiveBus(busId);
  const { isTracked, toggleTracked, alerts, location } = useApp();
  const [showFullRoute, setShowFullRoute] = useState(false);

  const reviews = useMemo(() => (busId ? reviewsForBus(busId) : []), [busId]);
  const reviewSummary = useMemo(() => summariseReviews(reviews), [reviews]);

  if (!live) {
    return (
      <Screen>
        <ScreenHeader title="Bus" />
        <ScreenBody>
          <StateBlock
            icon={<Car size={24} strokeWidth={1.9} />}
            title="Bus not found"
            body="This vehicle is not in the current fleet feed. It may have been withdrawn from service."
            actions={
              <ButtonLink to="/map" variant="secondary" block>
                Open the live map
              </ButtonLink>
            }
          />
        </ScreenBody>
      </Screen>
    );
  }

  const { bus, route, live: pos } = live;
  const tracked = isTracked(bus.id);
  const next = pos.predictions[0];
  const nextStop = next ? STOP_BY_ID.get(next.stopId) : undefined;
  const routeAlert = alerts.find((a) => a.affectedRouteIds.includes(route.id));

  const totalKm = routeDistanceKm(route);
  const remainingKm = Math.max(0, totalKm - pos.progressKm);
  const tripCo2Saved = co2SavedKg(bus.fuel, totalKm);
  const carCo2 = EMISSION_FACTORS.carPetrolSolo * totalKm;
  const busCo2 = busEmissionFactor(bus.fuel) * totalKm;

  return (
    <Screen>
      <ScreenHeader
        title={`Bus ${route.shortName}`}
        subtitle={route.longName}
        actions={
          <>
            <IconButton label="Share" className="h-9 w-9">
              <Share2 size={16} strokeWidth={2.2} />
            </IconButton>
            <IconButton
              label={tracked ? 'Stop notifying me' : 'Notify me'}
              onClick={() => toggleTracked(bus.id)}
              className={tracked ? 'h-9 w-9 border-brand-200 bg-brand-50 text-brand-700' : 'h-9 w-9'}
            >
              {tracked ? <BellRing size={16} strokeWidth={2.3} /> : <Bell size={16} strokeWidth={2.2} />}
            </IconButton>
          </>
        }
      />

      <ScreenBody className="pt-4">
        <Stack>
          {routeAlert && <AlertStrip alert={routeAlert} />}

          {/* ---------------------------- live block --------------------------- */}
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-[19px] font-extrabold leading-tight text-ink">
                  {bus.registration}
                </div>
                <div className="mt-0.5 text-[12.5px] text-ink-3">
                  {bus.operator} · {CATEGORY_LABEL[route.category]}
                </div>
              </div>
              <StatusBadge status={pos.status} delayMin={pos.delayMin} />
            </div>

            {next ? (
              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
                  Arrives at {nextStop?.name.replace(/,.*$/, '') ?? 'next stop'}
                </div>
                <EtaDisplay prediction={next} size="lg" className="mt-1.5" />
                <ConfidenceNote confidence={next.confidence} />
              </div>
            ) : (
              <div className="mt-4 font-display text-[20px] font-bold text-ink-3">
                {pos.status === 'cancelled' ? 'Service cancelled' : 'Trip complete'}
              </div>
            )}

            <FreshnessLine live={pos} className="mt-3" />

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3.5">
              <Stat
                label="Now near"
                value={
                  pos.lastSeenStopName ??
                  stopName(route.stopIds[Math.max(0, pos.nextStopIndex - 1)]).replace(/,.*$/, '')
                }
                hint={`${formatDistance(pos.progressKm)} into the route`}
              />
              <Stat
                label="Remaining"
                value={formatDistance(remainingKm)}
                hint={`${route.stopIds.length - pos.nextStopIndex} stops left`}
              />
              <Stat
                label="Schedule"
                value={pos.delayMin >= 5 ? `+${Math.round(pos.delayMin)} min` : 'On time'}
                tone={pos.delayMin >= 5 ? 'warn' : 'ok'}
                hint={delayLabel(pos.delayMin)}
              />
            </div>
          </Card>

          {/* ------------------------------ mini map --------------------------- */}
          <div className="card overflow-hidden p-0">
            <div className="h-[178px]">
              <TransitMap
                buses={[live]}
                routes={[route]}
                stops={route.stopIds.map((id) => STOP_BY_ID.get(id)!).filter(Boolean)}
                selectedBusId={bus.id}
                userPosition={location.position}
                fitTo={route.shape}
                interactive={false}
              />
            </div>
            <Link
              to={`/map?bus=${bus.id}&route=${route.id}`}
              className="flex items-center justify-center gap-1.5 border-t border-line py-2.5 text-[13px] font-semibold text-brand-600 transition-colors hover:bg-surface-2"
            >
              <MapIcon size={15} strokeWidth={2.3} />
              Track on the full map
            </Link>
          </div>

          {/* --------------------------- route timeline ------------------------ */}
          <section>
            <SectionHeader
              title="Stops and arrival times"
              hint="Every stop carries its own confidence mark"
              action={showFullRoute ? 'Show less' : `All ${route.stopIds.length} stops`}
              onAction={() => setShowFullRoute((v) => !v)}
            />
            <Card padded={false} className="px-4 py-1">
              {showFullRoute ? (
                <RouteTimeline live={live} highlightStopId={location.stopId} />
              ) : (
                <RouteTimeline
                  live={{
                    ...live,
                    route: {
                      ...route,
                      stopIds: route.stopIds.slice(
                        Math.max(0, pos.nextStopIndex - 1),
                        pos.nextStopIndex + 3,
                      ),
                      distancesKm: route.distancesKm.slice(
                        Math.max(0, pos.nextStopIndex - 1),
                        pos.nextStopIndex + 3,
                      ),
                    },
                    live: { ...pos, nextStopIndex: pos.nextStopIndex > 0 ? 1 : 0 },
                  }}
                  compact
                />
              )}
            </Card>
          </section>

          {/* ---------------------------- environment -------------------------- */}
          <section>
            <SectionHeader
              title="Environmental profile"
              hint="Figures are estimates — see the assumptions on the impact page"
            />
            <Stack gap={3}>
              <GreenScoreCard bus={bus} />

              <Card>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-ok-bg text-ok">
                    <Leaf size={16} strokeWidth={2.3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-ink">
                      {kg(tripCo2Saved)} CO₂ saved over the full route
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                      Driving this {Math.round(totalKm)} km alone in a petrol car emits about{' '}
                      {kg(carCo2)}. This bus emits about {kg(busCo2)} per passenger over the same
                      distance.
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  <ComparisonBar label="Petrol car, driving alone" value={carCo2} max={carCo2} tone="bad" />
                  <ComparisonBar
                    label={`This bus (${FUEL_LABEL[bus.fuel]})`}
                    value={busCo2}
                    max={carCo2}
                    tone="ok"
                  />
                </div>
              </Card>

              <Notice tone={bus.norm === 'BS-IV' || bus.norm === 'BS-III' ? 'warn' : 'neutral'}>
                <span className="font-semibold">{bus.norm === 'zero-tailpipe' ? 'Zero tailpipe' : bus.norm}:</span>{' '}
                {NORM_NOTE[bus.norm]}
                {bus.emissionDataEstimated &&
                  ' The operator has not filed an emission record for this vehicle, so this is inferred from its year of manufacture.'}
              </Notice>
            </Stack>
          </section>

          {/* ------------------------------ vehicle ---------------------------- */}
          <section>
            <SectionHeader title="Vehicle details" />
            <Card>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                <Stat label="Registration" value={bus.registration} />
                <Stat label="Operator" value={bus.operator} />
                <Stat label="Route" value={`${route.shortName} · ${route.longName}`} />
                <Stat label="Service class" value={CATEGORY_LABEL[route.category]} />
                <Stat label="Seating" value={`${bus.seats} seats`} />
                <Stat label="Model year" value={String(bus.year)} />
                <Stat label="Full route" value={`${Math.round(totalKm)} km`} hint={duration(route.typicalDurationMin)} />
                <Stat label="Full fare" value={rupees(route.fareInr)} />
              </div>

              <div className="mt-4 border-t border-line pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
                  Onboard
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={bus.wheelchairAccessible ? 'ok' : 'neutral'}>
                    <Accessibility size={10} strokeWidth={2.6} />
                    {bus.wheelchairAccessible ? 'Step-free access' : 'No step-free access'}
                  </Badge>
                  {bus.amenities.map((a) => {
                    const meta = AMENITY_META[a];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <Badge key={a}>
                        <Icon size={10} strokeWidth={2.6} />
                        {meta.label}
                      </Badge>
                    );
                  })}
                  {bus.amenities.length === 0 && !bus.wheelchairAccessible && (
                    <span className="text-[12px] text-ink-4">No amenities recorded</span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
                <Users size={15} strokeWidth={2.2} className="text-ink-3" />
                <span className="text-[13px] font-semibold text-ink">Occupancy right now</span>
                <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-ink-2">
                  <OccupancyMeter level={OCCUPANCY_LEVEL[pos.occupancy]} />
                  {OCCUPANCY_LABEL[pos.occupancy]}
                </span>
              </div>
            </Card>
          </section>

          {/* ------------------------- passenger experience -------------------- */}
          <section>
            <SectionHeader
              title="Passenger experience"
              action="All reviews"
              actionTo={`/bus/${bus.id}/reviews`}
            />
            <Card>
              {reviewSummary.count === 0 ? (
                <StateBlock
                  compact
                  icon={<Star size={19} strokeWidth={2} />}
                  title="No reviews yet"
                  body="Ratings appear once passengers have completed a journey on this vehicle."
                />
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="font-display text-[30px] font-extrabold leading-none text-ink tnum">
                        {reviewSummary.overall.toFixed(1)}
                      </div>
                      <Stars value={reviewSummary.overall} className="mt-1.5" />
                      <div className="mt-1 text-[11px] text-ink-4">
                        {reviewSummary.count} review{reviewSummary.count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {(
                        [
                          ['Cleanliness', reviewSummary.breakdown.cleanliness],
                          ['Comfort', reviewSummary.breakdown.comfort],
                          ['Punctuality', reviewSummary.breakdown.punctuality],
                          ['Safety', reviewSummary.breakdown.safety],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className="w-[74px] shrink-0 text-[11.5px] text-ink-3">{label}</span>
                          <span className="h-[4px] flex-1 overflow-hidden rounded-full bg-surface-3">
                            <span
                              className="block h-full rounded-full bg-brand-500"
                              style={{ width: `${(value / 5) * 100}%` }}
                            />
                          </span>
                          <span className="w-6 shrink-0 text-right text-[11.5px] font-bold text-ink tnum">
                            {value.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <ButtonLink
                    to={`/bus/${bus.id}/reviews`}
                    variant="secondary"
                    block
                    className="mt-4"
                  >
                    Read {reviewSummary.count} reviews
                  </ButtonLink>
                </>
              )}
            </Card>
          </section>

          {/* ------------------------------- actions --------------------------- */}
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant={tracked ? 'secondary' : 'primary'}
              size="lg"
              onClick={() => toggleTracked(bus.id)}
            >
              {tracked ? <BellRing size={16} strokeWidth={2.3} /> : <Bell size={16} strokeWidth={2.3} />}
              {tracked ? 'Tracking' : 'Notify me'}
            </Button>
            <ButtonLink to={`/map?bus=${bus.id}&route=${route.id}`} variant="secondary" size="lg">
              <MapIcon size={16} strokeWidth={2.3} />
              Track on map
            </ButtonLink>
          </div>
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

function ComparisonBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'ok' | 'bad';
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-2">{label}</span>
        <span className="text-[12px] font-bold text-ink tnum">{kg(value)}</span>
      </div>
      <div className="mt-1 h-[6px] overflow-hidden rounded-full bg-surface-3">
        <div
          className={tone === 'ok' ? 'h-full rounded-full bg-ok' : 'h-full rounded-full bg-bad/70'}
          style={{ width: `${Math.max(3, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}
