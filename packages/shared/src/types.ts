/**
 * HimGati domain model.
 *
 * These types are deliberately shaped to be a thin, lossless projection of
 * GTFS + GTFS-Realtime so the mock service layer in `src/services` can later be
 * swapped for live feeds (HRTC/HPTDC APIs, AIS-140 VLTD streams, GTFS-RT
 * protobuf) without touching a single screen. See `src/services/adapters/gtfs.ts`
 * for the field-by-field mapping.
 */

/* ------------------------------ primitives ------------------------------- */

export type LatLng = { lat: number; lng: number };

/** ISO-8601 timestamp string. */
export type Timestamp = string;

/* -------------------------------- stops ---------------------------------- */

export type StopKind = 'isbt' | 'bus-stand' | 'stop' | 'halt';

/** GTFS `stops.txt` + HimGati's QR extension. */
export interface Stop {
  id: string; // GTFS stop_id — printed on the physical QR plate, e.g. HP-SML-001
  name: string;
  nameHi: string;
  kind: StopKind;
  town: string;
  position: LatLng;
  /** Human landmark used by the landmark-based location method. */
  landmarks: string[];
  /** Platform / bay labels where the stand has them. */
  platforms?: string[];
  amenities: Array<'shelter' | 'seating' | 'lighting' | 'ticket-counter' | 'restroom' | 'ramp'>;
  /** SMS short code — text `BUS <code>` to get the next 3 departures (SRS §8.6). */
  smsCode: string;
  routeIds: string[];
}

/* -------------------------------- routes --------------------------------- */

export type RouteCategory = 'ordinary' | 'express' | 'deluxe' | 'volvo' | 'local';

/** GTFS `routes.txt` + `shapes.txt`. */
export interface Route {
  id: string; // GTFS route_id
  shortName: string; // GTFS route_short_name, e.g. "42B"
  longName: string; // GTFS route_long_name, e.g. "Shimla → Manali"
  origin: string;
  destination: string;
  category: RouteCategory;
  operator: string;
  /** Ordered stop ids. */
  stopIds: string[];
  /** Ordered polyline approximating the road alignment (GTFS shapes.txt). */
  shape: LatLng[];
  /** Cumulative road distance to each stop, km. */
  distancesKm: number[];
  /** Scheduled departure times from the origin, "HH:mm", used as the offline timetable. */
  departures: string[];
  fareInr: number;
  typicalDurationMin: number;
}

/* ------------------------------- vehicles -------------------------------- */

export type FuelType = 'electric' | 'cng' | 'hybrid' | 'diesel';
export type EmissionNorm = 'BS-VI' | 'BS-IV' | 'BS-III' | 'zero-tailpipe';
export type Occupancy = 'empty' | 'comfortable' | 'full' | 'unknown';

/** Static fleet record — comes from the depot / transport department master. */
export interface Bus {
  id: string; // internal vehicle id
  registration: string; // HP-XX-1234, what a passenger actually reads on the bus
  operator: string;
  routeId: string;
  category: RouteCategory;
  fuel: FuelType;
  norm: EmissionNorm;
  /** Manufacturing year — drives the age component of the Green Score. */
  year: number;
  seats: number;
  wheelchairAccessible: boolean;
  amenities: Array<'ac' | 'usb-charging' | 'wifi' | 'luggage' | 'reclining' | 'cctv'>;
  /** True when fuel/norm came from a registry guess rather than a verified record. */
  emissionDataEstimated: boolean;
}

/* ------------------------------ live state ------------------------------- */

export type TripStatus = 'scheduled' | 'running' | 'delayed' | 'cancelled' | 'signal-lost' | 'ended';

/** ETA trustworthiness, derived purely from data freshness (SRS §8.3). */
export type Confidence = 'high' | 'medium' | 'low';

export interface StopPrediction {
  stopId: string;
  /** Point estimate, minutes from now. */
  etaMin: number;
  /** Lower/upper bound shown when confidence is not high. */
  rangeMin: [number, number];
  confidence: Confidence;
  /** Scheduled time for this stop, "HH:mm". */
  scheduled: string;
  distanceKm: number;
}

/** GTFS-RT `VehiclePosition` + `TripUpdate`, flattened. */
export interface VehiclePosition {
  busId: string;
  tripId: string;
  routeId: string;
  position: LatLng;
  /** Degrees clockwise from north. */
  bearing: number;
  speedKmph: number;
  /** When the vehicle actually reported — everything about trust hangs off this. */
  recordedAt: Timestamp;
  /** Seconds since `recordedAt`. Drives Confidence and the Signal Lost state. */
  ageSec: number;
  status: TripStatus;
  /** Minutes behind schedule; negative means running early. */
  delayMin: number;
  occupancy: Occupancy;
  /** Index into the route's stop list. */
  nextStopIndex: number;
  /** Distance covered along the route shape, km. */
  progressKm: number;
  predictions: StopPrediction[];
  /** Set while the bus is inside a known dead zone (SRS §8.5). */
  lastSeenStopName?: string;
}

/** What most cards need: the static bus, its route and its live state in one object. */
export interface LiveBus {
  bus: Bus;
  route: Route;
  live: VehiclePosition;
  greenScore: number;
}

/* ------------------------------- journeys -------------------------------- */

export type JourneyPreference = 'fastest' | 'cheapest' | 'fewest-transfers' | 'most-sustainable';

