import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LogOut,
  PhoneCall,
  Play,
  Satellite,
  Square,
  TriangleAlert,
  Users,
  Wrench,
} from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, Stat } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/Badge';
import { Sheet } from '@/components/ui/Sheet';
import { Notice, StateBlock } from '@/components/ui/States';
import { useAuth } from '@/store/AuthContext';
import { api } from '@/services/auth/authClient';
import { useTripTracking } from './useTripTracking';
import { relativeAge } from '@/lib/eta';
import { cn } from '@/lib/cn';

/**
 * Driver app.
 *
 * The SRS is emphatic that this stays trivially simple, and the reason is
 * physical: the person using it is about to drive a bus down a mountain road.
 * So there is one screen, the primary action is a single full-width button, and
 * nothing anywhere needs typing.
 */

interface DriverTrip {
  id: string;
  busId: string;
  routeId: string;
  scheduledAt: string;
  status: string;
  delayMin: number;
  startedAt: string | null;
  route: { id: string; shortName: string; longName: string; stops: number } | null;
  bus: { id: string; registration: string; fuel: string } | null;
}

type Occupancy = 'empty' | 'comfortable' | 'full';

const CROWD: Array<{ value: Occupancy; label: string; hint: string }> = [
  { value: 'empty', label: 'Seats free', hint: 'Plenty of space' },
  { value: 'comfortable', label: 'Comfortable', hint: 'Filling up' },
  { value: 'full', label: 'Full', hint: 'Standing only' },
];

const DELAYS = [5, 10, 15, 30];

