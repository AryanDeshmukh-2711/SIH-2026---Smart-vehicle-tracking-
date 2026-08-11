import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bus,
  Check,
  ChevronRight,
  Crosshair,
  Landmark,
  Loader2,
  MapPin,
  QrCode,
  Search,
  SignalZero,
  X,
} from 'lucide-react';
import type { LatLng, LocationMethod, ResolvedLocation } from '@/types';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { Badge } from '@/components/ui/Badge';
import { StateBlock, Notice } from '@/components/ui/States';
import { TransitMap } from '@/components/map/TransitMap';
import { GreenStrip } from '@/components/transit/Green';
import { StopPicker } from './JourneyPlanner';
import { useApp } from '@/store/AppState';
import { useAsync } from '@/hooks/useLive';
import {
  METHOD_BLURB,
  METHOD_LABEL,
  resolveByGps,
  resolveByLandmark,
  resolveByPin,
  resolveByStop,
  searchLandmarks,
  type GpsFailure,
} from '@/services/location';
import { findVehicle, getNearbyStops } from '@/services/transit';
import { relativeAge } from '@/lib/eta';
import { formatDistance } from '@/lib/geo';
import { cn } from '@/lib/cn';

const METHODS: Array<{ id: LocationMethod; icon: typeof MapPin }> = [
  { id: 'gps', icon: Crosshair },
  { id: 'stop-search', icon: Search },
  { id: 'landmark', icon: Landmark },
  { id: 'map-pin', icon: MapPin },
  { id: 'qr', icon: QrCode },
  { id: 'route-number', icon: Bus },
];

/**
 * Smart location — the differentiator screen.
 *
 * The premise: in mountainous terrain GPS is one input among six, and often the
 * worst. Every method here resolves to the same `ResolvedLocation` shape and
 * every one states its own accuracy honestly, so the app can degrade from a
 * 5-metre QR fix to a 220-metre landmark guess without ever pretending the two
 * are equivalent.
 */
