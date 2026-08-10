import type { LatLng, Route, RouteCategory } from '@/types';
import { cumulativeDistances, haversineKm } from '@/lib/geo';
import { STOP_BY_ID, STOPS } from './stops';

/**
 * Route definitions for eight real HRTC/HPTDC corridors.
 *
 * `shape` is a coarse polyline that follows the road alignment closely enough to
 * draw and to animate a vehicle along. Because a coarse polyline always
 * *under*-measures a hill road, each route also carries its published
 * `roadDistanceKm`; per-stop distances are the polyline progress rescaled to
 * that figure. When a real GTFS `shapes.txt` is wired in, the rescaling drops
 * out and the same `distancesKm` array is produced directly.
 */

interface RouteSeed {
  id: string;
  shortName: string;
  longName: string;
  origin: string;
  destination: string;
  category: RouteCategory;
  operator: string;
  stopIds: string[];
  shape: LatLng[];
  /** Published road distance, km. */
  roadDistanceKm: number;
  typicalDurationMin: number;
  fareInr: number;
  departures: string[];
}

const p = (lat: number, lng: number): LatLng => ({ lat, lng });

const SEEDS: RouteSeed[] = [
  {
    id: 'R-42B',
    shortName: '42B',
    longName: 'Shimla → Manali',
    origin: 'Shimla',
    destination: 'Manali',
    category: 'express',
    operator: 'HRTC',
    stopIds: ['HP-SML-001', 'HP-BLS-001', 'HP-SDN-001', 'HP-MND-001', 'HP-BTR-001', 'HP-KLU-001', 'HP-MNL-001'],
    shape: [
      p(31.0996, 77.15),
      p(31.0712, 77.0942),
      p(31.1183, 76.9698),
      p(31.2135, 76.8842),
      p(31.2861, 76.8036),
      p(31.33, 76.75),
      p(31.3922, 76.7871),
      p(31.4571, 76.8419),
      p(31.53, 76.9),
      p(31.5983, 76.9174),
      p(31.6612, 76.9243),
      p(31.708, 76.932),
      p(31.6739, 77.0093),
      p(31.7016, 77.0741),
      p(31.7871, 77.1223),
      p(31.8412, 77.1416),
      p(31.876, 77.154),
      p(31.9192, 77.1211),
      p(31.9578, 77.1092),
      p(32.0361, 77.1387),
      p(32.118, 77.172),
      p(32.1834, 77.1791),
      p(32.2396, 77.1887),
    ],
    roadDistanceKm: 250,
    typicalDurationMin: 465,
    fareInr: 610,
    departures: ['05:30', '07:00', '08:15', '10:30', '13:00', '16:45', '20:30', '22:00'],
  },
  {
    id: 'R-18A',
    shortName: '18A',
    longName: 'Shimla → Parwanoo',
    origin: 'Shimla',
    destination: 'Parwanoo',
    category: 'ordinary',
    operator: 'HRTC',
    stopIds: ['HP-SML-001', 'HP-KDG-001', 'HP-SOL-001', 'HP-PRW-001'],
    shape: [
      p(31.0996, 77.15),
      p(31.0684, 77.1266),
      p(31.0311, 77.1187),
      p(30.98, 77.12),
      p(30.9482, 77.1094),
      p(30.9045, 77.0967),
      p(30.8776, 77.0542),
      p(30.8621, 77.0184),
      p(30.837, 76.961),
    ],
    roadDistanceKm: 82,
    typicalDurationMin: 190,
    fareInr: 145,
    departures: [
      '06:00', '06:45', '07:30', '08:10', '09:00', '10:15', '11:30', '12:45',
      '14:00', '15:20', '16:30', '17:45', '19:00', '20:30',
    ],
  },
  {
    id: 'R-07L',
    shortName: '07L',
    longName: 'Shimla → Narkanda',
    origin: 'Shimla',
    destination: 'Narkanda',
    category: 'local',
    operator: 'HRTC',
    stopIds: ['HP-SML-001', 'HP-SML-002', 'HP-SML-004', 'HP-SML-006', 'HP-KFR-001', 'HP-THG-001', 'HP-NRK-001'],
    shape: [
      p(31.0996, 77.15),
      p(31.1035, 77.168),
      p(31.109, 77.193),
      p(31.12, 77.2),
      p(31.1084, 77.2331),
      p(31.0975, 77.2666),
      p(31.1042, 77.3061),
      p(31.123, 77.354),
      p(31.1712, 77.4021),
      p(31.2154, 77.4383),
      p(31.254, 77.46),
    ],
    roadDistanceKm: 65,
    typicalDurationMin: 150,
    fareInr: 110,
    departures: ['06:20', '07:40', '09:10', '10:40', '12:15', '14:00', '15:40', '17:10', '18:40'],
  },
  {
    id: 'R-22C',
    shortName: '22C',
    longName: 'Shimla → Chail',
    origin: 'Shimla',
    destination: 'Chail',
    category: 'ordinary',
    operator: 'HRTC',
    stopIds: ['HP-SML-001', 'HP-KDG-001', 'HP-CHL-001'],
    shape: [
      p(31.0996, 77.15),
      p(31.0684, 77.1266),
      p(31.0311, 77.1187),
      p(30.98, 77.12),
      p(30.9531, 77.1408),
      p(30.9412, 77.1683),
      p(30.9679, 77.195),
    ],
    roadDistanceKm: 45,
    typicalDurationMin: 105,
    fareInr: 80,
    departures: ['07:15', '09:30', '11:45', '14:15', '16:30', '18:15'],
  },
  {
    id: 'R-55D',
    shortName: '55D',
    longName: 'Shimla → McLeod Ganj',
    origin: 'Shimla',
    destination: 'McLeod Ganj',
    category: 'volvo',
    operator: 'HRTC Volvo',
    stopIds: ['HP-SML-001', 'HP-BLS-001', 'HP-HMR-001', 'HP-PLM-001', 'HP-DHR-001', 'HP-MCL-001'],
    shape: [
      p(31.0996, 77.15),
      p(31.0712, 77.0942),
      p(31.1183, 76.9698),
      p(31.2135, 76.8842),
      p(31.33, 76.75),
      p(31.4386, 76.7081),
      p(31.5624, 76.6203),
      p(31.686, 76.52),
      p(31.8231, 76.5641),
      p(31.9412, 76.6318),
      p(32.0491, 76.6103),
      p(32.11, 76.536),
      p(32.1682, 76.4231),
      p(32.219, 76.3234),
      p(32.24, 76.32),
    ],
    roadDistanceKm: 250,
    typicalDurationMin: 480,
    fareInr: 1180,
    departures: ['06:30', '09:00', '20:15', '21:30'],
  },
  {
    id: 'R-64K',
    shortName: '64K',
    longName: 'Kullu → Manali',
    origin: 'Kullu',
    destination: 'Manali',
    category: 'ordinary',
    operator: 'HRTC',
    stopIds: ['HP-KLU-001', 'HP-BTR-001', 'HP-NGR-001', 'HP-MNL-001'],
    shape: [
      p(31.9578, 77.1092),
      p(31.9192, 77.1211),
      p(31.876, 77.154),
      p(31.9426, 77.1284),
      p(32.0361, 77.1387),
      p(32.118, 77.172),
      p(32.1834, 77.1791),
      p(32.2396, 77.1887),
    ],
    roadDistanceKm: 52,
    typicalDurationMin: 95,
    fareInr: 70,
    departures: [
      '06:00', '06:40', '07:20', '08:00', '08:45', '09:30', '10:20', '11:10',
      '12:00', '13:15', '14:30', '15:45', '17:00', '18:20', '19:40',
    ],
  },
  {
    id: 'R-31M',
    shortName: '31M',
    longName: 'Manali → Solang Valley',
    origin: 'Manali',
    destination: 'Solang Valley',
    category: 'local',
    operator: 'HRTC',
    stopIds: ['HP-MNL-001', 'HP-VSH-001', 'HP-SLG-001'],
    shape: [
      p(32.2396, 77.1887),
      p(32.2521, 77.1893),
      p(32.264, 77.1875),
      p(32.2891, 77.1704),
      p(32.317, 77.156),
    ],
    roadDistanceKm: 14,
    typicalDurationMin: 40,
    fareInr: 40,
    departures: [
      '07:30', '08:15', '09:00', '09:45', '10:30', '11:15', '12:00', '13:00',
      '14:00', '15:00', '16:00', '17:00',
    ],
  },
  {
    id: 'R-12S',
    shortName: '12S',
    longName: 'Shimla City Circular',
    origin: 'Shimla ISBT',
    destination: 'Sanjauli',
    category: 'local',
    operator: 'HRTC City',
    stopIds: ['HP-SML-001', 'HP-SML-002', 'HP-SML-003', 'HP-SML-005', 'HP-SML-004'],
    shape: [
      p(31.0996, 77.15),
      p(31.1021, 77.1601),
      p(31.1035, 77.168),
      p(31.104, 77.1725),
      p(31.0981, 77.1782),
      p(31.093, 77.183),
      p(31.1004, 77.1901),
      p(31.109, 77.193),
    ],
    roadDistanceKm: 11,
    typicalDurationMin: 35,
    fareInr: 20,
    departures: [
      '06:00', '06:20', '06:40', '07:00', '07:20', '07:40', '08:00', '08:20',
      '08:40', '09:00', '09:30', '10:00', '10:30', '11:00', '12:00', '13:00',
      '14:00', '15:00', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
      '19:00', '20:00', '21:00',
    ],
  },
];

