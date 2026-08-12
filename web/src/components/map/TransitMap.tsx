import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng, LiveBus, Route, Stop } from '@/types';
import { boundsOf } from '@/lib/geo';
import { scoreColorVar } from '@/components/transit/Green';

/**
 * Map surface.
 *
 * The basemap has to stay quiet enough for four overlays to read at once — route
 * lines, vehicles, stops, the user — while still showing the road network the
 * buses actually run on. Carto Positron was quiet but too quiet: zoomed in past
 * the network view its roads are near-white on white, so a passenger checking
 * which street their bus is on could not see the street.
 *
 * Voyager is the same free OSM-derived Carto CDN but renders a real road
 * hierarchy. It is toned down in CSS (see `.routify-tiles` in index.css) rather
 * than swapped for a greyscale style, because it is the road *geometry* that was
 * missing, not the colour that was the problem.
 */

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Carto raster tiles are published to z20; going past it just upscales. */
const MAX_TILE_ZOOM = 20;

/* ------------------------------- markers ---------------------------------- */

/**
 * Icon cache.
 *
 * The fleet snapshot is replaced every second, so every render produced a fresh
 * `L.DivIcon` for every marker — and react-leaflet reacts to a new icon prop by
 * calling `setIcon`, which tears down and rebuilds the marker's DOM. That is the
 * whole fleet re-created once a second for markers that mostly have not changed.
 *
 * A `DivIcon` is stateless with respect to the markers using it (`createIcon`
 * builds a fresh node per marker), so identical icons can safely be shared.
 */
const iconCache = new Map<string, L.DivIcon>();

function cachedIcon(key: string, build: () => L.DivIcon): L.DivIcon {
  let icon = iconCache.get(key);
  if (!icon) {
    icon = build();
    iconCache.set(key, icon);
  }
  return icon;
}

function busIcon(live: LiveBus, selected: boolean): L.DivIcon {
  const stale = live.live.status === 'signal-lost';
  const cancelled = live.live.status === 'cancelled';
  const colour = cancelled
    ? 'var(--color-ink-4)'
    : stale
      ? 'var(--color-warn)'
      : scoreColorVar(live.greenScore);

  const size = selected ? 42 : 34;

  return cachedIcon(
    `bus:${live.route.shortName}:${colour}:${size}:${stale}:${cancelled}`,
    () => buildBusIcon(live.route.shortName, colour, size, selected, stale, cancelled),
  );
}

function buildBusIcon(
  shortName: string,
  colour: string,
  size: number,
  selected: boolean,
  stale: boolean,
  cancelled: boolean,
): L.DivIcon {
  return L.divIcon({
    className: 'routify-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="
        width:${size}px;height:${size}px;position:relative;
        display:flex;align-items:center;justify-content:center;
      ">
        ${selected ? `<span style="position:absolute;inset:0;border-radius:50%;background:${colour};opacity:.16"></span>` : ''}
        <span style="
          width:${selected ? 30 : 25}px;height:${selected ? 30 : 25}px;border-radius:9px;
          background:#fff;border:2px solid ${colour};
          box-shadow:0 2px 6px rgba(12,20,36,.22);
          display:flex;align-items:center;justify-content:center;
          transform:rotate(0deg);
          ${stale ? 'border-style:dashed;' : ''}
        ">
          <span style="
            font:800 ${selected ? 11 : 9.5}px/1 'Plus Jakarta Sans',system-ui,sans-serif;
            color:${colour};letter-spacing:-.02em;
          ">${shortName}</span>
        </span>
        ${
          stale || cancelled
            ? ''
            : `<span style="
                position:absolute;top:0;right:0;width:8px;height:8px;border-radius:50%;
                background:var(--color-ok);border:1.5px solid #fff;
              "></span>`
        }
      </div>`,
  });
}

function stopIcon(kind: Stop['kind'], active: boolean): L.DivIcon {
  const major = kind === 'isbt' || kind === 'bus-stand';
  const size = major ? 14 : 10;

  return cachedIcon(`stop:${major}:${active}`, () =>
    L.divIcon({
      className: 'routify-marker',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<span style="
      display:block;width:${size}px;height:${size}px;border-radius:50%;
      background:#fff;border:${major ? 3 : 2.5}px solid ${active ? 'var(--color-brand-600)' : 'var(--color-ink-3)'};
      box-shadow:0 1px 3px rgba(12,20,36,.2);
    "></span>`,
    }),
  );
}

