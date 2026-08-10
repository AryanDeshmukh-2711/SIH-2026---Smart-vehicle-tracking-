import type { Bus } from '@/types';

/**
 * Fleet master. In production this is the transport department's vehicle
 * registry; fuel type, emission norm and year come from the RC record.
 *
 * The mix here is deliberately honest about the real HRTC fleet: a handful of
 * new electric and BS-VI buses alongside ageing BS-IV and BS-III stock. An app
 * that only ever shows clean buses is not telling anyone the truth.
 */
export const BUSES: Bus[] = [
  /* ---------------------------- R-42B Shimla → Manali --------------------- */
  {
    id: 'B-4021',
    registration: 'HP-01-4021',
    operator: 'HRTC',
    routeId: 'R-42B',
    category: 'express',
    fuel: 'electric',
    norm: 'zero-tailpipe',
    year: 2023,
    seats: 43,
    wheelchairAccessible: true,
    amenities: ['ac', 'usb-charging', 'luggage', 'cctv'],
    emissionDataEstimated: false,
  },
  {
    id: 'B-3312',
    registration: 'HP-01-3312',
    operator: 'HRTC',
    routeId: 'R-42B',
    category: 'express',
    fuel: 'diesel',
    norm: 'BS-VI',
    year: 2021,
    seats: 52,
    wheelchairAccessible: false,
    amenities: ['usb-charging', 'luggage', 'reclining'],
    emissionDataEstimated: false,
  },
  {
    id: 'B-2208',
    registration: 'HP-63-2208',
    operator: 'HRTC',
    routeId: 'R-42B',
    category: 'express',
    fuel: 'cng',
    norm: 'BS-VI',
    year: 2020,
    seats: 49,
    wheelchairAccessible: false,
    amenities: ['luggage', 'cctv'],
    emissionDataEstimated: false,
  },

  /* --------------------------- R-18A Shimla → Parwanoo -------------------- */
  {
    id: 'B-7734',
    registration: 'HP-11-7734',
    operator: 'HRTC',
    routeId: 'R-18A',
    category: 'ordinary',
    fuel: 'diesel',
    norm: 'BS-VI',
    year: 2022,
    seats: 45,
    wheelchairAccessible: true,
    amenities: ['usb-charging', 'cctv'],
    emissionDataEstimated: false,
  },
  {
    id: 'B-1187',
    registration: 'HP-52-1187',
    operator: 'HRTC',
    routeId: 'R-18A',
    category: 'ordinary',
    fuel: 'diesel',
    norm: 'BS-IV',
    year: 2015,
    seats: 45,
    wheelchairAccessible: false,
    amenities: ['luggage'],
    emissionDataEstimated: false,
  },
  {
    id: 'B-0456',
    registration: 'HP-52-0456',
    operator: 'Private (Sharma Travels)',
    routeId: 'R-18A',
    category: 'ordinary',
    fuel: 'diesel',
    norm: 'BS-III',
    year: 2011,
    seats: 42,
    wheelchairAccessible: false,
    amenities: [],
    // Operator never filed the emission record — inferred from year of manufacture.
    emissionDataEstimated: true,
  },

  /* --------------------------- R-07L Shimla → Narkanda -------------------- */
  {
    id: 'B-9012',
    registration: 'HP-01-9012',
    operator: 'HRTC',
    routeId: 'R-07L',
    category: 'local',
    fuel: 'electric',
    norm: 'zero-tailpipe',
    year: 2024,
    seats: 36,
    wheelchairAccessible: true,
    amenities: ['usb-charging', 'cctv'],
    emissionDataEstimated: false,
  },
  {
    id: 'B-5540',
    registration: 'HP-01-5540',
    operator: 'HRTC',
    routeId: 'R-07L',
    category: 'local',
    fuel: 'diesel',
    norm: 'BS-IV',
    year: 2016,
    seats: 40,
    wheelchairAccessible: false,
    amenities: ['luggage'],
    emissionDataEstimated: false,
  },

  /* ----------------------------- R-22C Shimla → Chail --------------------- */
  {
    id: 'B-3390',
    registration: 'HP-14-3390',
    operator: 'HRTC',
    routeId: 'R-22C',
    category: 'ordinary',
    fuel: 'diesel',
    norm: 'BS-VI',
    year: 2021,
    seats: 42,
    wheelchairAccessible: false,
    amenities: ['luggage', 'cctv'],
    emissionDataEstimated: false,
  },

  /* -------------------------- R-55D Shimla → McLeod Ganj ------------------ */
  {
    id: 'B-8801',
    registration: 'HP-02-8801',
    operator: 'HRTC Volvo',
    routeId: 'R-55D',
    category: 'volvo',
    fuel: 'diesel',
    norm: 'BS-VI',
    year: 2023,
    seats: 41,
    wheelchairAccessible: true,
    amenities: ['ac', 'usb-charging', 'wifi', 'luggage', 'reclining', 'cctv'],
    emissionDataEstimated: false,
  },
  {
    id: 'B-8815',
    registration: 'HP-02-8815',
    operator: 'HRTC Volvo',
    routeId: 'R-55D',
    category: 'volvo',
    fuel: 'hybrid',
    norm: 'BS-VI',
    year: 2024,
    seats: 41,
    wheelchairAccessible: true,
    amenities: ['ac', 'usb-charging', 'wifi', 'luggage', 'reclining', 'cctv'],
    emissionDataEstimated: false,
  },

  /* ----------------------------- R-64K Kullu → Manali --------------------- */
  {
    id: 'B-2265',
    registration: 'HP-34-2265',
    operator: 'HRTC',
    routeId: 'R-64K',
    category: 'ordinary',
    fuel: 'cng',
    norm: 'BS-VI',
    year: 2022,
    seats: 44,
    wheelchairAccessible: false,
    amenities: ['usb-charging', 'luggage'],
    emissionDataEstimated: false,
  },
  {
    id: 'B-1109',
    registration: 'HP-34-1109',
    operator: 'HRTC',
    routeId: 'R-64K',
    category: 'ordinary',
    fuel: 'diesel',
    norm: 'BS-IV',
    year: 2014,
    seats: 44,
    wheelchairAccessible: false,
    amenities: ['luggage'],
    emissionDataEstimated: false,
  },

  /* --------------------------- R-31M Manali → Solang ---------------------- */
  {
    id: 'B-6677',
    registration: 'HP-34-6677',
    operator: 'HRTC',
    routeId: 'R-31M',
    category: 'local',
    fuel: 'electric',
    norm: 'zero-tailpipe',
    year: 2023,
    seats: 32,
    wheelchairAccessible: true,
    amenities: ['usb-charging', 'cctv'],
    emissionDataEstimated: false,
  },

  /* --------------------------- R-12S Shimla City -------------------------- */
  {
    id: 'B-1220',
    registration: 'HP-01-1220',
    operator: 'HRTC City',
    routeId: 'R-12S',
    category: 'local',
    fuel: 'electric',
    norm: 'zero-tailpipe',
    year: 2024,
    seats: 28,
    wheelchairAccessible: true,
    amenities: ['usb-charging', 'cctv'],
    emissionDataEstimated: false,
  },
  {
    id: 'B-1235',
    registration: 'HP-01-1235',
    operator: 'HRTC City',
    routeId: 'R-12S',
    category: 'local',
    fuel: 'diesel',
    norm: 'BS-VI',
    year: 2020,
    seats: 32,
    wheelchairAccessible: false,
    amenities: ['cctv'],
    emissionDataEstimated: false,
  },
  {
    id: 'B-0987',
    registration: 'HP-01-0987',
    operator: 'HRTC City',
    routeId: 'R-12S',
    category: 'local',
    fuel: 'diesel',
    norm: 'BS-III',
    year: 2010,
    seats: 32,
    wheelchairAccessible: false,
    amenities: [],
    emissionDataEstimated: true,
  },
];

export const BUS_BY_ID = new Map(BUSES.map((b) => [b.id, b]));
export const BUS_BY_REGISTRATION = new Map(BUSES.map((b) => [b.registration.toUpperCase(), b]));

export function busById(id: string): Bus {
  const b = BUS_BY_ID.get(id);
  if (!b) throw new Error(`Unknown bus: ${id}`);
  return b;
}

export function busesOnRoute(routeId: string): Bus[] {
  return BUSES.filter((b) => b.routeId === routeId);
}
