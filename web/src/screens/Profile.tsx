import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Accessibility,
  Bell,
  Bookmark,
  Briefcase,
  ChevronRight,
  Download,
  Eye,
  Gauge,
  Headphones,
  HelpCircle,
  Home,
  Leaf,
  MapPin,
  MessageSquare,
  Phone,
  Route as RouteIcon,
  Shield,
  Star,
  UserRound,
  Volume2,
  Wifi,
} from 'lucide-react';
import type { JourneyPreference } from '@/types';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, List, ListRow, SectionHeader } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/store/AppState';
import { PREFERENCE_LABEL } from '@/services/journey';
import { STOP_BY_ID } from '@/data/stops';
import { ROUTE_BY_ID } from '@/data/routes';
import { OFFLINE_PACKS } from '@/data/alerts';
import { storageUsedMb } from '@/services/offline';
import { PLACE_BY_ID } from '@/data/places';
import { TRIPS, summarise } from '@/data/trips';
import { kg } from '@/lib/format';
import { cn } from '@/lib/cn';

const PREFERENCES: JourneyPreference[] = ['fastest', 'cheapest', 'fewest-transfers', 'most-sustainable'];

const PREFERENCE_HINT: Record<JourneyPreference, string> = {
  fastest: 'Shortest total door-to-door time.',
  cheapest: 'Lowest fare, even if it takes longer.',
  'fewest-transfers': 'Fewest changes — easier with luggage or children.',
  'most-sustainable': 'Prefers electric and CNG vehicles where they run.',
};

const SAVED_ICON = { home: Home, work: Briefcase, star: Star } as const;

/**
 * Profile.
 *
 * Preferences here are real inputs, not decoration: `travelMode` seeds the
 * journey planner's default sort, and the accessibility toggles feed the same
 * filters the planner uses.
 */
