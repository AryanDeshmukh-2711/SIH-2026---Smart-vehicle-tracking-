import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Signal, Wifi, WifiOff } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { useApp } from '@/store/AppState';
import { hhmm24 } from '@/lib/format';
import { cn } from '@/lib/cn';
import { SCREEN_DIRECTORY } from '@/screens/directory';

/** Routes that own the whole frame and hide the tab bar. */
const FULL_BLEED = ['/map', '/scan'];

/* ------------------------------- status bar ------------------------------- */

function StatusBar() {
  const { online, offlineMode } = useApp();
  const [clock, setClock] = useState(() => hhmm24(new Date()));

  useEffect(() => {
    const t = setInterval(() => setClock(hhmm24(new Date())), 15_000);
    return () => clearInterval(t);
  }, []);

  const offline = offlineMode || !online;

  return (
    <div className="flex h-[38px] shrink-0 items-center justify-between bg-surface px-6 pt-1.5 text-ink">
      <span className="font-display text-[13px] font-bold tnum">{clock}</span>
      <div className="flex items-center gap-1.5">
        <Signal size={13} strokeWidth={2.6} className={offline ? 'text-ink-4' : ''} />
        {offline ? (
          <WifiOff size={13} strokeWidth={2.4} className="text-warn" />
        ) : (
          <Wifi size={13} strokeWidth={2.4} />
        )}
        <span className="ml-0.5 flex h-[11px] w-[22px] items-center rounded-[3px] border border-ink/40 p-[1.5px]">
          <span className="h-full w-[72%] rounded-[1px] bg-ink" />
        </span>
      </div>
    </div>
  );
}

/* ------------------------------ offline strip ----------------------------- */

function ConnectivityStrip() {
  const { online, offlineMode, lastSync } = useApp();
  if (online && !offlineMode) return null;

  const ageMin = Math.max(0, Math.round((Date.now() - lastSync.getTime()) / 60_000));

  return (
    <div className="flex shrink-0 items-center justify-center gap-1.5 bg-warn px-3 py-[5px] text-[11.5px] font-semibold text-white">
      <WifiOff size={12} strokeWidth={2.6} />
      {offlineMode ? 'Offline mode' : 'No connection'} · showing saved data from {ageMin} min ago
    </div>
  );
}

/* -------------------------------- the frame -------------------------------- */

export function AppShell() {
  const { pathname } = useLocation();
  const fullBleed = FULL_BLEED.some((p) => pathname.startsWith(p));

  return (
    <div className="flex h-full w-full justify-center bg-[#101725] lg:gap-8 lg:p-8">
      <ScreenDirectory />

      <div
        className={cn(
          'relative flex w-full flex-col overflow-hidden bg-surface',
          'lg:h-[860px] lg:w-[404px] lg:shrink-0 lg:rounded-[44px] lg:border-[9px] lg:border-[#1B2436]',
          'lg:shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)]',
        )}
      >
        <div className="hidden lg:block">
          <StatusBar />
        </div>

        <ConnectivityStrip />

        <main className="relative flex min-h-0 flex-1 flex-col">
          <Outlet />
        </main>

        {!fullBleed && <BottomNav />}
      </div>

      <DesktopAside />
    </div>
  );
}

/* --------------------------- desktop-only chrome --------------------------- */

/**
 * Screen index, shown only on wide viewports.
 *
 * A reviewer looking at this cold should be able to reach any of the eighteen
 * screens without guessing at a navigation path. It is deliberately outside the
 * device frame — it is not part of the product.
 */
function ScreenDirectory() {
  return (
    <aside className="hidden w-[228px] shrink-0 flex-col lg:flex">
      <div className="mb-5 px-2">
        <div className="flex items-center gap-2">
          <Logo />
          <div>
            <div className="font-display text-[15px] font-extrabold leading-none text-white">
              HimGati
            </div>
            <div className="mt-1 text-[10.5px] leading-none text-white/45">
              Smart transit · Himachal
            </div>
          </div>
        </div>
      </div>

      <div className="scroll-area min-h-0 flex-1 pr-1">
        {SCREEN_DIRECTORY.map((group) => (
          <div key={group.group} className="mb-4">
            <div className="mb-1.5 px-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-white/35">
              {group.group}
            </div>
            <div className="space-y-[1px]">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-[8px] px-2 py-[6px] text-[12px] font-medium transition-colors',
                      isActive
                        ? 'bg-white/12 text-white'
                        : 'text-white/55 hover:bg-white/6 hover:text-white/85',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function DesktopAside() {
  return (
    <aside className="hidden w-[228px] shrink-0 flex-col justify-end pb-2 xl:flex">
      <div className="rounded-[14px] border border-white/10 bg-white/[0.04] p-3.5">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/40">
          Demo notes
        </div>
        <ul className="mt-2 space-y-2 text-[11.5px] leading-relaxed text-white/60">
          <li>
            Live positions come from a built-in fleet simulator running at 12×
            speed, standing in for the AIS-140 → MQTT → GTFS-RT pipeline.
          </li>
          <li>
            Bus <span className="font-semibold text-white/80">HP-01-3312</span> passes through a
            modelled dead zone between Sundernagar and Mandi — watch it drop to{' '}
            <span className="font-semibold text-white/80">Signal lost</span> and recover.
          </li>
          <li>
            <span className="font-semibold text-white/80">HP-52-0456</span> is cancelled and{' '}
            <span className="font-semibold text-white/80">HP-52-1187</span> is running 14 min late.
          </li>
        </ul>
      </div>
    </aside>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--color-brand-600)" />
      <path d="M6 22.5 12 13l4.2 5.6L20 12.5l6 10z" fill="#fff" fillOpacity="0.28" />
      <rect x="9.5" y="15" width="13" height="9.5" rx="2.6" fill="#fff" />
      <rect x="11.2" y="17" width="9.6" height="3.6" rx="1.1" fill="var(--color-brand-600)" />
      <circle cx="12.6" cy="23.2" r="1.15" fill="var(--color-brand-700)" />
      <circle cx="19.4" cy="23.2" r="1.15" fill="var(--color-brand-700)" />
    </svg>
  );
}