export interface JourneyLeg {
  kind: 'walk' | 'bus' | 'wait';
  /** Walk legs use free text ("Mall Road"), bus legs use stop names. */
  from: string;
  to: string;
  durationMin: number;
  distanceKm: number;
  routeId?: string;
  busId?: string;
  departure?: string;
  arrival?: string;
  stopsCount?: number;
}

export interface JourneyOption {
  id: string;
  legs: JourneyLeg[];
  departure: string;
  arrival: string;
  durationMin: number;
  fareInr: number;
  transfers: number;
  walkMin: number;
  co2SavedKg: number;
  greenScore: number;
  /** Which preference this option wins on, for the "Fastest"/"Greenest" chip. */
  badges: JourneyPreference[];
}

/* -------------------------------- places --------------------------------- */

export type PlaceCategory =
  | 'nature'
  | 'food'
  | 'culture'
  | 'adventure'
  | 'shopping'
  | 'cafe'
  | 'viewpoint'
  | 'stay';

export interface Place {
  id: string;
  name: string;
  town: string;
  category: PlaceCategory;
  /** Extra tags used by the Explore filter chips. */
  tags: string[];
  summary: string;
  description: string;
  position: LatLng;
  rating: number;
  reviewCount: number;
  /** "09:00–18:00" or "Open 24 hours". */
  hours: string;
  entryFeeInr: number | null;
  typicalVisitMin: number;
  /** Popularity 0–100, used for the "busy right now" hint. */
  popularity: number;
  /** Deterministic photo seed so the same place always renders the same artwork. */
  photoSeed: number;
  nearestStopId: string;
  walkFromStopMin: number;
}

/* -------------------------------- reviews -------------------------------- */

export interface RatingBreakdown {
  cleanliness: number;
  comfort: number;
  punctuality: number;
  safety: number;
}

export interface BusReview {
  id: string;
  busId: string;
  author: string;
  date: string;
  overall: number;
  breakdown: RatingBreakdown;
  comment: string;
  /** Journey the review was written against — keeps reviews structured, not social. */
  journey: string;
  helpfulCount: number;
}

/* -------------------------------- alerts --------------------------------- */

export type AlertSeverity = 'info' | 'warning' | 'severe';
export type AlertKind =
  | 'delay'
  | 'cancellation'
  | 'route-change'
  | 'road-closure'
  | 'weather'
  | 'stop-change'
  | 'arrival';

/** GTFS-RT `ServiceAlert`. */
export interface ServiceAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  affectedRouteIds: string[];
  affectedStopIds: string[];
  issuedAt: Timestamp;
  source: string;
  read: boolean;
}

/* --------------------------------- trips --------------------------------- */

export interface TripRecord {
  id: string;
  date: Timestamp;
  routeId: string;
  busId: string;
  registration: string;
  from: string;
  to: string;
  durationMin: number;
  distanceKm: number;
  fareInr: number;
  co2SavedKg: number;
  fuel: FuelType;
  reviewed: boolean;
}

/* --------------------------------- user ---------------------------------- */

export interface SavedPlace {
  id: string;
  label: string;
  icon: 'home' | 'work' | 'star';
  stopId: string;
}

export interface UserProfile {
  name: string;
  phone: string;
  since: string;
  language: 'en' | 'hi';
  travelMode: JourneyPreference;
  savedPlaces: SavedPlace[];
  savedRouteIds: string[];
  accessibility: {
    largeText: boolean;
    highContrast: boolean;
    stepFreeOnly: boolean;
    voiceAnnouncements: boolean;
  };
  notifications: {
    arrival: boolean;
    delays: boolean;
    disruptions: boolean;
    weather: boolean;
  };
  lowDataMode: boolean;
}

/* ------------------------------- location -------------------------------- */

/**
 * The six ways HimGati can establish "where the user is". GPS is only one of
 * them — in the hills it is frequently the worst one.
 */
export type LocationMethod = 'gps' | 'landmark' | 'map-pin' | 'stop-search' | 'qr' | 'route-number';

export interface ResolvedLocation {
  method: LocationMethod;
  label: string;
  position: LatLng;
  /** Metres of uncertainty — shown honestly rather than hidden. */
  accuracyM: number;
  stopId?: string;
  resolvedAt: Timestamp;
}

/* ------------------------------- offline --------------------------------- */

export interface OfflinePack {
  id: string;
  region: string;
  description: string;
  sizeMb: number;
  routes: number;
  stops: number;
  places: number;
  downloaded: boolean;
  lastSync?: Timestamp;
}

/* ------------------------------ itinerary -------------------------------- */

export type Interest = 'nature' | 'food' | 'culture' | 'shopping' | 'adventure' | 'cafe' | 'scenic';

export interface ItineraryStop {
  place: Place;
  arrive: string;
  depart: string;
  /** How the traveller gets here from the previous stop. */
  transfer?: {
    mode: 'bus' | 'walk';
    routeShortName?: string;
    durationMin: number;
    note: string;
  };
}

export interface Itinerary {
  id: string;
  title: string;
  baseTown: string;
  totalMinutes: number;
  stops: ItineraryStop[];
  busLegs: number;
  walkMin: number;
  /** Total ground covered between stops, km — the basis for the CO₂ comparison. */
  distanceKm: number;
  estimatedCostInr: number;
  co2SavedKg: number;
}