export function ProfileScreen() {
  const {
    user,
    setTravelMode,
    toggleLowData,
    updateAccessibility,
    updateNotification,
    savedRouteIds,
    savedPlaceIds,
    unreadAlerts,
  } = useApp();

  const [sheet, setSheet] = useState<null | 'privacy' | 'help'>(null);

  const stats = summarise(TRIPS);
  const storage = storageUsedMb(OFFLINE_PACKS);

  return (
    <Screen>
      <ScreenHeader back={false} large title="Profile" />

      <ScreenBody className="pt-1">
        <Stack>
          {/* ------------------------------ identity --------------------------- */}
          <Card>
            <div className="flex items-center gap-3.5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-brand-50 font-display text-[20px] font-extrabold text-brand-700">
                {user.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[18px] font-extrabold leading-tight text-ink">
                  {user.name}
                </div>
                <div className="mt-0.5 text-[12.5px] text-ink-3">{user.phone}</div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Badge tone="brand">
                    <Leaf size={9} strokeWidth={2.8} />
                    {kg(stats.co2SavedKg)} saved
                  </Badge>
                  <Badge>{stats.trips} trips</Badge>
                </div>
              </div>
              {/* Was the app's own bus logo, which read as branding sitting in the
                  user's row rather than anything to do with them. */}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-3">
                <UserRound size={18} strokeWidth={2.2} />
              </span>
            </div>
          </Card>

          {/* --------------------------- travel preference --------------------- */}
          <section>
            <SectionHeader
              title="Preferred travel mode"
              hint="Sets the default sort in the journey planner"
            />
            <Card>
              <div className="grid grid-cols-2 gap-2">
                {PREFERENCES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setTravelMode(p)}
                    className={cn(
                      'rounded-field border px-3 py-2.5 text-left transition-colors',
                      user.travelMode === p
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-line bg-surface hover:border-line-strong',
                    )}
                  >
                    <div
                      className={cn(
                        'text-[13px] font-bold',
                        user.travelMode === p ? 'text-brand-800' : 'text-ink',
                      )}
                    >
                      {PREFERENCE_LABEL[p]}
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-3">
                {PREFERENCE_HINT[user.travelMode]}
              </p>
            </Card>
          </section>

          {/* ------------------------------- saved ----------------------------- */}
          <section>
            <SectionHeader title="Saved places" hint={`${user.savedPlaces.length} shortcuts`} />
            <List>
              {user.savedPlaces.map((sp) => {
                const Icon = SAVED_ICON[sp.icon];
                const stop = STOP_BY_ID.get(sp.stopId);
                return (
                  <ListRow
                    key={sp.id}
                    to={`/stop/${sp.stopId}`}
                    icon={<Icon size={15} strokeWidth={2.3} />}
                    title={sp.label}
                    subtitle={stop?.name}
                  />
                );
              })}
              {/* Points at the saved list, not the whole catalogue: this used to
                  link to Explore, which is the opposite of "the ones I kept". */}
              <ListRow
                to="/saved"
                icon={<Bookmark size={15} strokeWidth={2.3} />}
                title={
                  savedPlaceIds.length > 0
                    ? `${savedPlaceIds.length} saved destination${savedPlaceIds.length === 1 ? '' : 's'}`
                    : 'No saved destinations yet'
                }
                subtitle={
                  savedPlaceIds.length > 0
                    ? savedPlaceIds
                        .map((id) => PLACE_BY_ID.get(id)?.name)
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(', ')
                    : 'Bookmark a place to keep it here'
                }
              />
            </List>
          </section>

          <section>
            <SectionHeader
              title="Saved routes"
              hint={`${savedRouteIds.length} routes`}
              action="See all saved"
              actionTo="/saved"
            />
            <List>
              {savedRouteIds.map((id) => {
                const r = ROUTE_BY_ID.get(id);
                if (!r) return null;
                return (
                  <ListRow
                    key={id}
                    to={`/map?route=${id}`}
                    icon={<RouteIcon size={15} strokeWidth={2.3} />}
                    title={
                      <span className="flex items-center gap-2">
                        <span className="rounded-[5px] bg-ink px-1.5 py-[1px] text-[10.5px] font-extrabold text-white">
                          {r.shortName}
                        </span>
                        {r.longName}
                      </span>
                    }
                    subtitle={`${r.operator} · ${r.stopIds.length} stops`}
                  />
                );
              })}
            </List>
          </section>

          {/* --------------------------- notifications ------------------------- */}
          <section>
            <SectionHeader title="Notifications" />
            <Card padded={false} className="divide-y divide-line">
              {(
                [
                  ['arrival', 'Bus arriving', 'Buzz at 10 minutes and 5 minutes away'],
                  ['delays', 'Delays', 'When a bus you track falls behind'],
                  ['disruptions', 'Disruptions', 'Cancellations, diversions and road closures'],
                  ['weather', 'Weather', 'Snow and landslide warnings on your routes'],
                ] as const
              ).map(([key, label, hint]) => (
                <div key={key} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-3">{hint}</span>
                  </span>
                  <Toggle
                    checked={user.notifications[key]}
                    onChange={(v) => updateNotification(key, v)}
                    label={label}
                  />
                </div>
              ))}
            </Card>
            <Link
              to="/alerts"
              className="mt-2 flex items-center gap-2 rounded-field border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <Bell size={15} strokeWidth={2.3} className="shrink-0 text-ink-2" />
              <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink">
                View all alerts
              </span>
              {unreadAlerts > 0 && (
                <Badge tone="bad">{unreadAlerts} new</Badge>
              )}
              <ChevronRight size={15} className="shrink-0 text-ink-4" />
            </Link>
          </section>

          {/* --------------------------- accessibility ------------------------- */}
          <section>
            <SectionHeader
              title="Accessibility"
              hint="These change what the app shows, not just how it looks"
            />
            <Card padded={false} className="divide-y divide-line">
              {(
                [
                  ['largeText', 'Larger text', 'Increase type size across the app', Eye],
                  ['highContrast', 'High contrast', 'Stronger borders and darker text', Gauge],
                  [
                    'stepFreeOnly',
                    'Step-free journeys only',
                    'Hide services without wheelchair access',
                    Accessibility,
                  ],
                  [
                    'voiceAnnouncements',
                    'Voice announcements',
                    'Read out the next stop and ETA',
                    Volume2,
                  ],
                ] as const
              ).map(([key, label, hint, Icon]) => (
                <div key={key} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-3 text-ink-2">
                    <Icon size={15} strokeWidth={2.3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-3">{hint}</span>
                  </span>
                  <Toggle
                    checked={user.accessibility[key]}
                    onChange={(v) => updateAccessibility(key, v)}
                    label={label}
                  />
                </div>
              ))}
            </Card>
          </section>

          {/* ------------------------------- data ------------------------------ */}
          <section>
            <SectionHeader title="Data & offline" />
            <Card padded={false} className="divide-y divide-line">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-3 text-ink-2">
                  <Wifi size={15} strokeWidth={2.3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-ink">Low data mode</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-3">
                    Text only, no map tiles. Under 1 MB per hour.
                  </span>
                </span>
                <Toggle checked={user.lowDataMode} onChange={toggleLowData} label="Low data mode" />
              </div>
              <ListRow
                to="/offline"
                icon={<Download size={15} strokeWidth={2.3} />}
                title="Offline maps and timetables"
                subtitle={`${storage} MB downloaded`}
              />
            </Card>
          </section>

          {/* ------------------------------- more ------------------------------ */}
          <section>
            <SectionHeader title="More" />
            <List>
              <ListRow
                to="/impact"
                icon={<Leaf size={15} strokeWidth={2.3} />}
                title="Your travel impact"
                subtitle="CO₂ saved, fuel mix, monthly trend"
              />
              <ListRow
                to="/locate"
                icon={<MapPin size={15} strokeWidth={2.3} />}
                title="Location methods"
                subtitle="Six ways to find your stop without GPS"
              />
              {/* These two were wired to `() => undefined` — they looked like
                  rows you could open and did nothing at all when tapped. */}
              <ListRow
                icon={<Shield size={15} strokeWidth={2.3} />}
                title="Privacy"
                subtitle="What we collect, and what we never store"
                onClick={() => setSheet('privacy')}
              />
              <ListRow
                icon={<HelpCircle size={15} strokeWidth={2.3} />}
                title="Help & support"
                subtitle="Helpline, SMS and the IVR line"
                onClick={() => setSheet('help')}
              />
            </List>
          </section>

          <div className="pb-2 text-center">
            <div className="text-[11.5px] font-semibold text-ink-3">Routify 1.0</div>
            <p className="mx-auto mt-1 max-w-[280px] text-[11px] leading-relaxed text-ink-4">
              Built on open transit data. Passenger positions are processed on your device and never
              sent to the server.
            </p>
          </div>
        </Stack>
      </ScreenBody>

      {/* ------------------------------- sheets ------------------------------- */}
      <Sheet
        open={sheet === 'privacy'}
        onClose={() => setSheet(null)}
        title="Privacy"
        subtitle="What leaves your phone, and what does not"
      >
        <div className="space-y-3 pb-2">
          {[
            {
              title: 'Your location stays on the device',
              body: 'Stop matching, nearby search and walk times are all computed locally. No position is sent to a server or retained.',
            },
            {
              title: 'No account, no tracking',
              body: 'There is no sign-in and no advertising identifier. Saved places and reviews live in this app only.',
            },
            {
              title: 'What we do fetch',
              body: 'Timetables, live vehicle positions and map tiles. Those requests carry no identifier that ties them to you.',
            },
          ].map((row) => (
            <Card key={row.title}>
              <div className="text-[13.5px] font-bold text-ink">{row.title}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{row.body}</p>
            </Card>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'help'}
        onClose={() => setSheet(null)}
        title="Help & support"
        subtitle="Including options that need no smartphone"
      >
        <div className="space-y-2.5 pb-2">
          {SUPPORT_CHANNELS.map((c) => (
            <Card key={c.label}>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
                  <c.icon size={17} strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold text-ink">{c.label}</div>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{c.body}</p>
                  <a
                    href={c.href}
                    className="mt-1.5 inline-block font-mono text-[12.5px] font-semibold text-brand-600"
                  >
                    {c.value}
                  </a>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
}

const SUPPORT_CHANNELS = [
  {
    label: 'HRTC helpline',
    body: 'Depot enquiries, lost property and complaints, 24 hours.',
    value: '0177-2658765',
    href: 'tel:01772658765',
    icon: Phone,
  },
  {
    label: 'Departures by SMS',
    body: 'Text BUS followed by the four-digit code printed at the stop.',
    value: 'BUS 0101 to 56070',
    href: 'sms:56070?body=BUS%200101',
    icon: MessageSquare,
  },
  {
    label: 'Voice line in Hindi',
    body: 'Reads out the next departures for any stop code. Built for passengers without a smartphone.',
    value: '1800-180-6070',
    href: 'tel:18001806070',
    icon: Headphones,
  },
] as const;
