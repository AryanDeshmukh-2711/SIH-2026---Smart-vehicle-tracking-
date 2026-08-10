import type { OfflinePack, ServiceAlert } from '@/types';
import { ALERTS, OFFLINE_PACKS } from '@/data/alerts';
import { request } from './client';

/* -------------------------------- alerts ---------------------------------- */

export function getAlerts(): Promise<ServiceAlert[]> {
  return request('/v1/alerts', () =>
    ALERTS.slice().sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()),
    { cacheable: true },
  );
}

export function alertsForRoute(alerts: ServiceAlert[], routeId: string): ServiceAlert[] {
  return alerts.filter((a) => a.affectedRouteIds.includes(routeId));
}

export function alertsForStop(alerts: ServiceAlert[], stopId: string): ServiceAlert[] {
  return alerts.filter((a) => a.affectedStopIds.includes(stopId));
}

/* ----------------------------- offline packs ------------------------------ */

export function getOfflinePacks(): Promise<OfflinePack[]> {
  return request('/v1/offline/packs', () => OFFLINE_PACKS, { cacheable: true });
}

/**
 * Downloads happen through the service worker in a real build; here the
 * progress is simulated so the UI around it — cancel, resume, storage used —
 * can be exercised.
 */
export function downloadPack(
  packId: string,
  onProgress: (pct: number) => void,
): { promise: Promise<void>; cancel: () => void } {
  let cancelled = false;
  const pack = OFFLINE_PACKS.find((p) => p.id === packId);

  const promise = new Promise<void>((resolve, reject) => {
    let pct = 0;
    const timer = setInterval(() => {
      if (cancelled) {
        clearInterval(timer);
        reject(new Error('cancelled'));
        return;
      }
      pct = Math.min(100, pct + 6 + Math.random() * 10);
      onProgress(Math.round(pct));
      if (pct >= 100) {
        clearInterval(timer);
        if (pack) {
          pack.downloaded = true;
          pack.lastSync = new Date().toISOString();
        }
        resolve();
      }
    }, 140);
  });

  return { promise, cancel: () => { cancelled = true; } };
}

export function removePack(packId: string): Promise<void> {
  return request(`/v1/offline/packs/${packId}`, () => {
    const pack = OFFLINE_PACKS.find((p) => p.id === packId);
    if (pack) {
      pack.downloaded = false;
      pack.lastSync = undefined;
    }
  });
}

/** Most recent successful sync across all downloaded packs. */
export function lastSyncAt(packs: OfflinePack[]): Date | null {
  const times = packs
    .filter((p) => p.downloaded && p.lastSync)
    .map((p) => new Date(p.lastSync!).getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

export function storageUsedMb(packs: OfflinePack[]): number {
  return Math.round(packs.filter((p) => p.downloaded).reduce((s, p) => s + p.sizeMb, 0) * 10) / 10;
}