export function DriverHomeScreen() {
  const { user, signOut } = useAuth();
  const [trips, setTrips] = useState<DriverTrip[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'crowd' | 'delay' | 'breakdown' | 'sos' | null>(null);

  const active = trips?.find((t) => t.startedAt && t.status !== 'ended') ?? null;
  const { status: tracking, start, stop } = useTripTracking({ tripId: active?.id ?? null });

  const load = useCallback(async () => {
    try {
      setTrips(await api.get<DriverTrip[]>('/api/v1/driver/trips'));
    } catch {
      setTrips([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Resume tracking if the app was reopened mid-shift.
  useEffect(() => {
    if (active && tracking.state === 'idle') void start();
    if (!active && tracking.state !== 'idle') stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  };

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'That did not go through');
    } finally {
      setBusy(null);
      setSheet(null);
    }
  };

  if (trips === null) {
    return (
      <Screen>
        <ScreenHeader back={false} title="Your shift" />
        <ScreenBody>
          <StateBlock
            icon={<Loader2 size={24} className="animate-spin" strokeWidth={2.2} />}
            title="Loading your trips"
            tone="brand"
          />
        </ScreenBody>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        back={false}
        title={user?.name ?? 'Driver'}
        subtitle={user?.depot ? `${user.depot} depot` : 'HRTC'}
        actions={
          <button
            onClick={() => void signOut()}
            aria-label="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-3"
          >
            <LogOut size={17} strokeWidth={2.2} />
          </button>
        }
      />

      <ScreenBody className="pt-4">
        <Stack>
          {toast && <Notice tone="warn" icon={<AlertTriangle size={14} strokeWidth={2.4} />}>{toast}</Notice>}

          {trips.length === 0 && (
            <StateBlock
              icon={<CheckCircle2 size={24} strokeWidth={2} />}
              title="No trips assigned"
              body="Nothing is rostered to you right now. The depot assigns trips at the start of a shift."
              tone="brand"
            />
          )}

          {/* ------------------------------ active trip --------------------- */}
          {active && (
            <Card className="border-brand-300">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-[7px] bg-ink px-2 py-[3px] font-display text-[14px] font-extrabold text-white">
                      {active.route?.shortName}
                    </span>
                    <StatusPill tone="ok" pulse>
                      On the road
                    </StatusPill>
                  </div>
                  <h2 className="mt-2 font-display text-[19px] font-extrabold leading-tight text-ink">
                    {active.route?.longName}
                  </h2>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">
                    {active.bus?.registration} · started{' '}
                    {active.startedAt
                      ? relativeAge((Date.now() - new Date(active.startedAt).getTime()) / 1000)
                      : ''}
                  </p>
                </div>
              </div>

              {/* tracking state — the driver must be able to see the depot can see them */}
              <div
                className={cn(
                  'mt-3.5 flex items-center gap-2.5 rounded-field border px-3 py-2.5',
                  tracking.state === 'tracking'
                    ? 'border-ok-line bg-ok-bg'
                    : tracking.state === 'denied'
                      ? 'border-bad-line bg-bad-bg'
                      : 'border-line bg-surface-2',
                )}
              >
                <Satellite
                  size={16}
                  strokeWidth={2.3}
                  className={cn(
                    'shrink-0',
                    tracking.state === 'tracking' ? 'text-ok' : tracking.state === 'denied' ? 'text-bad' : 'text-ink-3',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold text-ink">
                    {tracking.state === 'tracking'
                      ? 'Depot can see this bus'
                      : tracking.state === 'denied'
                        ? 'Location is switched off'
                        : tracking.state === 'starting'
                          ? 'Getting a fix…'
                          : 'Not reporting'}
                  </div>
                  <div className="text-[11.5px] text-ink-3">
                    {tracking.error ??
                      `${tracking.sent} fixes sent${tracking.rejected ? `, ${tracking.rejected} rejected` : ''}${
                        tracking.accuracyM ? ` · ±${tracking.accuracyM} m` : ''
                      }`}
                  </div>
                </div>
                {tracking.wakeLockHeld && (
                  <span className="shrink-0 text-[10.5px] font-semibold text-ok">screen held</span>
                )}
              </div>

              {!tracking.wakeLockHeld && tracking.state === 'tracking' && (
                <Notice tone="warn" className="mt-2">
                  Keep this screen open. A browser stops reporting position when it is in the
                  background.
                </Notice>
              )}

              <div className="mt-3.5 grid grid-cols-3 gap-3 border-t border-line pt-3.5">
                <Stat label="Route" value={`${active.route?.stops ?? 0} stops`} />
                <Stat label="Scheduled" value={active.scheduledAt} />
                <Stat
                  label="Delay"
                  value={active.delayMin >= 5 ? `+${active.delayMin} min` : 'On time'}
                  tone={active.delayMin >= 5 ? 'warn' : 'ok'}
                />
              </div>
            </Card>
          )}

          {/* ------------------------------ big actions --------------------- */}
          {active ? (
            <Stack gap={3}>
              <div className="grid grid-cols-2 gap-2.5">
                <Button size="lg" variant="secondary" onClick={() => setSheet('crowd')}>
                  <Users size={17} strokeWidth={2.3} />
                  Crowd level
                </Button>
                <Button size="lg" variant="secondary" onClick={() => setSheet('delay')}>
                  <TriangleAlert size={17} strokeWidth={2.3} />
                  Report delay
                </Button>
              </div>

              <Button size="lg" variant="secondary" block onClick={() => setSheet('breakdown')}>
                <Wrench size={17} strokeWidth={2.3} />
                Report breakdown
              </Button>

              <Button
                size="lg"
                block
                className="h-[60px] bg-bad text-[16px] hover:brightness-95"
                onClick={() => setSheet('sos')}
              >
                <PhoneCall size={19} strokeWidth={2.4} />
                SOS
              </Button>

              <Button
                size="lg"
                variant="secondary"
                block
                disabled={busy !== null}
                onClick={() =>
                  act('end', async () => {
                    await api.post(`/api/v1/driver/trips/${active.id}/end`);
                    stop();
                    flash('Trip ended. GPS reporting stopped.');
                  })
                }
              >
                <Square size={16} strokeWidth={2.4} />
                End trip
              </Button>
            </Stack>
          ) : (
            /* --------------------------- trips to start --------------------- */
            <Stack gap={3}>
              {trips
                .filter((t) => !t.startedAt)
                .map((t) => (
                  <Card key={t.id}>
                    <div className="flex items-center gap-2">
                      <span className="rounded-[7px] bg-ink px-2 py-[3px] font-display text-[13px] font-extrabold text-white">
                        {t.route?.shortName}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">
                        {t.route?.longName}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-ink-3">
                      {t.bus?.registration} · departs {t.scheduledAt} · {t.route?.stops} stops
                    </p>

                    <Button
                      block
                      size="lg"
                      className="mt-3.5 h-[56px] text-[16px]"
                      disabled={busy !== null}
                      onClick={() =>
                        act('start', async () => {
                          await api.post(`/api/v1/driver/trips/${t.id}/start`);
                          flash('Trip started. Keep this screen open.');
                        })
                      }
                    >
                      {busy === 'start' ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Play size={18} strokeWidth={2.5} fill="currentColor" />
                      )}
                      Start trip
                    </Button>
                  </Card>
                ))}
            </Stack>
          )}
        </Stack>
      </ScreenBody>

      {/* --------------------------------- sheets ------------------------------ */}

      <Sheet open={sheet === 'crowd'} onClose={() => setSheet(null)} title="How full is the bus?">
        <div className="space-y-2 pb-2">
          {CROWD.map((c) => (
            <button
              key={c.value}
              disabled={busy !== null}
              onClick={() =>
                act('crowd', async () => {
                  await api.post(`/api/v1/driver/trips/${active!.id}/report`, { occupancy: c.value });
                  flash(`Crowd level set to ${c.label.toLowerCase()}`);
                })
              }
              className="flex w-full items-center gap-3 rounded-field border border-line bg-surface px-4 py-4 text-left hover:border-brand-300 hover:bg-brand-50"
            >
              <Users size={18} strokeWidth={2.2} className="shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink">{c.label}</span>
                <span className="block text-[12px] text-ink-3">{c.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'delay'}
        onClose={() => setSheet(null)}
        title="How far behind are you?"
        subtitle="Passengers see this immediately"
      >
        <div className="grid grid-cols-2 gap-2 pb-2">
          {DELAYS.map((min) => (
            <button
              key={min}
              disabled={busy !== null}
              onClick={() =>
                act('delay', async () => {
                  await api.post(`/api/v1/driver/trips/${active!.id}/report`, { delayMin: min });
                  flash(`Reported ${min} minutes late`);
                })
              }
              className="rounded-field border border-line bg-surface py-5 text-[17px] font-bold text-ink hover:border-warn-line hover:bg-warn-bg"
            >
              {min} min
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'breakdown'}
        onClose={() => setSheet(null)}
        title="Report a breakdown?"
        subtitle="This cancels the service and tells every waiting passenger"
      >
        <div className="space-y-2 pb-2">
          <Notice tone="warn">
            The trip is marked cancelled and an alert goes out on this route immediately. Only do
            this if the bus cannot continue.
          </Notice>
          <Button
            block
            size="lg"
            variant="danger"
            disabled={busy !== null}
            onClick={() =>
              act('breakdown', async () => {
                await api.post(`/api/v1/driver/trips/${active!.id}/breakdown`, {
                  reason: 'Vehicle cannot continue',
                });
                stop();
                flash('Breakdown reported. The depot has been told.');
              })
            }
          >
            <Wrench size={17} strokeWidth={2.3} />
            Confirm breakdown
          </Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'sos'} onClose={() => setSheet(null)} title="Raise an emergency?">
        <div className="space-y-2 pb-2">
          <Notice tone="bad">
            This alerts the depot control room with your last known position. Use it for an
            accident, a medical emergency, or a threat to safety.
          </Notice>
          <Button
            block
            size="lg"
            variant="danger"
            className="h-[60px] text-[17px]"
            disabled={busy !== null}
            onClick={() =>
              act('sos', async () => {
                await api.post('/api/v1/driver/sos', { tripId: active?.id });
                flash('SOS sent. The depot has your position.');
              })
            }
          >
            <PhoneCall size={20} strokeWidth={2.5} />
            Send SOS now
          </Button>
        </div>
      </Sheet>
    </Screen>
  );
}