/** Cumulative polyline distance at the point nearest to `target`. */
function projectOnShape(shape: LatLng[], cum: number[], target: LatLng): number {
  let bestKm = Infinity;
  let bestDist = 0;

  for (let i = 1; i < shape.length; i++) {
    const a = shape[i - 1];
    const b = shape[i];
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((target.lng - a.lng) * dx + (target.lat - a.lat) * dy) / lenSq));
    const cand = { lat: a.lat + dy * t, lng: a.lng + dx * t };
    const km = haversineKm(target, cand);
    if (km < bestKm) {
      bestKm = km;
      bestDist = cum[i - 1] + (cum[i] - cum[i - 1]) * t;
    }
  }

  return bestDist;
}

function buildRoute(seed: RouteSeed): Route {
  const cum = cumulativeDistances(seed.shape);
  const shapeTotal = cum[cum.length - 1];
  const scale = shapeTotal === 0 ? 1 : seed.roadDistanceKm / shapeTotal;

  const distancesKm = seed.stopIds.map((id, i) => {
    const stop = STOP_BY_ID.get(id);
    if (!stop) throw new Error(`Route ${seed.id} references unknown stop ${id}`);
    if (i === 0) return 0;
    if (i === seed.stopIds.length - 1) return Math.round(seed.roadDistanceKm * 10) / 10;
    return Math.round(projectOnShape(seed.shape, cum, stop.position) * scale * 10) / 10;
  });

  // Guarantee monotonic distances even where a coarse shape doubles back.
  for (let i = 1; i < distancesKm.length; i++) {
    if (distancesKm[i] <= distancesKm[i - 1]) {
      distancesKm[i] = Math.round((distancesKm[i - 1] + 0.5) * 10) / 10;
    }
  }

  const { roadDistanceKm: _roadDistanceKm, ...rest } = seed;
  return { ...rest, distancesKm };
}

