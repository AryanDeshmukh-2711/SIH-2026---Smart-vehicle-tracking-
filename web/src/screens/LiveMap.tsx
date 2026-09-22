import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Filter,
  Layers,
  Leaf,
  MapPin,
  Navigation,
  X,
} from 'lucide-react';
import { DockedSheet } from '@/components/ui/Sheet';
import { Chip, ChipRow, StatusPill } from '@/components/ui/Badge';
import { TransitMap } from '@/components/map/TransitMap';
import { GreenStrip } from '@/components/transit/Green';
import { EtaDisplay, LiveStatusLine, StatusBadge } from '@/components/transit/Eta';
import { OccupancyMeter } from '@/components/ui/Meters';
import { StateBlock } from '@/components/ui/States';
import type { LatLng } from '@/types';
import { useLiveFleet } from '@/hooks/useLive';
import { useApp } from '@/store/AppState';
import { ROUTES, ROUTE_BY_ID } from '@/data/routes';
import { STOPS, STOP_BY_ID } from '@/data/stops';
import { OCCUPANCY_LABEL, OCCUPANCY_LEVEL } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { cn } from '@/lib/cn';

type FleetFilter = 'all' | 'clean' | 'running';

/** Whole-network view: roughly the centroid of the eight modelled corridors. */
const NETWORK_CENTER: LatLng = { lat: 31.55, lng: 77.05 };
const NETWORK_ZOOM = 9;

/**
 * Live network map.
 *
 * Full-bleed by design: on a moving bus the map *is* the interface. Selecting a
 * vehicle raises a sheet with the same information hierarchy as a bus card, so
 * nothing has to be re-learned between the list and the map.
 */
