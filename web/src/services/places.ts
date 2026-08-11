import type { LatLng, Place, PlaceCategory } from '@/types';
import { PLACES, PLACE_BY_ID } from '@/data/places';
import { STOP_BY_ID } from '@/data/stops';
import { haversineKm } from '@/lib/geo';
import { request } from './client';
import { departuresAt } from './live/queries';

export type ExploreFilter = 'popular' | PlaceCategory;

export const EXPLORE_FILTERS: Array<{ id: ExploreFilter; label: string }> = [
  { id: 'popular', label: 'Popular' },
  { id: 'nature', label: 'Nature' },
  { id: 'food', label: 'Food' },
  { id: 'culture', label: 'Culture' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'cafe', label: 'Cafés' },
  { id: 'viewpoint', label: 'Viewpoints' },
];

export function getPlaces(filter: ExploreFilter = 'popular', near?: LatLng): Promise<Place[]> {
  return request('/v1/places', () => {
    const pool = filter === 'popular' ? PLACES.slice() : PLACES.filter((p) => p.category === filter);

    if (near) {
      return pool.sort(
        (a, b) => haversineKm(near, a.position) - haversineKm(near, b.position),
      );
    }
    return pool.sort((a, b) => b.popularity - a.popularity);
  }, { cacheable: true });
}

export function getPlace(id: string): Promise<Place> {
  return request(`/v1/places/${id}`, () => {
    const p = PLACE_BY_ID.get(id);
    if (!p) throw new Error(`Place ${id} not found`);
    return p;
  }, { cacheable: true });
}

export function matchPlaces(query: string, limit = 6): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PLACES.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.town.toLowerCase().includes(q) ||
      p.tags.some((t) => t.includes(q)) ||
      p.category.includes(q),
  )
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

/**
 * Everything the "Get there by bus" panel needs: the alighting stop, the walk,
 * and the next live service towards it.
 */
export interface PlaceAccess {
  stopId: string;
  stopName: string;
  walkFromStopMin: number;
  distanceFromStopKm: number;
  nextService: {
    routeShortName: string;
    registration: string;
    etaMin: number;
    confidence: 'high' | 'medium' | 'low';
    fuel: string;
    headsign: string;
  } | null;
}

export function getPlaceAccess(placeId: string): Promise<PlaceAccess> {
  return request(`/v1/places/${placeId}/access`, () => {
    const place = PLACE_BY_ID.get(placeId);
    if (!place) throw new Error(`Place ${placeId} not found`);

    const stop = STOP_BY_ID.get(place.nearestStopId);
    const next = departuresAt(place.nearestStopId, 1)[0];

    return {
      stopId: place.nearestStopId,
      stopName: stop?.name ?? place.nearestStopId,
      walkFromStopMin: place.walkFromStopMin,
      distanceFromStopKm: stop
        ? Math.round(haversineKm(stop.position, place.position) * 100) / 100
        : 0,
      nextService: next
        ? {
            routeShortName: next.live.route.shortName,
            registration: next.live.bus.registration,
            etaMin: next.prediction.etaMin,
            confidence: next.prediction.confidence,
            fuel: next.live.bus.fuel,
            headsign: next.live.route.destination,
          }
        : null,
    };
  });
}

/** Other places worth pairing with this one — same town, reachable by bus. */
export function getNearbyPlaces(placeId: string, limit = 4): Promise<Place[]> {
  return request(`/v1/places/${placeId}/nearby`, () => {
    const place = PLACE_BY_ID.get(placeId);
    if (!place) return [];
    return PLACES.filter((p) => p.id !== place.id)
      .map((p) => ({ p, km: haversineKm(place.position, p.position) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, limit)
      .map((x) => x.p);
  }, { cacheable: true });
}
