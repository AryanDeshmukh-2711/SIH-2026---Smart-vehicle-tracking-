import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { LiveBus, StopPrediction } from '@/types';
import { liveStore, type LiveSource } from '@/services/live/liveStore';
import { departuresAt } from '@/services/live/queries';

/**
 * Live fleet subscription.
 *
 * Backed by the API's Socket.IO feed, which falls back to the bundled simulator
 * when the backend is unreachable. Screens never learn which one they are
 * reading — the store presents one interface either way.
 */
export function useLiveFleet(): LiveBus[] {
  return useSyncExternalStore(liveStore.subscribe, liveStore.getSnapshot, liveStore.getSnapshot);
}

/** Where the current positions came from, for the connection indicator. */
export function useLiveSource(): LiveSource {
  return useSyncExternalStore(liveStore.subscribe, liveStore.getSource, liveStore.getSource);
}

export function useLiveBus(busId: string | undefined): LiveBus | undefined {
  const fleet = useLiveFleet();
  return busId ? fleet.find((b) => b.bus.id === busId) : undefined;
}

/**
 * Live arrivals for a stop, recomputed on every fleet tick.
 *
 * Subscribing first is what makes this reactive; the board itself is built by
 * the same `departuresAt` the services use, so a stop screen and the journey
 * planner cannot quote different times for the same bus.
 */
export function useDepartures(
  stopId: string | undefined,
  limit = 8,
): Array<{ live: LiveBus; prediction: StopPrediction }> {
  useLiveFleet();
  return stopId ? departuresAt(stopId, limit) : [];
}

/* ------------------------------ async helper ------------------------------ */

export type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: Error };

/**
 * Minimal data-fetching hook. Every screen goes through this so loading and
 * error states are real rather than decorative.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading', data: null, error: null });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading', data: null, error: null });

    fnRef
      .current()
      .then((data) => {
        if (alive) setState({ status: 'ready', data, error: null });
      })
      .catch((error: Error) => {
        if (alive) setState({ status: 'error', data: null, error });
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Re-render on an interval — used for "updated 4 min ago" style labels. */
export function useTicker(intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return tick;
}
