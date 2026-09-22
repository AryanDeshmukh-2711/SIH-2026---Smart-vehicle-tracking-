import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  BusReview,
  JourneyPreference,
  RatingBreakdown,
  ResolvedLocation,
  ServiceAlert,
  UserProfile,
} from '@/types';
import { USER } from '@/data/alerts';
import { overallFrom } from '@/data/reviews';
import { DEFAULT_LOCATION } from '@/services/location';
import { client } from '@/services/client';
import { getAlerts } from '@/services/offline';

/**
 * Application state that outlives a single screen: who the user is, where the
 * app currently thinks they are, whether there is a connection, and which buses
 * they have asked to be told about.
 *
 * Connectivity is tracked as three separate things, because they fail
 * independently and the UI reacts differently to each:
 *   • `online`    — the browser has a network path
 *   • `offlineMode`— the user deliberately turned data off (Low Data Mode)
 *   • `lastSync`  — how stale the cached transit data is
 */

interface AppState {
  user: UserProfile;
  setTravelMode: (mode: JourneyPreference) => void;
  setLanguage: (lang: 'en' | 'hi') => void;
  toggleLowData: () => void;
  updateAccessibility: (key: keyof UserProfile['accessibility'], value: boolean) => void;
  updateNotification: (key: keyof UserProfile['notifications'], value: boolean) => void;

  location: ResolvedLocation;
  setLocation: (loc: ResolvedLocation) => void;

  online: boolean;
  offlineMode: boolean;
  setOfflineMode: (v: boolean) => void;
  lastSync: Date;
  resync: () => void;

  alerts: ServiceAlert[];
  unreadAlerts: number;
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;

  trackedBusIds: string[];
  toggleTracked: (busId: string) => void;
  isTracked: (busId: string) => boolean;

  savedRouteIds: string[];
  toggleSavedRoute: (routeId: string) => void;

  savedPlaceIds: string[];
  toggleSavedPlace: (placeId: string) => void;

  /** Reviews written by this user, newest first. */
  userReviews: BusReview[];
  submitReview: (input: SubmitReviewInput) => void;
  deleteReview: (reviewId: string) => void;
  /** The user's own review of a bus, if they have written one. */
  myReviewFor: (busId: string) => BusReview | undefined;
  /** Trip records already reviewed, so a journey cannot be rated twice. */
  reviewedTripIds: string[];
}

export interface SubmitReviewInput {
  busId: string;
  /**
   * The `TripRecord` this review is written against, when there is one. Reviews
   * are keyed on it so re-rating the same journey edits rather than duplicates.
   */
  tripId?: string;
  /** Human journey label, e.g. "Shimla → Manali · 12 Aug". */
  journey: string;
  breakdown: RatingBreakdown;
  comment: string;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>(USER);
  const [location, setLocation] = useState<ResolvedLocation>(DEFAULT_LOCATION);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [offlineMode, setOfflineModeState] = useState(false);
  const [lastSync, setLastSync] = useState(() => new Date(Date.now() - 12 * 60_000));
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [trackedBusIds, setTrackedBusIds] = useState<string[]>(['B-9012']);
  const [savedRouteIds, setSavedRouteIds] = useState<string[]>(USER.savedRouteIds);
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>(['PL-HADIMBA', 'PL-RIDGE']);
  const [userReviews, setUserReviews] = useState<BusReview[]>([]);
  const [reviewedTripIds, setReviewedTripIds] = useState<string[]>([]);

