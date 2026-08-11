import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Loader2,
  QrCode,
  ScanLine,
  X,
  Zap,
} from 'lucide-react';
import type { Stop } from '@/types';
import { DockedSheet, Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { StateBlock } from '@/components/ui/States';
import { BusRow } from '@/components/transit/BusCard';
import { useDepartures } from '@/hooks/useLive';
import { useApp } from '@/store/AppState';
import { DEMO_QR_CODES, resolveByQr } from '@/services/location';
import { routesServingStop } from '@/data/routes';

type Phase = 'scanning' | 'resolving' | 'found' | 'error';

/**
 * QR stop scanner.
 *
 * The most reliable location method in the whole app: a printed plate resolves
 * to an exact stop id in one action, with no satellites, no typing and no
 * connection needed to identify *which* stop you are at. It is the answer to
 * the "GPS is unreliable in the hills" problem, not a novelty.
 *
 * A real build wires `BarcodeDetector` (or jsQR as a fallback) to a camera
 * stream here; the payload it produces goes to the same `resolveByQr`.
 */
export function QrScannerScreen() {
  const navigate = useNavigate();
  const { setLocation } = useApp();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [stop, setStop] = useState<Stop | null>(null);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');

  const departures = useDepartures(stop?.id, 4);

  const scan = (payload: string) => {
    setPhase('resolving');
    resolveByQr(payload).then((r) => {
      if (r.ok && r.stop && r.location) {
        setStop(r.stop);
        setLocation(r.location);
        setPhase('found');
      } else {
        setPhase('error');
      }
    });
  };

  const reset = () => {
    setStop(null);
    setPhase('scanning');
    setCode('');
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#0C1424]">
      {/* ----------------------------- viewfinder ---------------------------- */}
      <Viewfinder phase={phase} />

      {/* ------------------------------- chrome ------------------------------ */}
      <div className="relative z-10 flex shrink-0 items-center gap-2 p-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur"
        >
          <ChevronLeft size={20} strokeWidth={2.4} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold text-white">Scan stop code</div>
          <div className="text-[11.5px] text-white/55">Point at the plate on the bus stop</div>
        </div>
        <button
          onClick={() => setManual(true)}
          aria-label="Enter code manually"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur"
        >
          <Keyboard size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="flex-1" />

      {/* ------------------------------- results ----------------------------- */}
      <div className="relative z-10 shrink-0">
        {phase === 'found' && stop ? (
          <DockedSheet>
            <div className="px-4 pb-4">
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok-bg text-ok">
                  <CheckCircle2 size={19} strokeWidth={2.4} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ok">
                    Stop identified
                  </div>
                  <div className="mt-0.5 truncate font-display text-[18px] font-extrabold leading-tight text-ink">
                    {stop.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11.5px] text-ink-4">{stop.id}</span>
                    <Badge tone="ok">±5 m · no GPS used</Badge>
                  </div>
                </div>
                <button
                  onClick={reset}
                  aria-label="Scan another"
                  className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-3"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {stop.platforms && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {stop.platforms.map((p) => (
                    <span
                      key={p}
                      className="rounded-[6px] border border-line bg-surface-3 px-1.5 py-[2px] text-[11px] font-semibold text-ink-2"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3.5 border-t border-line pt-2.5">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[12.5px] font-bold text-ink">Next departures</span>
                  <span className="text-[11px] text-ink-4">
                    {routesServingStop(stop.id).length} routes
                  </span>
                </div>

                {departures.length > 0 ? (
                  <div className="-mx-4 divide-y divide-line">
                    {departures.map(({ live, prediction }) => (
                      <BusRow key={live.bus.id} live={live} prediction={prediction} />
                    ))}
                  </div>
                ) : (
                  <StateBlock
                    compact
                    icon={<QrCode size={19} strokeWidth={2} />}
                    title="No live buses right now"
                    body="The stop was identified, but nothing is currently en route to it."
                  />
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={reset}>
                  Scan another
                </Button>
                <Link
                  to={`/stop/${stop.id}`}
                  className="flex h-11 items-center justify-center gap-1 rounded-field bg-brand-600 text-[14px] font-semibold text-white"
                >
                  Full stop details
                  <ChevronRight size={15} strokeWidth={2.5} />
                </Link>
              </div>
            </div>
          </DockedSheet>
        ) : phase === 'error' ? (
          <DockedSheet>
            <div className="px-4 pb-4">
              <StateBlock
                compact
                tone="warn"
                icon={<QrCode size={20} strokeWidth={2} />}
                title="Code not recognised"
                body="That is not a HimGati stop plate, or the code is damaged. Every plate also has its stop id printed underneath — you can type that instead."
                actions={
                  <>
                    <Button block onClick={() => setManual(true)}>
                      <Keyboard size={15} strokeWidth={2.3} />
                      Type the code
                    </Button>
                    <Button variant="secondary" block onClick={reset}>
                      Try scanning again
                    </Button>
                  </>
                }
              />
            </div>
          </DockedSheet>
        ) : (
          <DemoPlates onPick={scan} busy={phase === 'resolving'} />
        )}
      </div>

      {/* --------------------------- manual entry ---------------------------- */}
      <Sheet
        open={manual}
        onClose={() => setManual(false)}
        title="Enter the stop code"
        subtitle="Printed under the QR on every plate"
        footer={
          <Button
            block
            size="lg"
            disabled={code.trim().length < 4}
            onClick={() => {
              setManual(false);
              scan(code);
            }}
          >
            Find this stop
          </Button>
        }
      >
        <TextField
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="HP-SML-001"
          icon={<Keyboard size={17} strokeWidth={2.2} />}
          autoCapitalize="characters"
          inputClassName="font-mono"
        />
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
          Stop codes look like <span className="font-mono font-semibold">HP-SML-001</span>. The
          four-digit SMS code from the plate works too.
        </p>
      </Sheet>
    </div>
  );
}

/* ------------------------------- viewfinder ------------------------------- */

function Viewfinder({ phase }: { phase: Phase }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* stand-in for the camera feed */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,#22304A_0%,#0C1424_72%)]" />

      <div className="absolute inset-0 flex items-center justify-center pb-24">
        <div className="relative h-[210px] w-[210px]">
          {/* corner brackets */}
          {[
            'left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[18px]',
            'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[18px]',
            'left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-[18px]',
            'right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-[18px]',
          ].map((cls) => (
            <span
              key={cls}
              className={`absolute h-11 w-11 border-white/85 ${cls}`}
            />
          ))}

          {/* sweeping scan line */}
          {phase === 'scanning' && (
            <span className="absolute inset-x-4 top-0 h-[2px] animate-[himgati-scan_2.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-brand-300 to-transparent" />
          )}

          {phase === 'resolving' && (
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={34} strokeWidth={2.2} className="animate-spin text-white/80" />
            </span>
          )}

          {phase === 'scanning' && (
            <span className="absolute inset-0 flex items-center justify-center">
              <ScanLine size={40} strokeWidth={1.4} className="text-white/22" />
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes himgati-scan {
          0%, 100% { transform: translateY(8px); opacity: 0; }
          12% { opacity: 1; }
          50% { transform: translateY(198px); opacity: 1; }
          88% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------- demo plates ------------------------------ */

function DemoPlates({ onPick, busy }: { onPick: (id: string) => void; busy: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <DockedSheet>
      <div className="px-4 pb-4">
        <div className="flex items-start gap-2">
          <Zap size={15} strokeWidth={2.4} className="mt-0.5 shrink-0 text-brand-600" />
          <div>
            <div className="text-[13px] font-bold text-ink">No plate to hand?</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
              These stand in for the QR plates installed at the stands. Tap one to see exactly what
              a scan produces.
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {DEMO_QR_CODES.map((c) => (
            <button
              key={c.id}
              disabled={busy}
              onClick={() => onPick(c.id)}
              className="flex items-center gap-2 rounded-field border border-line bg-surface px-2.5 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-ink text-white">
                <QrCode size={15} strokeWidth={2.3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold text-ink">{c.label}</span>
                <span className="block truncate font-mono text-[10px] text-ink-4">{c.id}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </DockedSheet>
  );
}

