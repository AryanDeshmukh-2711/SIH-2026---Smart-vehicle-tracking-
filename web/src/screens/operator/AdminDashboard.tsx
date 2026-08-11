import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  Bus,
  ClipboardList,
  Leaf,
  Loader2,
  LogOut,
  Megaphone,
  Radio,
  ScrollText,
  Send,
  SignalZero,
  Upload,
} from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, SectionHeader, Stat } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Segmented, TextField } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { Notice, StateBlock } from '@/components/ui/States';
import { useAuth } from '@/store/AuthContext';
import { api } from '@/services/auth/authClient';
import { relativeAge } from '@/lib/eta';
import { cn } from '@/lib/cn';

/**
 * Depot and authority dashboard.
 *
 * Ordered around the two questions the job actually asks: what is wrong right
 * now, and what has been going wrong lately. Configuration editing sits behind
 * those, because nobody opens this screen to change a fare.
 */

type Tab = 'now' | 'reports' | 'audit';

interface Overview {
  fleet: { total: number; reporting: number; offline: number; cleanFuelShare: number; averageGreenScore: number };
  services: { running: number; delayed: number; cancelled: number; signalLost: number; scheduled: number };
  network: { routes: number; stops: number };
  openAlerts: number;
  tripsToday: number;
}

interface FleetRow {
  vehicle: { busId: string; status: string; speedKmph: number; lastSeenStopName: string | null; delayMin: number };
  bus: { registration: string; fuel: string; greenScore: number } | null;
  route: { shortName: string; longName: string } | null;
  ageSec: number;
}

interface PunctualityRow {
  routeId: string;
  shortName: string;
  longName: string;
  trips: number;
  onTime: number;
  late: number;
  cancelled: number;
  onTimePercent: number;
  averageLatenessMin: number;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  running: 'ok',
  delayed: 'warn',
  'signal-lost': 'warn',
  cancelled: 'bad',
  scheduled: 'neutral',
};

