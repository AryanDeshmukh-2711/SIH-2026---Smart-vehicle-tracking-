import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { JourneyPreference, ResolvedLocation, ServiceAlert, UserProfile } from '@/types';
import { USER } from '@/data/alerts';
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
  useEffect(() => {
    client.offline = offlineMode || !online;
  }, [offlineMode, online]);

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
    }),
    [user, location, online, offlineMode, lastSync, alerts, trackedBusIds, savedRouteIds, savedPlaceIds, setOfflineMode],
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