export function SmartLocationScreen() {
  const navigate = useNavigate();
  const { location, setLocation } = useApp();
  const [active, setActive] = useState<LocationMethod | null>(null);

  const nearby = useAsync(() => getNearbyStops(location.position, 6), [location.position.lat, location.position.lng]);

  const apply = (loc: ResolvedLocation) => {
    setLocation(loc);
    setActive(null);
  };

  return (
    <Screen>
      <ScreenHeader
        title="Set your location"
        subtitle="Six ways in — GPS is only one of them"
      />

      <ScreenBody className="pt-4">
        <Stack>
          {/* --------------------------- current fix -------------------------- */}
          <Card className="border-brand-200 bg-brand-50">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-600 text-white">
                <MapPin size={17} strokeWidth={2.3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.055em] text-brand-600">
                  Currently using
                </div>
                <div className="mt-0.5 truncate font-display text-[16px] font-bold text-brand-800">
                  {location.label}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">{METHOD_LABEL[location.method]}</Badge>
                  <span className="text-[11.5px] text-brand-700/80">
                    ±{location.accuracyM} m ·{' '}
                    {relativeAge((Date.now() - new Date(location.resolvedAt).getTime()) / 1000)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* ------------------------------ methods --------------------------- */}
          <section>
            <SectionHeader
              title="How should we find you?"
              hint="Each method states the accuracy it can honestly claim"
            />
            <div className="grid grid-cols-2 gap-2.5">
              {METHODS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => (id === 'qr' ? navigate('/scan') : setActive(id))}
                  className={cn(
                    'card flex flex-col items-start p-3.5 text-left transition-all',
                    'hover:border-line-strong hover:shadow-sm active:scale-[0.99]',
                    location.method === id && 'border-brand-300 bg-brand-50/60',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-[10px]',
                      location.method === id ? 'bg-brand-600 text-white' : 'bg-surface-3 text-ink-2',
                    )}
                  >
                    <Icon size={17} strokeWidth={2.2} />
                  </span>
                  <span className="mt-2.5 flex items-center gap-1 text-[13.5px] font-bold text-ink">
                    {METHOD_LABEL[id]}
                    {location.method === id && (
                      <Check size={13} strokeWidth={3} className="text-brand-600" />
                    )}
                  </span>
                  <span className="mt-1 text-[11.5px] leading-snug text-ink-3">
                    {METHOD_BLURB[id]}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* --------------------------- nearby stops ------------------------- */}
          <section>
            <SectionHeader title="Stops near your current position" />
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {(nearby.data ?? []).map(({ stop, distanceKm, walkMin, routes }) => (
                <button
                  key={stop.id}
                  onClick={() => apply(resolveByStop(stop.id))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-3 text-ink-2">
                    <MapPin size={15} strokeWidth={2.3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {stop.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {formatDistance(distanceKm)} · {walkMin} min walk ·{' '}
                      {routes.map((r) => r.shortName).join(', ')}
                    </span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-ink-4" />
                </button>
              ))}
              {nearby.status === 'loading' && (
                <div className="px-4 py-6 text-center text-[13px] text-ink-3">Finding stops…</div>
              )}
            </Card>
          </section>

          <Notice tone="neutral" icon={<SignalZero size={14} strokeWidth={2.3} />}>
            <span className="font-semibold">Why this matters.</span> On the Shimla–Manali corridor
            there are stretches where a phone holds no fix for twenty minutes at a time. An app that
            can only answer “where am I?” with GPS simply stops working there.
          </Notice>
        </Stack>
      </ScreenBody>

      <GpsSheet open={active === 'gps'} onClose={() => setActive(null)} onResolve={apply} />
      <StopPicker
        open={active === 'stop-search'}
        title="Which stop are you at?"
        onClose={() => setActive(null)}
        onPick={(stop) => apply(resolveByStop(stop.id))}
      />
      <LandmarkSheet open={active === 'landmark'} onClose={() => setActive(null)} onResolve={apply} />
      <MapPinSheet
        open={active === 'map-pin'}
        initial={location.position}
        onClose={() => setActive(null)}
        onResolve={apply}
      />
      <RouteNumberSheet open={active === 'route-number'} onClose={() => setActive(null)} />
    </Screen>
  );
}

/* ------------------------------- method 1: GPS ---------------------------- */

const GPS_FAILURE_COPY: Record<GpsFailure, { title: string; body: string }> = {
  denied: {
    title: 'Location permission is off',
    body: 'HimGati cannot read your position. You can turn it on in your browser settings, or simply use one of the other five methods — they work just as well.',
  },
  unavailable: {
    title: 'No satellite fix',
    body: 'Your device could not reach enough satellites. This is common in a valley or under heavy tree cover.',
  },
  timeout: {
    title: 'GPS took too long',
    body: 'The fix did not converge in time. Rather than guess, we would rather you pick a stop directly.',
  },
  inaccurate: {
    title: 'Fix is too imprecise to use',
    body: 'We got a position, but it is off by enough to send you to the wrong stop. A vague fix is worse than none, so we are not using it.',
  },
};

function GpsSheet({
  open,
  onClose,
  onResolve,
}: {
  open: boolean;
  onClose: () => void;
  onResolve: (l: ResolvedLocation) => void;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [failure, setFailure] = useState<GpsFailure>('unavailable');

  useEffect(() => {
    if (!open) {
      setState('idle');
      return;
    }
    setState('busy');
    resolveByGps().then((r) => {
      if (r.ok && r.location) {
        onResolve(r.location);
      } else {
        setFailure(r.failure ?? 'unavailable');
        setState('failed');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copy = GPS_FAILURE_COPY[failure];

  return (
    <Sheet open={open} onClose={onClose} title="Using GPS">
      {state === 'busy' ? (
        <StateBlock
          icon={<Loader2 size={24} strokeWidth={2.2} className="animate-spin" />}
          title="Getting a satellite fix"
          body="This usually takes a few seconds. If we cannot get one accurate enough to be useful, we will tell you rather than guess."
          tone="brand"
        />
      ) : (
        <>
          <StateBlock
            icon={<SignalZero size={24} strokeWidth={2} />}
            title={copy.title}
            body={copy.body}
            tone="warn"
          />
          <div className="space-y-2 pb-2">
            <Button variant="secondary" block onClick={onClose}>
              <Search size={15} strokeWidth={2.3} />
              Search a bus stop instead
            </Button>
            <Button variant="secondary" block onClick={onClose}>
              <Landmark size={15} strokeWidth={2.3} />
              Enter a landmark
            </Button>
            <Button variant="secondary" block onClick={onClose}>
              <MapPin size={15} strokeWidth={2.3} />
              Select on the map
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ---------------------------- method 2: landmark -------------------------- */

function LandmarkSheet({
  open,
  onClose,
  onResolve,
}: {
  open: boolean;
  onClose: () => void;
  onResolve: (l: ResolvedLocation) => void;
}) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => searchLandmarks(q, 8), [q]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Name something near you"
      subtitle="A temple, a bazaar, a hospital, a tunnel"
    >
      <TextField
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="e.g. Christ Church, Mall Road, Indira Market"
        icon={<Landmark size={17} strokeWidth={2.2} />}
        className="mb-3"
        trailing={
          q ? (
            <button onClick={() => setQ('')} aria-label="Clear" className="text-ink-4">
              <X size={15} strokeWidth={2.5} />
            </button>
          ) : undefined
        }
      />

      {q.trim().length < 2 ? (
        <div className="pb-2">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
            Common landmarks
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['Mall Road', 'Christ Church', 'Victory Tunnel', 'Indira Market', 'Kotwali Bazaar', 'Dhalpur Maidan'].map(
              (l) => (
                <button
                  key={l}
                  onClick={() => setQ(l)}
                  className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-ink-2"
                >
                  {l}
                </button>
              ),
            )}
          </div>
        </div>
      ) : matches.length === 0 ? (
        <StateBlock
          compact
          icon={<Landmark size={20} strokeWidth={2} />}
          title="No landmark matches that"
          body="Try a shorter word, or the name of the town you are in."
        />
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {matches.map((m, i) => (
            <button
              key={`${m.landmark}-${i}`}
              onClick={() => onResolve(resolveByLandmark(m))}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-3 text-ink-2">
                <Landmark size={14} strokeWidth={2.3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">
                  {m.landmark}
                </span>
                <span className="block truncate text-[11.5px] text-ink-3">
                  Nearest stop: {m.stop.name}
                </span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-ink-4" />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/* ---------------------------- method 3: map pin --------------------------- */

function MapPinSheet({
  open,
  initial,
  onClose,
  onResolve,
}: {
  open: boolean;
  initial: LatLng;
  onClose: () => void;
  onResolve: (l: ResolvedLocation) => void;
}) {
  const [pin, setPin] = useState<LatLng>(initial);

  useEffect(() => {
    if (open) setPin(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Drop a pin"
      subtitle="Tap anywhere on the map. Works with no signal at all."
      maxHeight="88%"
      footer={
        <Button block size="lg" onClick={() => onResolve(resolveByPin(pin))}>
          Use this location
        </Button>
      }
    >
      <div className="card h-[300px] overflow-hidden p-0">
        <TransitMap center={initial} zoom={12} pin={pin} onPickPoint={setPin} />
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-[11.5px] text-ink-3">
        <MapPin size={13} strokeWidth={2.4} className="text-brand-600" />
        <span className="font-mono tnum">
          {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
        </span>
        <span className="ml-auto text-ink-4">±30 m</span>
      </div>
    </Sheet>
  );
}

/* -------------------------- method 6: route number ------------------------ */

function RouteNumberSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof findVehicle>>>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ('');
      setResults([]);
      setSearched(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(() => {
      findVehicle(q).then((r) => {
        setResults(r);
        setSearched(true);
      });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Track by bus or route number"
      subtitle="No location needed at all"
    >
      <TextField
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="e.g. 42B or HP-01-4021"
        icon={<Bus size={17} strokeWidth={2.2} />}
        className="mb-3"
        autoCapitalize="characters"
      />

      {!q.trim() ? (
        <div className="pb-2">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
            Try
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['42B', '18A', 'HP-01-4021', 'HP-01-9012'].map((s) => (
              <button
                key={s}
                onClick={() => setQ(s)}
                className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 font-mono text-[12.5px] font-semibold text-ink-2"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : searched && results.length === 0 ? (
        <StateBlock
          compact
          icon={<Bus size={20} strokeWidth={2} />}
          title={`Nothing running as ${q.toUpperCase()}`}
          body="No vehicle with that number is currently in service. Check the number, or search the route instead."
        />
      ) : (
        <div className="space-y-2 pb-2">
          {results.map((lb) => (
            <Link key={lb.bus.id} to={`/bus/${lb.bus.id}`} className="card block p-3.5">
              <div className="flex items-center gap-2">
                <span className="rounded-[6px] bg-ink px-1.5 py-[2px] text-[11.5px] font-extrabold text-white">
                  {lb.route.shortName}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink">
                  {lb.bus.registration}
                </span>
                {lb.live.predictions[0] && (
                  <span className="shrink-0 text-[13px] font-bold text-brand-700 tnum">
                    {lb.live.predictions[0].etaMin} min
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-[12px] text-ink-3">{lb.route.longName}</div>
              <GreenStrip bus={lb.bus} score={lb.greenScore} className="mt-2" />
            </Link>
          ))}
        </div>
      )}
    </Sheet>
  );
}