export function AdminDashboardScreen() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('now');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [fleet, setFleet] = useState<FleetRow[]>([]);
  const [punctuality, setPunctuality] = useState<PunctualityRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [sheet, setSheet] = useState<'alert' | 'import' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = useCallback(async () => {
    const [o, f] = await Promise.all([
      api.get<Overview>('/api/v1/admin/overview').catch(() => null),
      api.get<FleetRow[]>('/api/v1/admin/fleet').catch(() => []),
    ]);
    if (o) setOverview(o);
    setFleet(f);
  }, []);

  useEffect(() => {
    void refresh();
    // The fleet view is a control room screen — it should not need reloading.
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (tab === 'reports') {
      api
        .get<{ routes: PunctualityRow[] }>('/api/v1/admin/reports/punctuality?days=7')
        .then((r) => setPunctuality(r.routes))
        .catch(() => setPunctuality([]));
    }
    if (tab === 'audit') {
      api.get<AuditRow[]>('/api/v1/admin/audit?limit=40').then(setAudit).catch(() => setAudit([]));
    }
  }, [tab]);

  const problems = fleet.filter((r) => ['cancelled', 'signal-lost', 'delayed'].includes(r.vehicle.status));

  return (
    <Screen>
      <ScreenHeader
        back={false}
        title="Fleet operations"
        subtitle={`${user?.name} · ${user?.role === 'transport_authority' ? 'HP Transport Authority' : 'HRTC'}`}
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

      <div className="shrink-0 border-b border-line bg-surface px-4 pb-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'now', label: 'Live' },
            { value: 'reports', label: 'Punctuality' },
            { value: 'audit', label: 'Audit' },
          ]}
        />
      </div>

      <ScreenBody className="pt-4">
        <Stack>
          {toast && <Notice tone="ok">{toast}</Notice>}

          {tab === 'now' && (
            <>
              {!overview ? (
                <StateBlock
                  icon={<Loader2 size={24} className="animate-spin" strokeWidth={2.2} />}
                  title="Loading fleet state"
                  tone="brand"
                />
              ) : (
                <>
                  {/* ------------------------- headline counts ------------------- */}
                  <Card>
                    <div className="grid grid-cols-4 gap-2">
                      <Stat label="Fleet" value={String(overview.fleet.total)} />
                      <Stat label="Reporting" value={String(overview.fleet.reporting)} tone="ok" />
                      <Stat
                        label="Offline"
                        value={String(overview.fleet.offline)}
                        tone={overview.fleet.offline > 0 ? 'warn' : 'default'}
                      />
                      <Stat label="Trips today" value={String(overview.tripsToday)} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3.5">
                      <Badge tone="ok">
                        <Activity size={10} strokeWidth={2.8} />
                        {overview.services.running} on time
                      </Badge>
                      <Badge tone={overview.services.delayed ? 'warn' : 'neutral'}>
                        {overview.services.delayed} delayed
                      </Badge>
                      <Badge tone={overview.services.signalLost ? 'warn' : 'neutral'}>
                        <SignalZero size={10} strokeWidth={2.8} />
                        {overview.services.signalLost} signal lost
                      </Badge>
                      <Badge tone={overview.services.cancelled ? 'bad' : 'neutral'}>
                        <Ban size={10} strokeWidth={2.8} />
                        {overview.services.cancelled} cancelled
                      </Badge>
                      <Badge>{overview.services.scheduled} in bay</Badge>
                    </div>

                    <div className="mt-3.5 flex items-center gap-2 border-t border-line pt-3">
                      <Leaf size={14} strokeWidth={2.4} className="shrink-0 text-ok" />
                      <span className="text-[12px] text-ink-2">
                        Fleet average Green Score{' '}
                        <span className="font-bold">{overview.fleet.averageGreenScore}</span> ·{' '}
                        {Math.round(overview.fleet.cleanFuelShare * 100)}% clean fuel
                      </span>
                    </div>
                  </Card>

                  {/* --------------------------- publish alert ------------------- */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <Button size="lg" onClick={() => setSheet('alert')}>
                      <Megaphone size={16} strokeWidth={2.3} />
                      Publish alert
                    </Button>
                    <Button size="lg" variant="secondary" onClick={() => setSheet('import')}>
                      <Upload size={16} strokeWidth={2.3} />
                      Import routes
                    </Button>
                  </div>

                  {/* ---------------------------- needs attention ---------------- */}
                  <section>
                    <SectionHeader
                      title="Needs attention"
                      hint={problems.length ? `${problems.length} services` : 'Nothing wrong right now'}
                    />
                    {problems.length === 0 ? (
                      <Card>
                        <div className="flex items-center gap-2.5">
                          <Activity size={16} strokeWidth={2.3} className="text-ok" />
                          <span className="text-[13px] text-ink-2">
                            Every reporting service is running to schedule.
                          </span>
                        </div>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {problems.map((r) => (
                          <FleetCard key={r.vehicle.busId} row={r} />
                        ))}
                      </div>
                    )}
                  </section>

                  {/* ------------------------------ full fleet ------------------- */}
                  <section>
                    <SectionHeader title="All vehicles" hint="Refreshes every five seconds" />
                    <div className="space-y-2">
                      {fleet
                        .filter((r) => !problems.includes(r))
                        .map((r) => (
                          <FleetCard key={r.vehicle.busId} row={r} />
                        ))}
                    </div>
                  </section>
                </>
              )}
            </>
          )}

          {/* ------------------------------- punctuality --------------------- */}
          {tab === 'reports' && (
            <>
              <Notice tone="neutral" icon={<ClipboardList size={14} strokeWidth={2.3} />}>
                On-time performance over the last seven days. A service is late at five minutes —
                the same threshold the passenger app uses to badge it, so this report and the app
                cannot disagree.
              </Notice>

              {punctuality.length === 0 ? (
                <StateBlock
                  compact
                  icon={<ClipboardList size={20} strokeWidth={2} />}
                  title="No completed trips in this window"
                  body="Punctuality is measured from trips that have run."
                />
              ) : (
                <div className="space-y-2">
                  {punctuality.map((r) => (
                    <Card key={r.routeId}>
                      <div className="flex items-center gap-2">
                        <span className="rounded-[6px] bg-ink px-1.5 py-[2px] text-[11.5px] font-extrabold text-white">
                          {r.shortName}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-2">
                          {r.longName}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 font-display text-[17px] font-extrabold tnum',
                            r.onTimePercent >= 80 ? 'text-ok' : r.onTimePercent >= 50 ? 'text-warn' : 'text-bad',
                          )}
                        >
                          {r.onTimePercent}%
                        </span>
                      </div>

                      <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-surface-3">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            r.onTimePercent >= 80 ? 'bg-ok' : r.onTimePercent >= 50 ? 'bg-warn' : 'bg-bad',
                          )}
                          style={{ width: `${r.onTimePercent}%` }}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
                        <span>{r.trips} trips</span>
                        <span className="text-ok">{r.onTime} on time</span>
                        <span className="text-warn">{r.late} late</span>
                        {r.cancelled > 0 && <span className="text-bad">{r.cancelled} cancelled</span>}
                        {r.averageLatenessMin > 0 && <span>avg {r.averageLatenessMin} min late</span>}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {/* --------------------------------- audit -------------------------- */}
          {tab === 'audit' && (
            <>
              <Notice tone="neutral" icon={<ScrollText size={14} strokeWidth={2.3} />}>
                Append-only record of privileged actions. An authority that cannot answer “who
                cancelled that service?” has no oversight.
              </Notice>

              <Card padded={false} className="divide-y divide-line">
                {audit.map((e) => (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-3 text-ink-2">
                      <ScrollText size={13} strokeWidth={2.3} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-[12px] font-bold text-ink">{e.action}</span>
                        <span className="text-[11.5px] text-ink-3">{e.entity}</span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-ink-3">
                        {e.actorName} · {relativeAge((Date.now() - new Date(e.createdAt).getTime()) / 1000)}
                      </div>
                    </div>
                  </div>
                ))}
                {audit.length === 0 && (
                  <div className="px-4 py-8 text-center text-[13px] text-ink-3">No entries yet.</div>
                )}
              </Card>
            </>
          )}
        </Stack>
      </ScreenBody>

      <PublishAlertSheet
        open={sheet === 'alert'}
        onClose={() => setSheet(null)}
        onPublished={(title) => {
          flash(`Published: ${title}`);
          void refresh();
        }}
      />
      <ImportRoutesSheet
        open={sheet === 'import'}
        onClose={() => setSheet(null)}
        onImported={(n) => flash(`Imported ${n} route${n === 1 ? '' : 's'}`)}
      />
    </Screen>
  );
}

/* -------------------------------- fleet card ------------------------------ */

function FleetCard({ row }: { row: FleetRow }) {
  const tone = STATUS_TONE[row.vehicle.status] ?? 'neutral';

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-[6px] bg-ink px-1.5 py-[2px] text-[11.5px] font-extrabold text-white">
            {row.route?.shortName ?? '—'}
          </span>
          <div className="min-w-0">
            <div className="truncate font-display text-[13.5px] font-bold text-ink">
              {row.bus?.registration}
            </div>
            <div className="truncate text-[11.5px] text-ink-3">{row.route?.longName}</div>
          </div>
        </div>
        <StatusPill tone={tone} pulse={row.vehicle.status === 'running'}>
          {row.vehicle.status === 'signal-lost'
            ? 'Signal lost'
            : row.vehicle.status === 'delayed'
              ? `${row.vehicle.delayMin} min late`
              : row.vehicle.status}
        </StatusPill>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
        <span className="inline-flex items-center gap-1">
          <Bus size={11} strokeWidth={2.4} />
          {row.vehicle.status === 'signal-lost' ? 'not reporting' : `${row.vehicle.speedKmph} km/h`}
        </span>
        {row.vehicle.lastSeenStopName && <span>near {row.vehicle.lastSeenStopName}</span>}
        <span className="inline-flex items-center gap-1">
          <Radio size={11} strokeWidth={2.4} />
          {relativeAge(row.ageSec)}
        </span>
        {row.bus && <span>Green {row.bus.greenScore}</span>}
      </div>
    </Card>
  );
}

/* ------------------------------ publish alert ----------------------------- */

function PublishAlertSheet({
  open,
  onClose,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  onPublished: (title: string) => void;
}) {
  const [severity, setSeverity] = useState<'info' | 'warning' | 'severe'>('warning');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [routeId, setRouteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/v1/admin/alerts', {
        kind: severity === 'severe' ? 'road_closure' : 'delay',
        severity,
        title: title.trim(),
        body: body.trim(),
        routeId: routeId.trim() || undefined,
        expiresInHours: 12,
      });
      onPublished(title.trim());
      setTitle('');
      setBody('');
      setRouteId('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Publish a service alert"
      subtitle="Goes out live to every passenger on the route"
      footer={
        <Button
          block
          size="lg"
          disabled={busy || title.trim().length < 4 || body.trim().length < 4}
          onClick={publish}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={2.3} />}
          Publish now
        </Button>
      }
    >
      <div className="space-y-3 pb-2">
        <Segmented
          value={severity}
          onChange={setSeverity}
          options={[
            { value: 'info', label: 'Notice' },
            { value: 'warning', label: 'Disruption' },
            { value: 'severe', label: 'Severe' },
          ]}
        />

        <TextField
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Landslide near Narkanda"
        />

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="What has happened, what it means for passengers, and when the next update is due."
          className="w-full resize-none rounded-field border border-line bg-surface px-3 py-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-4 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />

        <TextField
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
          placeholder="Route id, e.g. R-07L (optional)"
          inputClassName="font-mono text-[13px]"
        />

        {error && (
          <Notice tone="bad" icon={<AlertTriangle size={14} strokeWidth={2.4} />}>
            {error}
          </Notice>
        )}

        <Notice tone="neutral">
          Published under your name and role. Alerts expire after twelve hours unless withdrawn.
        </Notice>
      </div>
    </Sheet>
  );
}

