import { NavLink, useLocation } from 'react-router-dom';
import { Compass, Home, Route as RouteIcon, Search, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useApp } from '@/store/AppState';

const TABS = [
  { to: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { to: '/search', label: 'Search', icon: Search, match: (p: string) => p.startsWith('/search') },
  {
    to: '/explore',
    label: 'Explore',
    icon: Compass,
    match: (p: string) => p.startsWith('/explore') || p.startsWith('/place') || p.startsWith('/itinerary'),
  },
  {
    to: '/trips',
    label: 'Trips',
    icon: RouteIcon,
    match: (p: string) => p.startsWith('/trips') || p.startsWith('/impact'),
  },
  { to: '/profile', label: 'Profile', icon: User, match: (p: string) => p.startsWith('/profile') },
];

/**
 * Five-tab bar. The active state is a filled icon plus a hairline indicator —
 * not a coloured bubble. At this size a bubble dominates the screen and makes
 * the bar feel like the point of the app rather than a way out of it.
 */
export function BottomNav() {
  const { pathname } = useLocation();
  const { unreadAlerts } = useApp();

  return (
    <nav className="relative z-30 shrink-0 border-t border-line bg-surface/95 backdrop-blur-md">
      <div className="flex pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className="relative flex flex-1 flex-col items-center gap-[3px] py-1.5 focus-ring rounded-lg"
            >
              <span
                className={cn(
                  'absolute -top-1.5 h-[2.5px] w-7 rounded-full transition-all duration-200',
                  active ? 'bg-brand-600 opacity-100' : 'opacity-0',
                )}
              />
              <span className="relative">
                <Icon
                  size={21}
                  strokeWidth={active ? 2.4 : 1.9}
                  className={cn('transition-colors', active ? 'text-brand-600' : 'text-ink-4')}
                  fill={active ? 'currentColor' : 'none'}
                  fillOpacity={active ? 0.12 : 0}
                />
                {tab.to === '/profile' && unreadAlerts > 0 && (
                  <span className="absolute -right-1 -top-0.5 h-[7px] w-[7px] rounded-full border-[1.5px] border-surface bg-bad" />
                )}
              </span>
              <span
                className={cn(
                  'text-[10.5px] leading-none transition-colors',
                  active ? 'font-bold text-brand-700' : 'font-medium text-ink-4',
                )}
              >
                {tab.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