  /**
   * Record a review against a completed trip.
   *
   * Held in memory for the session: there is no backend to POST to yet, and the
   * point of this state is that the review the passenger just wrote is actually
   * visible on the vehicle afterwards. `submitReview` is the single seam a real
   * `POST /v1/vehicles/:id/reviews` slots into.
   */
  const submitReview = useCallback((input: SubmitReviewInput) => {
    const review: BusReview = {
      // One review per user per vehicle, so submitting again edits the existing
      // one instead of stacking a second onto the vehicle's average.
      id: `UR-${input.busId}`,
      busId: input.busId,
      author: USER.name,
      date: new Date().toISOString(),
      overall: overallFrom(input.breakdown),
      breakdown: input.breakdown,
      comment: input.comment.trim(),
      journey: input.journey,
      helpfulCount: 0,
    };

    setUserReviews((list) => [review, ...list.filter((r) => r.id !== review.id)]);
    if (input.tripId) {
      setReviewedTripIds((ids) => (ids.includes(input.tripId!) ? ids : [...ids, input.tripId!]));
    }
  }, []);

  const deleteReview = useCallback((reviewId: string) => {
    setUserReviews((list) => list.filter((r) => r.id !== reviewId));
    // Only the user's own reviews are removable, and only they carry a trip
    // linkage, so releasing it re-opens the "rate this journey" prompt.
    setReviewedTripIds((ids) => ids.filter((id) => !reviewId.endsWith(id)));
  }, []);

  /* --------------------------- real connectivity -------------------------- */
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // The service layer needs to know, so cacheable reads can be served stale.
  //
  // Assigned during render rather than in an effect. Screens fire their first
  // requests from their own effects, and child effects run *before* the
  // provider's — so an app opened with no connection used to issue its entire
  // first round of requests with the transport still believing it was online.
  client.offline = offlineMode || !online;

  useEffect(() => {
    getAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, []);

  const setOfflineMode = useCallback((v: boolean) => {
    setOfflineModeState(v);
    if (!v) setLastSync(new Date());
  }, []);

  const value = useMemo<AppState>(
    () => ({
      user,
      setTravelMode: (travelMode) => setUser((u) => ({ ...u, travelMode })),
      setLanguage: (language) => setUser((u) => ({ ...u, language })),
      toggleLowData: () => setUser((u) => ({ ...u, lowDataMode: !u.lowDataMode })),
      updateAccessibility: (key, val) =>
        setUser((u) => ({ ...u, accessibility: { ...u.accessibility, [key]: val } })),
      updateNotification: (key, val) =>
        setUser((u) => ({ ...u, notifications: { ...u.notifications, [key]: val } })),

      location,
      setLocation,

      online,
      offlineMode,
      setOfflineMode,
      lastSync,
      resync: () => setLastSync(new Date()),

      alerts,
      unreadAlerts: alerts.filter((a) => !a.read).length,
      markAlertRead: (id) =>
        setAlerts((list) => list.map((a) => (a.id === id ? { ...a, read: true } : a))),
      markAllAlertsRead: () => setAlerts((list) => list.map((a) => ({ ...a, read: true }))),

      trackedBusIds,
      toggleTracked: (busId) =>
        setTrackedBusIds((ids) =>
          ids.includes(busId) ? ids.filter((i) => i !== busId) : [...ids, busId],
        ),
      isTracked: (busId) => trackedBusIds.includes(busId),

      savedRouteIds,
      toggleSavedRoute: (routeId) =>
        setSavedRouteIds((ids) =>
          ids.includes(routeId) ? ids.filter((i) => i !== routeId) : [...ids, routeId],
        ),

      savedPlaceIds,
      toggleSavedPlace: (placeId) =>
        setSavedPlaceIds((ids) =>
          ids.includes(placeId) ? ids.filter((i) => i !== placeId) : [...ids, placeId],
        ),

      userReviews,
      submitReview,
      deleteReview,
      myReviewFor: (busId) => userReviews.find((r) => r.busId === busId),
      reviewedTripIds,
    }),
    [
      user,
      location,
      online,
      offlineMode,
      lastSync,
      alerts,
      trackedBusIds,
      savedRouteIds,
      savedPlaceIds,
      setOfflineMode,
      userReviews,
      submitReview,
      deleteReview,
      reviewedTripIds,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}

/** True when live data must not be presented as live. */
export function useIsStale(): boolean {
  const { online, offlineMode } = useApp();
  return !online || offlineMode;
}