/* ------------------------------ CSV route import -------------------------- */

const SAMPLE_CSV = `route_id,short_name,long_name,category,operator,distance_km,duration_min,fare_inr,departures,stop_ids
R-90X,90X,Shimla → Solan Express,express,HRTC,46,95,120,07:15|13:15|18:15,HP-SML-001|HP-KDG-001|HP-SOL-001`;

function ImportRoutesSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: string[]; errors: Array<{ line: number; message: string }>; note?: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post<{ imported: string[]; errors: Array<{ line: number; message: string }>; note?: string }>(
        '/api/v1/admin/routes/import',
        { csv },
      );
      setResult(res);
      if (res.imported.length) onImported(res.imported.length);
    } catch (err) {
      setResult({ imported: [], errors: [{ line: 0, message: err instanceof Error ? err.message : 'Import failed' }] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Bulk import routes"
      subtitle="CSV — one row per route, stops piped in order"
      footer={
        <Button block size="lg" disabled={busy || csv.trim().length < 20} onClick={run}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} strokeWidth={2.3} />}
          Import
        </Button>
      }
    >
      <div className="space-y-3 pb-2">
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          spellCheck={false}
          className="w-full resize-none rounded-field border border-line bg-surface px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-ink outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />

        {result && (
          <>
            {result.imported.length > 0 && (
              <Notice tone="ok">
                Imported {result.imported.join(', ')}.{result.note ? ` ${result.note}` : ''}
              </Notice>
            )}
            {result.errors.map((e) => (
              <Notice key={`${e.line}-${e.message}`} tone="bad">
                {e.line > 0 ? `Line ${e.line}: ` : ''}
                {e.message}
              </Notice>
            ))}
          </>
        )}

        <Notice tone="neutral">
          Stops must already exist. The route alignment is drawn by joining them in order, which is
          enough to measure progress but is not a surveyed road geometry.
        </Notice>
      </div>
    </Sheet>
  );
}
