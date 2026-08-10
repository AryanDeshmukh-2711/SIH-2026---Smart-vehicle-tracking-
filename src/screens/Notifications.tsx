import { useMemo, useState } from 'react';
import { BellOff, CheckCheck } from 'lucide-react';
import type { AlertSeverity } from '@/types';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Badge';
import { StateBlock, Notice } from '@/components/ui/States';
import { AlertCard } from '@/components/transit/AlertCard';
import { useApp } from '@/store/AppState';
import { dayLabel } from '@/lib/format';

type Filter = 'all' | 'unread' | AlertSeverity;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'severe', label: 'Severe' },
  { id: 'warning', label: 'Disruptions' },
  { id: 'info', label: 'Notices' },
];

/**
 * Service alerts.
 *
 * Grouped by day and always attributed. The three severities map to how a
 * traveller should react: a severe alert means change your plan, a warning means
 * allow more time, a notice means read it when convenient.
 */
export function NotificationsScreen() {
  const { alerts, markAlertRead, markAllAlertsRead, unreadAlerts, user } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return alerts;
    if (filter === 'unread') return alerts.filter((a) => !a.read);
    return alerts.filter((a) => a.severity === filter);
  }, [alerts, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof alerts>();
    for (const a of filtered) {
      const key = dayLabel(a.issuedAt);
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const anyNotificationOn = Object.values(user.notifications).some(Boolean);

  return (
    <Screen>
      <ScreenHeader
        title="Notifications"
        subtitle={unreadAlerts > 0 ? `${unreadAlerts} unread` : 'All caught up'}
        actions={
          unreadAlerts > 0 ? (
            <button
              onClick={markAllAlertsRead}
              className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-600"
            >
              <CheckCheck size={14} strokeWidth={2.5} />
              Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="shrink-0 border-b border-line bg-surface px-4 pb-3">
        <ChipRow>
          {FILTERS.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
              {f.id === 'unread' && unreadAlerts > 0 && (
                <span className="ml-0.5 rounded-full bg-current/20 px-1 text-[10px] font-bold tnum">
                  {unreadAlerts}
                </span>
              )}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <ScreenBody className="pt-4">
        <Stack>
          {!anyNotificationOn && (
            <Notice tone="warn" icon={<BellOff size={14} strokeWidth={2.3} />}>
              All push notifications are switched off in your profile, so you will only see alerts
              when you open the app.
            </Notice>
          )}

          {filtered.length === 0 ? (
            <StateBlock
              icon={<BellOff size={24} strokeWidth={1.9} />}
              title={filter === 'unread' ? 'Nothing unread' : 'No alerts here'}
              body={
                filter === 'unread'
                  ? 'You have read every alert on your routes. We will buzz you when something changes.'
                  : 'No alerts of this kind on your saved routes right now.'
              }
              tone="brand"
              actions={
                filter !== 'all' ? (
                  <Chip active onClick={() => setFilter('all')}>
                    Show everything
                  </Chip>
                ) : undefined
              }
            />
          ) : (
            grouped.map(([label, list]) => (
              <section key={label}>
                <SectionHeader title={label} />
                <div className="space-y-2.5">
                  {list.map((a) => (
                    <AlertCard key={a.id} alert={a} onRead={markAlertRead} />
                  ))}
                </div>
              </section>
            ))
          )}

          <p className="text-[11px] leading-relaxed text-ink-4">
            Alerts come from HRTC control rooms, depot staff, the state disaster management
            authority and the met department. Each card names its source — a crowd-sourced delay
            report and an official road closure are not the same kind of claim.
          </p>
        </Stack>
      </ScreenBody>
    </Screen>
  );
}
