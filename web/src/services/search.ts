/**
 * Global search.
 *
 * Two jobs. First, a grouped lookup across stops, routes, vehicles and places.
 * Second — and this is what the brief asks for — recognising when a query is
 * actually a *journey request* in plain language and converting it into a
 * planner intent instead of returning a list of loosely matching nouns.
 */

import type { LiveBus, Place, Route, Stop } from '@/types';
import { matchRoutes, matchStops } from './transit';
import { matchPlaces } from './places';
import { matchVehicles as matchLiveVehicles } from './live/queries';
import { STOPS } from '@/data/stops';
import { request } from './client';

export interface SearchResults {
  query: string;
  intent: JourneyIntent | null;
  stops: Stop[];
  routes: Route[];
  vehicles: LiveBus[];
  places: Place[];
  isEmpty: boolean;
}

/* --------------------------- natural language ----------------------------- */

export interface JourneyIntent {
  fromStopId: string | null;
  toStopId: string | null;
  fromLabel: string;
  toLabel: string;
  /** Parsed departure window, if the query mentioned one. */
  when: { day: 'today' | 'tomorrow'; part: 'morning' | 'afternoon' | 'evening' | 'night' | null };
  /** Human echo of what we understood, shown back so the user can correct it. */
  restated: string;
}

const DAY_WORDS: Array<[RegExp, 'today' | 'tomorrow']> = [
  [/\btomorrow\b|\bkal\b/i, 'tomorrow'],
  [/\btoday\b|\baaj\b|\bnow\b|\btonight\b/i, 'today'],
];

const PART_WORDS: Array<[RegExp, 'morning' | 'afternoon' | 'evening' | 'night']> = [
  [/\bmorning\b|\bsubah\b|\bearly\b/i, 'morning'],
  [/\bafternoon\b|\bdopahar\b/i, 'afternoon'],
  [/\bevening\b|\bshaam\b/i, 'evening'],
  [/\bnight\b|\braat\b|\bovernight\b/i, 'night'],
];

/** Resolve a place name to the stop a passenger would actually use. */
function resolveStop(text: string): { stop: Stop | null; label: string } {
  const label = text.trim().replace(/\s+/g, ' ');
  if (!label) return { stop: null, label };

  const exact = matchStops(label, 1)[0];
  if (exact) return { stop: exact, label };

  // Fall back to the main stand of a town, so "Manali" finds Manali Bus Stand.
  const lower = label.toLowerCase();
  const townStand =
    STOPS.find((s) => s.town.toLowerCase() === lower && (s.kind === 'isbt' || s.kind === 'bus-stand')) ??
    STOPS.find((s) => s.town.toLowerCase().includes(lower));

  return { stop: townStand ?? null, label };
}

/**
 * Parse "bus from Shimla to Manali tomorrow morning" and its shorter cousins
 * ("shimla to manali", "shimla → manali").
 */
export function parseJourneyQuery(query: string): JourneyIntent | null {
  const q = query.trim();
  if (!q) return null;

  const pattern =
    /(?:bus|buses|travel|go|going|get)?\s*(?:from\s+)?(.+?)\s+(?:to|→|->|se|tak)\s+(.+?)\s*$/i;
  const m = q.match(pattern);
  if (!m) return null;

  let [, rawFrom, rawTo] = m;

  // Strip trailing time words off the destination.
  let day: 'today' | 'tomorrow' = 'today';
  let part: JourneyIntent['when']['part'] = null;

  for (const [re, value] of DAY_WORDS) {
    if (re.test(rawTo)) {
      day = value;
      rawTo = rawTo.replace(re, '');
    }
  }
  for (const [re, value] of PART_WORDS) {
    if (re.test(rawTo)) {
      part = value;
      rawTo = rawTo.replace(re, '');
    }
  }

  rawFrom = rawFrom.replace(/^(bus|buses|travel|go|going|get)\s+/i, '').trim();
  rawTo = rawTo.replace(/[,.]$/, '').trim();

  if (!rawFrom || !rawTo) return null;

  const from = resolveStop(rawFrom);
  const to = resolveStop(rawTo);
  if (!from.stop && !to.stop) return null;

  const whenText = part ? `${day} ${part}` : day === 'tomorrow' ? 'tomorrow' : 'now';

  return {
    fromStopId: from.stop?.id ?? null,
    toStopId: to.stop?.id ?? null,
    fromLabel: from.stop?.name ?? from.label,
    toLabel: to.stop?.name ?? to.label,
    when: { day, part },
    restated: `Buses from ${from.stop?.name ?? from.label} to ${to.stop?.name ?? to.label}, ${whenText}`,
  };
}

/* ------------------------------ vehicle match ----------------------------- */

function matchVehicles(query: string, limit = 4): LiveBus[] {
  return matchLiveVehicles(query, limit);
}

/* -------------------------------- entry ---------------------------------- */

export function search(query: string): Promise<SearchResults> {
  return request('/v1/search', () => {
    const q = query.trim();
    if (!q) {
      return { query, intent: null, stops: [], routes: [], vehicles: [], places: [], isEmpty: true };
    }

    const intent = parseJourneyQuery(q);
    const stops = matchStops(q, 5);
    const routes = matchRoutes(q, 4);
    const vehicles = matchVehicles(q, 4);
    const places = matchPlaces(q, 6);

    return {
      query: q,
      intent,
      stops,
      routes,
      vehicles,
      places,
      isEmpty: !intent && stops.length + routes.length + vehicles.length + places.length === 0,
    };
  });
}

/** Suggestions shown before the user has typed anything. */
export const SEARCH_EXAMPLES = [
  'Bus from Shimla to Manali tomorrow morning',
  'Route 42B',
  'HP-01-4021',
  'Mall Road',
  'Shimla ISBT',
];

export const RECENT_SEARCHES = [
  { label: 'Shimla ISBT → Solan', kind: 'journey' as const },
  { label: 'Route 07L', kind: 'route' as const },
  { label: 'Hadimba Devi Temple', kind: 'place' as const },
  { label: 'Victory Tunnel', kind: 'stop' as const },
];
