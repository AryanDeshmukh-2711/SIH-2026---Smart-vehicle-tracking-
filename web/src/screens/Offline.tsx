import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  CloudDownload,
  Database,
  Download,
  HardDrive,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import type { OfflinePack } from '@/types';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, SectionHeader, Stat } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Notice } from '@/components/ui/States';
import { useApp } from '@/store/AppState';
import { downloadPack, lastSyncAt, removePack, storageUsedMb } from '@/services/offline';
import { OFFLINE_PACKS } from '@/data/alerts';
import { relativeAge } from '@/lib/eta';
import { cn } from '@/lib/cn';

/**
 * Offline transit mode.
 *
 * The rule this screen enforces: cached data is always labelled with its age.
 * The SRS is blunt about why — other apps freeze the bus icon and let the user
 * believe it is live, and telling the truth about staleness is what earns trust
 * in a region where the signal genuinely does disappear for twenty minutes.
 */
export function OfflineScreen() {
  const { offlineMode, setOfflineMode, online, lastSync, resync, user, toggleLowData } = useApp();
  const [packs, setPacks] = useState<OfflinePack[]>(() => OFFLINE_PACKS.map((p) => ({ ...p })));
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [syncing, setSyncing] = useState(false);

  const refresh = () => setPacks(OFFLINE_PACKS.map((p) => ({ ...p })));

  const start = (id: string) => {
    setProgress((p) => ({ ...p, [id]: 0 }));
    const { promise } = downloadPack(id, (pct) => setProgress((p) => ({ ...p, [id]: pct })));
    promise
      .then(() => {
        refresh();
        setProgress((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
      })
      .catch(() => undefined);
  };

  const remove = (id: string) => {
    removePack(id).then(refresh);
  };

  const doSync = () => {
    setSyncing(true);
    setTimeout(() => {
      resync();
      refresh();
      setSyncing(false);
    }, 1100);
  };

  const stale = Math.round((Date.now() - lastSync.getTime()) / 60_000);
  const downloaded = packs.filter((p) => p.downloaded);
  const storage = storageUsedMb(packs);
  const lastPackSync = lastSyncAt(packs);

  return (
    <Screen>
      <ScreenHeader title="Offline mode" subtitle="For the stretches with no signal" />

      <ScreenBody className="pt-4">
        <Stack>
          {/* --------------------------- current state ------------------------- */}
          <Card
            className={cn(
              offlineMode || !online ? 'border-warn-line bg-warn-bg' : 'border-line',
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]',
                  offlineMode || !online ? 'bg-warn text-white' : 'bg-ok-bg text-ok',
                )}
              >
                <WifiOff size={19} strokeWidth={2.3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-ink">
                  {!online
                    ? 'No connection'
                    : offlineMode
                      ? 'Offline mode is on'
                      : 'Connected — live data'}
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
                  {offlineMode || !online
                    ? `Showing saved timetables and the last known positions. Last updated ${stale} minutes ago — these are not live times.`
                    : 'Arrival times are live. Turn this on to work entirely from downloaded data.'}
                </p>
              </div>
              <Toggle checked={offlineMode} onChange={setOfflineMode} label="Offline mode" />
            </div>

            <div className="mt-3.5 grid grid-cols-3 gap-3 border-t border-line/60 pt-3.5">
              <Stat
                label="Last sync"
                value={`${stale} min ago`}
                tone={stale > 30 ? 'warn' : 'default'}
              />
              <Stat label="Downloaded" value={`${storage} MB`} />
              <Stat label="Regions" value={`${downloaded.length}/${packs.length}`} />
            </div>

            <Button
              variant="secondary"
              block
              className="mt-3"
              disabled={syncing || !online}
              onClick={doSync}
            >
              {syncing ? (
                <>
                  <Loader2 size={15} strokeWidth={2.4} className="animate-spin" />
                  Syncing timetables…
                </>
              ) : (
                <>
                  <RefreshCw size={15} strokeWidth={2.4} />
                  Sync now
                </>
              )}
            </Button>
          </Card>

          {stale > 15 && (
            <Notice tone="warn" icon={<Database size={14} strokeWidth={2.3} />}>
              <span className="font-semibold">Your data is {stale} minutes old.</span> Beyond 15
              minutes the app stops showing live predictions entirely and falls back to the printed
              timetable, because a stale prediction is worse than an honest schedule.
            </Notice>
          )}

          {/* ------------------------------ packs ------------------------------ */}
          <section>
            <SectionHeader
              title="Downloaded regions"
              hint="Routes, stops, timetables, places and a basemap tile pack"
            />
            <div className="space-y-2.5">
              {packs.map((pack) => {
                const pct = progress[pack.id];
                const busy = pct !== undefined;

                return (
                  <Card key={pack.id}>
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
                          pack.downloaded ? 'bg-ok-bg text-ok' : 'bg-surface-3 text-ink-3',
                        )}
                      >
                        {pack.downloaded ? (
                          <Check size={17} strokeWidth={2.8} />
                        ) : (
                          <CloudDownload size={17} strokeWidth={2.2} />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13.5px] font-bold text-ink">
                              {pack.region}
                            </div>
                            <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">
                              {pack.description}
                            </div>
                          </div>
                          <span className="shrink-0 text-[11.5px] font-semibold text-ink-3 tnum">
                            {pack.sizeMb} MB
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge>{pack.routes} routes</Badge>
                          <Badge>{pack.stops} stops</Badge>
                          {pack.places > 0 && <Badge>{pack.places} places</Badge>}
                          {pack.downloaded && pack.lastSync && (
                            <span className="text-[11px] text-ink-4">
                              synced{' '}
                              {relativeAge((Date.now() - new Date(pack.lastSync).getTime()) / 1000)}
                            </span>
                          )}
                        </div>

                        {busy ? (
                          <div className="mt-2.5">
                            <div className="h-[5px] overflow-hidden rounded-full bg-surface-3">
                              <div
                                className="h-full rounded-full bg-brand-600 transition-[width] duration-200"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-[11px] text-ink-3 tnum">
                                Downloading… {pct}%
                              </span>
                              <span className="text-[11px] text-ink-4">
                                {((pack.sizeMb * pct) / 100).toFixed(1)} / {pack.sizeMb} MB
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2.5">
                            {pack.downloaded ? (
                              <button
                                onClick={() => remove(pack.id)}
                                className="flex items-center gap-1 text-[12px] font-semibold text-bad"
                              >
                                <Trash2 size={12} strokeWidth={2.4} />
                                Remove
                              </button>
                            ) : (
                              <button
                                onClick={() => start(pack.id)}
                                className="flex items-center gap-1 text-[12px] font-semibold text-brand-600"
                              >
                                <Download size={12} strokeWidth={2.5} />
                                Download
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* ---------------------------- low data ----------------------------- */}
          <Card>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-3 text-ink-2">
                <HardDrive size={17} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-ink">Low data mode</div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
                  Text only — no map tiles, no artwork. Cuts data use to under 1 MB an hour, which
                  matters on a 2G edge signal.
                </p>
              </div>
              <Toggle checked={user.lowDataMode} onChange={toggleLowData} label="Low data mode" />
            </div>
          </Card>

          {/* ------------------------ no-app access paths ---------------------- */}
          <section>
            <SectionHeader
              title="When there is no data at all"
              hint="These need no internet and no app"
            />
            <div className="space-y-2.5">
              <Card>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
                    <MessageSquare size={17} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-ink">SMS the stop code</div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
                      Text <span className="font-mono font-semibold text-ink-2">BUS 0456</span> to
                      56070 and get the next three buses back, with ETA and fuel type. Reply
                      typically arrives within 30 seconds.
                    </p>
                    <Link
                      to="/stop/HP-SML-002"
                      className="mt-1.5 inline-block text-[12px] font-semibold text-brand-600"
                    >
                      See an example reply →
                    </Link>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
                    <Phone size={17} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-ink">Call the IVR line</div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
                      A voice line in Hindi that reads out the next departures for any stop code.
                      Built for passengers without a smartphone.
                    </p>
                    <span className="mt-1.5 inline-block font-mono text-[12.5px] font-semibold text-ink-2">
                      1800-180-6070
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          <Notice tone="neutral" icon={<X size={14} strokeWidth={2.4} />}>
            <span className="font-semibold">What offline mode will not do:</span> it will never show
            you a moving bus icon that is not moving. If a position is stale, the app says so and
            switches to a range or the timetable.
            {lastPackSync && (
              <> Regional data last refreshed {relativeAge((Date.now() - lastPackSync.getTime()) / 1000)}.</>
            )}
          </Notice>
        </Stack>
      </ScreenBody>
    </Screen>
  );
}