export const ROUTES: Route[] = SEEDS.map(buildRoute);

export const ROUTE_BY_ID = new Map(ROUTES.map((r) => [r.id, r]));

/** Routes that call at a stop, derived from the route table so the two never drift. */
const ROUTES_BY_STOP = new Map<string, string[]>(STOPS.map((s) => [s.id, [] as string[]]));
for (const r of ROUTES) {
  for (const sid of r.stopIds) ROUTES_BY_STOP.get(sid)?.push(r.id);
}

export function routesServingStop(stopId: string): Route[] {
  return (ROUTES_BY_STOP.get(stopId) ?? []).map((id) => ROUTE_BY_ID.get(id)!).filter(Boolean);
}

export function routeById(id: string): Route {
  const r = ROUTE_BY_ID.get(id);
  if (!r) throw new Error(`Unknown route: ${id}`);
  return r;
}

/** Total road distance of a route, km. */
export function routeDistanceKm(route: Route): number {
  return route.distancesKm[route.distancesKm.length - 1];
}

/** Cumulative polyline distances, memoised — the simulator hits this every tick. */
const cumCache = new Map<string, number[]>();

export function routeCumulative(route: Route): number[] {
  let c = cumCache.get(route.id);
  if (!c) {
    c = cumulativeDistances(route.shape);
    cumCache.set(route.id, c);
  }
  return c;
}

/**
 * Convert a road-distance figure into the equivalent distance along the drawn
 * polyline, so markers sit in the right place despite the rescaling above.
 */
export function roadKmToShapeKm(route: Route, roadKm: number): number {
  const cum = routeCumulative(route);
  const shapeTotal = cum[cum.length - 1];
  const roadTotal = routeDistanceKm(route);
  return roadTotal === 0 ? 0 : (roadKm / roadTotal) * shapeTotal;
}
