/**
 * Transport seam.
 *
 * Every service function in this folder goes through `request()`, which decides
 * where an answer comes from. The split is deliberate:
 *
 *   • Static reference data — stops, routes, fares, timetables — ships inside
 *     the app. It is the GTFS bundle, it changes at most nightly, and a PWA on a
 *     hill road with no signal must still be able to draw a route and read a
 *     timetable. Fetching it would trade the offline guarantee for nothing.
 *   • Anything that changes while the app is open — service alerts today — is
 *     marked `remote` and read from the API, because the bundled copy is a
 *     snapshot taken at build time and would be wrong the moment a depot
 *     publishes a disruption.
 *
 * A remote call that fails falls back to the bundled copy rather than surfacing
 * an error. In this region an unreachable server is a normal operating
 * condition, and yesterday's alert list is more use than an empty screen.
 *
 * The upstreams this is designed to accept, per SRS §11 and the brief:
 *   • GTFS static (routes, stops, timetables) — nightly bundle
 *   • GTFS-Realtime (VehiclePosition, TripUpdate, ServiceAlert) — protobuf/WS
 *   • AIS-140 VLTD streams over MQTT — raw device telemetry
 *   • HRTC / HPTDC operator APIs — fleet master, fares, cancellations
 *   • HP tourism dataset — places
 *   • Crowd reports — occupancy and quality signals
 */

export type ClientMode = 'mock' | 'http';

export interface ClientConfig {
  mode: ClientMode;
  baseUrl: string;
  /** Artificial latency for the mock transport, ms. Keeps loading states honest. */
  latencyMs: [number, number];
  /** 0–1. Injects failures so error states can be exercised in a demo. */
  failureRate: number;
  /** Simulates a dropped connection for the offline-mode walkthrough. */
  offline: boolean;
}

export const client: ClientConfig = {
  mode: (import.meta.env.VITE_API_MODE as ClientMode) ?? 'mock',
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  latencyMs: [140, 380],
  failureRate: 0,
  offline: false,
};

/**
 * Service paths are written as `/v1/...` because that is the contract; the API
 * mounts that router under `/api`, which the dev server and Nginx both proxy.
 */
const API_PREFIX = '/api';

export class NetworkError extends Error {
  constructor(message = 'Network unavailable') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class OfflineError extends Error {
  /** Age of the cached copy being served instead, in minutes. */
  constructor(
    message = 'You are offline',
    public cachedAgeMin: number | null = null,
  ) {
    super(message);
    this.name = 'OfflineError';
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function randomLatency(): number {
  const [lo, hi] = client.latencyMs;
  return lo + Math.random() * (hi - lo);
}

/** The API answers `{ data, error }` on every route, success or failure. */
interface Envelope<T> {
  data: T | null;
  error: { message: string } | null;
}

/** One GET against the API, unwrapped. Throws so the caller can decide. */
async function fetchRemote<T>(path: string): Promise<T> {
  const res = await fetch(`${client.baseUrl}${API_PREFIX}${path}`);
  if (!res.ok) throw new NetworkError(`${res.status} ${res.statusText}`);

  const body = (await res.json()) as Envelope<T>;
  if (body.error || body.data === null) {
    throw new NetworkError(body.error?.message ?? 'empty response');
  }
  return body.data;
}

/**
 * Resolve a request.
 *
 * @param path      The endpoint this maps to. Written even for bundled data, so
 *                  the API surface stays documented in code.
 * @param resolve   The bundled answer — the fallback, and the only answer for
 *                  data the server does not own.
 * @param opts      `remote` reads from the API first; `cacheable` marks data
 *                  offline mode may serve stale.
 */
export async function request<T>(
  path: string,
  resolve: () => T | Promise<T>,
  opts: { cacheable?: boolean; cachedAgeMin?: number; remote?: boolean } = {},
): Promise<T> {
  if ((opts.remote || client.mode === 'http') && !client.offline) {
    try {
      return await fetchRemote<T>(path);
    } catch {
      // Deliberately silent: fall through to the bundled copy. The caller asked
      // for data, not for a diagnosis of the network.
    }
  }

  await wait(randomLatency());

  if (client.offline) {
    if (!opts.cacheable) throw new OfflineError('This needs a connection', null);
    // Cacheable data is served from the last sync, and the caller must say so.
    return resolve();
  }

  if (client.failureRate > 0 && Math.random() < client.failureRate) {
    throw new NetworkError();
  }

  return resolve();
}

/**
 * Live streams. In production these are WebSocket subscriptions (SRS §11 —
 * chosen over polling to save battery); here they are the simulator's pub/sub.
 */
export interface Stream<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
}