function userIcon(accurate: boolean): L.DivIcon {
  return cachedIcon(`user:${accurate}`, () => buildUserIcon(accurate));
}

function buildUserIcon(accurate: boolean): L.DivIcon {
  return L.divIcon({
    className: 'routify-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="position:relative;width:22px;height:22px">
      <span style="position:absolute;inset:-6px;border-radius:50%;background:rgba(15,107,98,.14)"></span>
      <span style="
        position:absolute;inset:4px;border-radius:50%;
        background:var(--color-brand-600);border:2.5px solid #fff;
        box-shadow:0 1px 4px rgba(12,20,36,.3);
        ${accurate ? '' : 'opacity:.75;'}
      "></span>
    </div>`,
  });
}

/** Dropped-pin marker. Dragging a pin re-renders on every mouse move. */
function pinIcon(): L.DivIcon {
  return cachedIcon('pin', () =>
    L.divIcon({
      className: 'routify-marker',
      iconSize: [26, 34],
      iconAnchor: [13, 32],
      html: `<svg width="26" height="34" viewBox="0 0 26 34" fill="none">
              <path d="M13 33C13 33 25 21.6 25 13A12 12 0 1 0 1 13c0 8.6 12 20 12 20Z"
                fill="var(--color-brand-600)" stroke="#fff" stroke-width="2"/>
              <circle cx="13" cy="13" r="4.5" fill="#fff"/>
            </svg>`,
    }),
  );
}

/* ------------------------------ map helpers ------------------------------- */

function FitBounds({ points, padding = 44 }: { points: LatLng[]; padding?: number }) {
  const map = useMap();

  // Keyed on the actual extent rather than "length + first lat + last lng": two
  // different route shapes can share all three of those and then fail to refit.
  const key = points.length
    ? boundsOf(points, 0)
        .flat()
        .map((n) => n.toFixed(4))
        .join(',')
    : '';

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14, { animate: true });
    } else {
      map.fitBounds(boundsOf(points, 0.008), { padding: [padding, padding], animate: true });
    }
    // See `Recenter` — an in-flight fit must not outlive the map it is fitting.
    return () => cancelMapAnimation(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

/**
 * `recenterKey` lets a caller re-issue the *same* coordinates and still have the
 * map move — needed for a "centre on me" control, which must work again after the
 * user has panned away, even though the target position has not changed.
 */
function Recenter({
  center,
  zoom,
  recenterKey,
}: {
  center?: LatLng;
  zoom?: number;
  recenterKey?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], zoom ?? map.getZoom(), { animate: true });
    // An animated pan runs on its own frame loop. If the map is torn down while
    // one is still in flight — navigating away from a bus screen a moment after
    // it opened — the next frame reads `_leaflet_pos` off a pane Leaflet has
    // nulled. Cancel the frames on the way out.
    return () => cancelMapAnimation(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng, zoom, recenterKey]);
  return null;
}

/**
 * Cancel a pending pan or zoom animation, without disturbing the map.
 *
 * `Map.stop()` looks like the call for this and is emphatically not: alongside
 * cancelling the frames it also runs `setZoom(...)`, which on a map already
 * part-way through teardown reads a pane Leaflet has nulled and throws. Because
 * that happens synchronously inside an effect cleanup, React escalates it by
 * unmounting the whole tree — turning a tidy-up into a total app outage where
 * every later tap and the back button did nothing until a reload.
 *
 * `_stop()` cancels the frames and nothing else, which is all that was ever
 * wanted. Guarded and optional because teardown ordering is not ours to
 * guarantee, and a cancelled animation is moot once the map is going away.
 */
function cancelMapAnimation(map: L.Map): void {
  try {
    (map as unknown as { _stop?: () => void })._stop?.();
  } catch {
    // Nothing to salvage, and nothing worth escalating.
  }
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function PinPicker({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/* -------------------------------- surface --------------------------------- */

export interface TransitMapProps {
  buses?: LiveBus[];
  routes?: Route[];
  stops?: Stop[];
  activeStopId?: string;
  selectedBusId?: string;
  onSelectBus?: (busId: string) => void;
  onSelectStop?: (stopId: string) => void;
  userPosition?: LatLng;
  userAccurate?: boolean;
  center?: LatLng;
  zoom?: number;
  /** Bump to re-apply `center` even when the coordinates are unchanged. */
  recenterKey?: number;
  fitTo?: LatLng[];
  onPickPoint?: (p: LatLng) => void;
  pin?: LatLng;
  className?: string;
  interactive?: boolean;
}

export function TransitMap({
  buses = [],
  routes = [],
  stops = [],
  activeStopId,
  selectedBusId,
  onSelectBus,
  onSelectStop,
  userPosition,
  userAccurate = true,
  center,
  zoom,
  recenterKey,
  fitTo,
  onPickPoint,
  pin,
  className,
  interactive = true,
}: TransitMapProps) {
  const initialCenter = center ?? userPosition ?? { lat: 31.1048, lng: 77.1734 };

  // Callers routinely pass overlapping sets — several places in central Shimla
  // share one nearest stop, and a route can be listed once per vehicle. Dedupe
  // here so no caller has to remember to.
  const uniqueRoutes = useMemo(() => dedupe(routes, (r) => r.id), [routes]);
  const uniqueStops = useMemo(() => dedupe(stops, (s) => s.id), [stops]);
  const uniqueBuses = useMemo(() => dedupe(buses, (b) => b.bus.id), [buses]);

  const routeLines = useMemo(
    () =>
      uniqueRoutes.map((r) => ({
        id: r.id,
        positions: r.shape.map((p) => [p.lat, p.lng] as [number, number]),
      })),
    [uniqueRoutes],
  );

  return (
    <MapContainer
      center={[initialCenter.lat, initialCenter.lng]}
      zoom={zoom ?? 12}
      maxZoom={MAX_TILE_ZOOM}
      zoomControl={false}
      attributionControl
      scrollWheelZoom={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      className={className}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url={TILE_URL}
        attribution={TILE_ATTRIBUTION}
        maxZoom={MAX_TILE_ZOOM}
        className="routify-tiles"
        detectRetina
      />

      {/* route alignment: a wide soft casing under a crisp line reads clearly
          against both the basemap and the vehicle markers */}
      {routeLines.map((line) => (
        <Polyline
          key={`${line.id}-casing`}
          positions={line.positions}
          pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.85, lineCap: 'round' }}
        />
      ))}
      {routeLines.map((line) => (
        <Polyline
          key={line.id}
          positions={line.positions}
          pathOptions={{
            color: 'var(--color-brand-600)',
            weight: 3.5,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      ))}

      {uniqueStops.map((s) => (
        <Marker
          key={s.id}
          position={[s.position.lat, s.position.lng]}
          icon={stopIcon(s.kind, s.id === activeStopId)}
          eventHandlers={onSelectStop ? { click: () => onSelectStop(s.id) } : undefined}
          zIndexOffset={100}
        />
      ))}

      {uniqueBuses.map((b) => (
        <Marker
          key={b.bus.id}
          position={[b.live.position.lat, b.live.position.lng]}
          icon={busIcon(b, b.bus.id === selectedBusId)}
          eventHandlers={onSelectBus ? { click: () => onSelectBus(b.bus.id) } : undefined}
          zIndexOffset={b.bus.id === selectedBusId ? 900 : 500}
        />
      ))}

      {userPosition && (
        <Marker
          position={[userPosition.lat, userPosition.lng]}
          icon={userIcon(userAccurate)}
          zIndexOffset={1000}
        />
      )}

      {pin && <Marker position={[pin.lat, pin.lng]} icon={pinIcon()} zIndexOffset={1100} />}

      {fitTo && fitTo.length > 0 && <FitBounds points={fitTo} />}
      {center && <Recenter center={center} zoom={zoom} recenterKey={recenterKey} />}
      {onPickPoint && <PinPicker onPick={onPickPoint} />}
    </MapContainer>
  );
}