export function LiveMapScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { location } = useApp();
  const fleet = useLiveFleet();

  const routeFilter = params.get('route');
  const busParam = params.get('bus');
  const [selectedId, setSelectedId] = useState<string | null>(busParam);
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [showStops, setShowStops] = useState(true);
  /** Set when the user asks to be recentred. The key re-fires an unchanged position. */
  const [recentre, setRecentre] = useState<LatLng | undefined>();
  const [recentreKey, setRecentreKey] = useState(0);

  // `?bus=` is read on mount only by `useState`. Navigating here from a bus
  // screen while already on the map changes the query string without remounting,
  // so the deep link has to be honoured on change too.
  useEffect(() => {
    if (busParam) setSelectedId(busParam);
  }, [busParam]);

  const visible = useMemo(() => {
    let list = fleet.filter((b) => b.live.status !== 'scheduled');
    if (routeFilter) list = list.filter((b) => b.route.id === routeFilter);
    if (filter === 'clean') list = list.filter((b) => b.bus.fuel !== 'diesel');
    if (filter === 'running') list = list.filter((b) => b.live.status === 'running');
    return list;
  }, [fleet, routeFilter, filter]);

  const selected = selectedId ? fleet.find((b) => b.bus.id === selectedId) : undefined;

  // Choosing a vehicle hands the viewport back to that route's fitBounds.
  const selectBus = (busId: string) => {
    setRecentre(undefined);
    setSelectedId(busId);
  };

  const shownRoutes = useMemo(() => {
    if (selected) return [selected.route];
    if (routeFilter) return ROUTES.filter((r) => r.id === routeFilter);
    return ROUTES;
  }, [selected, routeFilter]);

  const shownStops = useMemo(() => {
    if (!showStops) return [];
    if (selected) return selected.route.stopIds.map((id) => STOP_BY_ID.get(id)!).filter(Boolean);
    if (routeFilter) {
      const r = ROUTE_BY_ID.get(routeFilter);
      return r ? r.stopIds.map((id) => STOP_BY_ID.get(id)!).filter(Boolean) : [];
    }
    return STOPS.filter((s) => s.kind === 'isbt' || s.kind === 'bus-stand');
  }, [showStops, selected, routeFilter]);

  const fitTo = useMemo(() => {
    if (selected) return selected.route.shape;
    if (routeFilter) return ROUTE_BY_ID.get(routeFilter)?.shape ?? [];
    return [];
  }, [selected, routeFilter]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* -------------------------------- map -------------------------------- */}
      {/*
        `z-0` is load-bearing, not cosmetic. Leaflet gives its own panes
        z-index 400-700; with this wrapper left at `z-index: auto` it creates no
        stacking context, so those panes were hoisted out and compared directly
        against the chrome's `z-10` — and won. The back button and the bottom
        sheet were rendered *behind* the map and could not be clicked at all,
        which left the full-screen map with no way out. `z-0` on a positioned
        element does establish a stacking context, so Leaflet's z-indexes stay
        contained inside it.
      */}
      <div className="absolute inset-0 z-0">
        <TransitMap
          buses={visible}
          routes={shownRoutes}
          stops={shownStops}
          selectedBusId={selectedId ?? undefined}
          onSelectBus={selectBus}
          onSelectStop={(id) => navigate(`/stop/${id}`)}
          userPosition={location.position}
          userAccurate={location.accuracyM < 200}
          fitTo={recentre ? undefined : fitTo}
          zoom={recentre ? 14 : routeFilter || selected ? undefined : NETWORK_ZOOM}
          center={recentre ?? (!routeFilter && !selected ? NETWORK_CENTER : undefined)}
          recenterKey={recentreKey}
        />
      </div>

      {/* ------------------------------ top chrome --------------------------- */}
      <div className="pointer-events-none relative z-10 shrink-0 p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-md"
          >
            <ChevronLeft size={20} strokeWidth={2.4} />
          </button>

          <div className="pointer-events-auto min-w-0 flex-1 rounded-field bg-surface px-3 py-2 shadow-md">
            {routeFilter ? (
              <div className="flex items-center gap-2">
                <span className="rounded-[5px] bg-ink px-1.5 py-[1px] text-[11px] font-extrabold text-white">
                  {ROUTE_BY_ID.get(routeFilter)?.shortName}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
                  {ROUTE_BY_ID.get(routeFilter)?.longName}
                </span>
                <button
                  onClick={() => {
                    setParams({});
                    setSelectedId(null);
                  }}
                  aria-label="Clear route filter"
                  className="text-ink-4"
                >
                  <X size={14} strokeWidth={2.6} />
                </button>
              </div>
            ) : (
              <Link to="/search" className="flex items-center gap-2">
                <MapPin size={14} strokeWidth={2.4} className="shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-3">
                  Search a route, stop or bus
                </span>
              </Link>
            )}
          </div>

          <button
            onClick={() => setShowStops((v) => !v)}
            aria-label="Toggle stops"
            className={cn(
              'pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-colors',
              showStops ? 'bg-brand-600 text-white' : 'bg-surface text-ink-2',
            )}
          >
            <Layers size={18} strokeWidth={2.2} />
          </button>
        </div>

        <ChipRow className="pointer-events-auto mt-2.5 px-3">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All buses ({fleet.filter((b) => b.live.status !== 'scheduled').length})
          </Chip>
          <Chip active={filter === 'running'} onClick={() => setFilter('running')}>
            On time
          </Chip>
          <Chip
            active={filter === 'clean'}
            onClick={() => setFilter('clean')}
            icon={<Leaf size={12} strokeWidth={2.6} />}
          >
            Clean fuel only
          </Chip>
        </ChipRow>
      </div>

      <div className="flex-1" />

      {/* ------------------------------ bottom sheet ------------------------- */}
      <div className="pointer-events-none relative z-10 shrink-0">
        <div className="pointer-events-auto mb-2 flex justify-end px-3">
          <button
            onClick={() => {
              // Deselecting first, so the selected route's fitBounds does not
              // immediately pull the viewport back off the user's position.
              setSelectedId(null);
              setRecentre({ ...location.position });
              setRecentreKey((n) => n + 1);
            }}
            aria-label="Centre on my location"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-2 shadow-md transition-colors hover:bg-surface-3"
          >
            <Crosshair size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div className="pointer-events-auto">
          {selected ? (
            <DockedSheet>
              <div className="px-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="rounded-[7px] bg-ink px-2 py-[3px] font-display text-[13px] font-extrabold text-white">
                      {selected.route.shortName}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-display text-[15px] font-bold leading-tight text-ink">
                        {selected.bus.registration}
                      </div>
                      <div className="truncate text-[11.5px] text-ink-3">
                        {selected.route.longName}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    aria-label="Close"
                    className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-3"
                  >
                    <X size={15} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    {selected.live.predictions[0] ? (
                      <>
                        <EtaDisplay prediction={selected.live.predictions[0]} />
                        <div className="mt-1 truncate text-[12px] text-ink-3">
                          Arriving at{' '}
                          {STOP_BY_ID.get(selected.live.predictions[0].stopId)?.name ?? 'next stop'}
                          {' · '}
                          {formatDistance(selected.live.predictions[0].distanceKm)} away
                        </div>
                      </>
                    ) : (
                      <div className="font-display text-[20px] font-bold text-ink">
                        No upcoming stops
                      </div>
                    )}
                  </div>
                  <StatusBadge status={selected.live.status} delayMin={selected.live.delayMin} />
                </div>

                <LiveStatusLine live={selected.live} className="mt-2" />

                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <GreenStrip
                    bus={selected.bus}
                    score={selected.greenScore}
                    className="min-w-0 flex-1"
                  />
                  <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-ink-3">
                    <OccupancyMeter level={OCCUPANCY_LEVEL[selected.live.occupancy]} />
                    {OCCUPANCY_LABEL[selected.live.occupancy]}
                  </span>
                </div>

                <Link
                  to={`/bus/${selected.bus.id}`}
                  className="mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-field bg-brand-600 text-[14px] font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  Full bus details
                  <ChevronRight size={16} strokeWidth={2.5} />
                </Link>
              </div>
            </DockedSheet>
          ) : (
            <DockedSheet>
              <div className="px-4 pb-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-[15px] font-bold text-ink">
                    {visible.length} bus{visible.length === 1 ? '' : 'es'} on the map
                  </h2>
                  <StatusPill tone="ok" pulse>
                    Live
                  </StatusPill>
                </div>

                {visible.length === 0 ? (
                  <StateBlock
                    compact
                    icon={<Filter size={19} strokeWidth={2} />}
                    title="No buses match this filter"
                    body="Loosen the filter, or check the timetable for scheduled departures."
                  />
                ) : (
                  <div className="no-scrollbar mt-2.5 flex max-h-[168px] flex-col gap-2 overflow-y-auto">
                    {visible.slice(0, 8).map((b) => (
                      <button
                        key={b.bus.id}
                        onClick={() => selectBus(b.bus.id)}
                        className="flex items-center gap-2.5 rounded-field border border-line px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="w-9 shrink-0 rounded-[6px] bg-ink py-1 text-center text-[11px] font-extrabold text-white">
                          {b.route.shortName}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink">
                            {b.route.destination}
                          </span>
                          <span className="block truncate text-[11px] text-ink-3">
                            {b.bus.registration} ·{' '}
                            {/* Speed is unknown while a vehicle is not reporting —
                                printing "0 km/h" would be an assertion we can't make. */}
                            {b.live.status === 'signal-lost'
                              ? 'not reporting'
                              : b.live.status === 'cancelled'
                                ? 'cancelled'
                                : `${b.live.speedKmph} km/h`}
                          </span>
                        </span>
                        {b.live.status === 'cancelled' ? (
                          <span className="shrink-0 text-[11.5px] font-semibold text-bad">
                            Cancelled
                          </span>
                        ) : (
                          b.live.predictions[0] && (
                            <span className="shrink-0 text-[13px] font-bold text-ink tnum">
                              {b.live.predictions[0].etaMin} min
                            </span>
                          )
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <Link
                  to="/plan"
                  className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-field border border-line-strong bg-surface text-[14px] font-semibold text-ink transition-colors hover:bg-surface-3"
                >
                  <Navigation size={15} strokeWidth={2.3} />
                  Plan a journey instead
                </Link>
              </div>
            </DockedSheet>
          )}
        </div>
      </div>
    </div>
  );
}
