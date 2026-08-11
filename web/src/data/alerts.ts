import type { OfflinePack, UserProfile } from '@/types';

/**
 * Service alerts moved to `@himgati/shared/data` so the API can seed them and
 * serve them from the database. Offline packs and the demo user profile stay
 * here: both are client-side concerns with no server representation yet.
 */
export { ALERTS } from '@himgati/shared/data';

/* ------------------------------ offline packs ----------------------------- */

const syncedAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/**
 * Downloadable regional bundles: routes, stops, timetables, place records and a
 * basemap tile pack. Sizes are what these datasets actually weigh once packed.
 */
export const OFFLINE_PACKS: OfflinePack[] = [
  {
    id: 'PK-SML',
    region: 'Shimla district',
    description: 'Shimla city, Kufri, Theog, Narkanda, Kandaghat, Chail',
    sizeMb: 8.4,
    routes: 4,
    stops: 11,
    places: 12,
    downloaded: true,
    lastSync: syncedAgo(12),
  },
  {
    id: 'PK-KLU',
    region: 'Kullu & Manali',
    description: 'Kullu, Bhuntar, Naggar, Manali, Vashisht, Solang',
    sizeMb: 6.1,
    routes: 3,
    stops: 6,
    places: 7,
    downloaded: true,
    lastSync: syncedAgo(1580),
  },
  {
    id: 'PK-MND',
    region: 'Mandi & Bilaspur',
    description: 'Mandi, Sundernagar, Bilaspur and the NH-3 corridor',
    sizeMb: 4.7,
    routes: 2,
    stops: 3,
    places: 2,
    downloaded: false,
  },
  {
    id: 'PK-KGR',
    region: 'Kangra & Dharamshala',
    description: 'Dharamshala, McLeod Ganj, Palampur, Hamirpur',
    sizeMb: 7.3,
    routes: 1,
    stops: 4,
    places: 5,
    downloaded: false,
  },
  {
    id: 'PK-STATE',
    region: 'Himachal Pradesh — statewide timetable',
    description: 'Printed timetable for every HRTC route. No maps, no live data.',
    sizeMb: 2.2,
    routes: 8,
    stops: 26,
    places: 0,
    downloaded: false,
  },
];

/* --------------------------------- user ---------------------------------- */

export const USER: UserProfile = {
  name: 'Aryan Deshmukh',
  phone: '+91 98••• ••210',
  since: '2026-03-14',
  language: 'en',
  travelMode: 'fastest',
  savedPlaces: [
    { id: 'SP-1', label: 'Home', icon: 'home', stopId: 'HP-SML-004' },
    { id: 'SP-2', label: 'Office', icon: 'work', stopId: 'HP-SML-005' },
    { id: 'SP-3', label: 'Kufri weekend', icon: 'star', stopId: 'HP-KFR-001' },
  ],
  savedRouteIds: ['R-18A', 'R-12S', 'R-42B'],
  accessibility: {
    largeText: false,
    highContrast: false,
    stepFreeOnly: false,
    voiceAnnouncements: false,
  },
  notifications: { arrival: true, delays: true, disruptions: true, weather: true },
  lowDataMode: false,
};
