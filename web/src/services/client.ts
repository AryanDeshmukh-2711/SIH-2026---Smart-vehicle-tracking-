/**
 * Transport seam.
 *
 * Every service function in this folder goes through `request()`. Today it
 * resolves against in-memory fixtures; pointing `HimGatiClient.baseUrl` at a
 * real gateway and flipping `mode` to `'http'` is the entire migration.
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

/**
 * Resolve a request.
 *
 * @param path      The endpoint this maps to once a real backend exists. Kept
 *                  even in mock mode so the API surface is documented in code.
 * @param resolve   Fixture producer.
 * @param opts      `cacheable` marks data that offline mode may serve stale.
 */
export async function request<T>(
  path: string,
  resolve: () => T | Promise<T>,
  opts: { cacheable?: boolean; cachedAgeMin?: number } = {},
): Promise<T> {
  if (client.mode === 'http') {
    const res = await fetch(`${client.baseUrl}${path}`);
    if (!res.ok) throw new NetworkError(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
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
