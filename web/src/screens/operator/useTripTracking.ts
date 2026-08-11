import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/auth/authClient';

/**
 * Position reporting from the driver's phone.
 *
 * This is the SRS's stated mitigation for a missing or broken AIS-140 box: the
 * driver's handset becomes the tracker. Fixes go to the same ingestion endpoint
 * the hardware feed uses and are validated identically.
 *
 * The honest limitation, stated plainly because it will be asked about: a
 * browser tab is suspended when it loses focus, so this cannot run with the
 * screen off. A Screen Wake Lock keeps the display awake for as long as the
 * trip is running, which holds for a phone docked on the dashboard — the
 * realistic deployment — but a native app is the only complete answer.
 */

export type TrackingState = 'idle' | 'starting' | 'tracking' | 'denied' | 'unavailable';

interface Options {
  tripId: string | null;
  /** How often to report, ms. The SRS specifies ten seconds. */
  intervalMs?: number;
}

export interface TrackingStatus {
  state: TrackingState;
  /** Fixes the server accepted. */
  sent: number;
  /** Fixes the server rejected as untrustworthy. */
  rejected: number;
  lastFixAt: Date | null;
  accuracyM: number | null;
  wakeLockHeld: boolean;
  error: string | null;
}

export function useTripTracking({ tripId, intervalMs = 10_000 }: Options) {
  const [status, setStatus] = useState<TrackingStatus>({
    state: 'idle',
    sent: 0,
    rejected: 0,
    lastFixAt: null,
    accuracyM: null,
    wakeLockHeld: false,
    error: null,
  });

  const watchId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef<GeolocationPosition | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const report = useCallback(async () => {
    if (!tripId || !latest.current) return;
    const c = latest.current.coords;

    try {
      const result = await api.post<{ accepted: boolean; reason: string | null }>(
        `/api/v1/driver/trips/${tripId}/location`,
        {
          lat: c.latitude,
          lng: c.longitude,
          speedKmph: c.speed != null ? Math.max(0, c.speed * 3.6) : 0,
          heading: c.heading ?? 0,
          accuracyM: c.accuracy,
          timestamp: latest.current.timestamp,
        },
      );

      setStatus((s) => ({
        ...s,
        sent: s.sent + (result.accepted ? 1 : 0),
        rejected: s.rejected + (result.accepted ? 0 : 1),
        lastFixAt: new Date(),
        accuracyM: Math.round(c.accuracy),
        error: null,
      }));
    } catch {
      // A dropped report is expected on this network and is not worth alarming
      // the driver about — the device keeps its position and tries again.
      setStatus((s) => ({ ...s, error: null }));
    }
  }, [tripId]);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    if (timer.current) clearInterval(timer.current);
    watchId.current = null;
    timer.current = null;

    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;

    setStatus((s) => ({ ...s, state: 'idle', wakeLockHeld: false }));
  }, []);

  const start = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setStatus((s) => ({ ...s, state: 'unavailable', error: 'This device has no location hardware' }));
      return;
    }

    setStatus((s) => ({ ...s, state: 'starting', error: null }));

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = pos;
        setStatus((s) => ({ ...s, state: 'tracking', accuracyM: Math.round(pos.coords.accuracy) }));
      },
      (err) => {
        setStatus((s) => ({
          ...s,
          state: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission is off — the depot cannot see this bus'
              : 'No satellite fix yet',
        }));
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );

    timer.current = setInterval(() => void report(), intervalMs);

    try {
      wakeLock.current = await navigator.wakeLock?.request('screen');
      setStatus((s) => ({ ...s, wakeLockHeld: Boolean(wakeLock.current) }));
    } catch {
      // Not fatal — tracking still works while the tab is in front.
      setStatus((s) => ({ ...s, wakeLockHeld: false }));
    }
  }, [intervalMs, report]);

  // The lock is dropped whenever the tab is hidden, so it has to be retaken.
  useEffect(() => {
    const reacquire = async () => {
      if (document.visibilityState !== 'visible' || !timer.current) return;
      try {
        wakeLock.current = await navigator.wakeLock?.request('screen');
        setStatus((s) => ({ ...s, wakeLockHeld: Boolean(wakeLock.current) }));
      } catch {
        setStatus((s) => ({ ...s, wakeLockHeld: false }));
      }
    };

    document.addEventListener('visibilitychange', reacquire);
    return () => document.removeEventListener('visibilitychange', reacquire);
  }, []);

  useEffect(() => stop, [stop]);

  return { status, start, stop };
}
