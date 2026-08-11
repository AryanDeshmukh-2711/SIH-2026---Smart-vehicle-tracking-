/**
 * Smart itinerary generation.
 *
 * The differentiator here is the constraint: every hop must be doable on public
 * transport or on foot. A recommendation engine that ignores how a traveller
 * physically gets between two points produces plans nobody can follow, so the
 * generator prices in bus frequency and walk time before it accepts a stop.
 */

import type { Interest, Itinerary, ItineraryStop, LatLng, Place } from '@/types';
import { PLACES } from '@/data/places';
import { STOP_BY_ID } from '@/data/stops';
import { routesServingStop } from '@/data/routes';
import { haversineKm, walkMinutes } from '@/lib/geo';
import { addMinutes, hhmm24 } from '@/lib/format';
import { EMISSION_FACTORS, co2SavedKg } from '@/lib/green';
import { request } from './client';

export const INTERESTS: Array<{ id: Interest; label: string; icon: string }> = [
  { id: 'nature', label: 'Nature', icon: 'mountain' },
  { id: 'food', label: 'Food', icon: 'utensils' },
  { id: 'culture', label: 'Culture', icon: 'landmark' },
  { id: 'shopping', label: 'Shopping', icon: 'bag' },
  { id: 'adventure', label: 'Adventure', icon: 'boot' },
  { id: 'cafe', label: 'Cafés', icon: 'coffee' },
  { id: 'scenic', label: 'Scenic spots', icon: 'camera' },
];

export const DURATIONS = [
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: 'Half day' },
  { minutes: 480, label: 'Full day' },
] as const;

export const BASE_TOWNS = ['Shimla', 'Manali', 'McLeod Ganj', 'Kullu', 'Mandi'];

/** Which place categories each interest pulls in. */
const INTEREST_MATCH: Record<Interest, (p: Place) => boolean> = {
  nature: (p) => p.category === 'nature',
  food: (p) => p.category === 'food',
  culture: (p) => p.category === 'culture',
  shopping: (p) => p.category === 'shopping',
  adventure: (p) => p.category === 'adventure',
  cafe: (p) => p.category === 'cafe',
  scenic: (p) => p.category === 'viewpoint' || p.tags.includes('view') || p.tags.includes('photography'),
};

export interface ItineraryRequest {
  baseTown: string;
  interests: Interest[];
  minutes: number;
  startAt?: Date;
  origin?: LatLng;
}

/** Bus or walk between two places, judged on distance and service frequency. */
function transferBetween(from: Place, to: Place) {
  const km = haversineKm(from.position, to.position);

  if (km < 1.4) {
    return {
      mode: 'walk' as const,
      durationMin: Math.max(5, walkMinutes(km)),
      note: `${walkMinutes(km)} min walk`,
    };
  }

  const toStop = STOP_BY_ID.get(to.nearestStopId);
  const routes = routesServingStop(to.nearestStopId);
  const shared = routes.find((r) => r.stopIds.includes(from.nearestStopId));

  if (shared) {
    const a = shared.distancesKm[shared.stopIds.indexOf(from.nearestStopId)];
    const b = shared.distancesKm[shared.stopIds.indexOf(to.nearestStopId)];
    const rideMin = Math.round(
      (Math.abs(b - a) / shared.distancesKm[shared.distancesKm.length - 1]) *
        shared.typicalDurationMin,
    );
    const headway = Math.round(720 / Math.max(1, shared.departures.length));
    return {
      mode: 'bus' as const,
      routeShortName: shared.shortName,
      durationMin: rideMin + Math.min(20, headway) + to.walkFromStopMin + from.walkFromStopMin,
      note: `Route ${shared.shortName} to ${toStop?.name.split(',')[0] ?? 'stop'}, then ${to.walkFromStopMin} min walk`,
    };
  }

  const routeVia = routes[0];
  return {
    mode: 'bus' as const,
    routeShortName: routeVia?.shortName,
    durationMin: Math.round(km * 3) + to.walkFromStopMin + 12,
    note: `Local service towards ${to.town}, then ${to.walkFromStopMin} min walk`,
  };
}

export function generateItinerary(req: ItineraryRequest): Promise<Itinerary> {
  return request('/v1/itineraries/generate', () => {
    const start = req.startAt ?? new Date();
    const interests = req.interests.length > 0 ? req.interests : (['culture', 'scenic'] as Interest[]);

    // Only places in the chosen base town, so nothing needs an overnight leg.
    const pool = PLACES.filter((p) => {
      const sameArea =
        p.town === req.baseTown ||
        (req.baseTown === 'Shimla' && ['Kufri', 'Chail'].includes(p.town)) ||
        (req.baseTown === 'Manali' && ['Solang', 'Naggar'].includes(p.town)) ||
        (req.baseTown === 'McLeod Ganj' && p.town === 'Dharamshala');
      return sameArea && interests.some((i) => INTEREST_MATCH[i](p));
    });

    const ranked = pool
      .slice()
      .sort((a, b) => {
        // Prefer places that fit the time budget and are close to a bus stop.
        const fit = (p: Place) => p.popularity - p.walkFromStopMin * 1.5 - (p.typicalVisitMin > req.minutes ? 60 : 0);
        return fit(b) - fit(a);
      });

    const stops: ItineraryStop[] = [];
    let cursor = new Date(start);
    let used = 0;
    let busLegs = 0;
    let walkMin = 0;
    let cost = 0;
    let co2 = 0;
    let distanceKm = 0;
    let previous: Place | undefined;

    for (const place of ranked) {
      const transfer = previous ? transferBetween(previous, place) : undefined;
      const transferMin = transfer?.durationMin ?? 0;

      // Trim a long visit down rather than dropping the place entirely.
      const visitMin = Math.min(place.typicalVisitMin, Math.max(30, req.minutes / 3));
      if (used + transferMin + visitMin > req.minutes) continue;

      if (transfer && previous) {
        cursor = addMinutes(cursor, transfer.durationMin);
        used += transfer.durationMin;

        // The comparison is against doing the same day by private taxi, so every
        // hop counts — including the walked ones, where the avoided emission is
        // the full car figure because walking emits nothing at all.
        const km = haversineKm(previous.position, place.position);
        distanceKm += km;

        if (transfer.mode === 'bus') {
          busLegs++;
          cost += 30;
          co2 += co2SavedKg('diesel', km);
        } else {
          walkMin += transfer.durationMin;
          co2 += EMISSION_FACTORS.carPetrolSolo * km;
        }
      }

      const arrive = new Date(cursor);
      cursor = addMinutes(cursor, visitMin);
      used += visitMin;
      cost += place.entryFeeInr ?? 0;

      stops.push({
        place,
        arrive: hhmm24(arrive),
        depart: hhmm24(cursor),
        transfer: transfer
          ? {
              mode: transfer.mode,
              routeShortName: 'routeShortName' in transfer ? transfer.routeShortName : undefined,
              durationMin: transfer.durationMin,
              note: transfer.note,
            }
          : undefined,
      });

      previous = place;
      if (stops.length >= 5) break;
    }

    const hours = Math.round(req.minutes / 60);
    return {
      id: `IT-${Date.now()}`,
      title: `Your ${hours}-hour ${req.baseTown} plan`,
      baseTown: req.baseTown,
      totalMinutes: used,
      stops,
      busLegs,
      walkMin,
      distanceKm: Math.round(distanceKm * 10) / 10,
      estimatedCostInr: cost,
      co2SavedKg: Math.round(co2 * 100) / 100,
    };
  });
}
