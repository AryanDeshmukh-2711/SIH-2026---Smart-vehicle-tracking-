import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, ChevronRight, Info, Leaf, TreePine, TrendingDown, Zap } from 'lucide-react';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, SectionHeader, Stat } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { BarChart, Ring } from '@/components/ui/Meters';
import { Notice } from '@/components/ui/States';
import { FuelBadge } from '@/components/transit/Green';
import { TRIPS, summarise, tripsWithin } from '@/data/trips';
import {
  EMISSION_FACTORS,
  GREEN_ASSUMPTIONS,
  TREE_ABSORPTION_KG_PER_YEAR,
  busEmissionFactor,
  treesEquivalent,
} from '@/lib/green';
import { kg, rupees } from '@/lib/format';
import type { FuelType } from '@/types';

type TimeRange = '30' | '90' | 'all';

/**
 * Sustainability dashboard.
 *
 * Every figure is summed from the trip history rather than stored, and every
 * assumption behind those figures is printed on this page. The brief and the
 * SRS both insist these are marked as estimates — an unqualified "24.6 kg saved"
 * is a claim the app cannot substantiate, and a transport department reviewing
 * this would be right to reject it.
 */
export function SustainabilityScreen() {
  const [range, setRange] = useState<TimeRange>('30');

  const trips = useMemo(() => {
    if (range === 'all') return TRIPS;
    return tripsWithin(TRIPS, range === '30' ? 30 : 90);
  }, [range]);

  const summary = useMemo(() => summarise(trips), [trips]);

  /** Weekly CO₂ series for the chart, oldest week first. */
  const weekly = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0, 0];
    const now = Date.now();
    for (const t of TRIPS) {
      const weeksAgo = Math.floor((now - new Date(t.date).getTime()) / (7 * 86_400_000));
      if (weeksAgo < 6) buckets[5 - weeksAgo] += t.co2SavedKg;
    }
    return buckets.map((v, i) => ({
      label: i === 5 ? 'This wk' : `${5 - i}w`,
      value: Math.round(v * 10) / 10,
      highlight: i === 5,
    }));
  }, []);

  /** Split of distance travelled by fuel type. */
  const byFuel = useMemo(() => {
    const map = new Map<FuelType, number>();
    for (const t of trips) map.set(t.fuel, (map.get(t.fuel) ?? 0) + t.distanceKm);
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(map.entries())
      .map(([fuel, km]) => ({ fuel, km: Math.round(km * 10) / 10, share: km / total }))
      .sort((a, b) => b.km - a.km);
  }, [trips]);

  const trees = treesEquivalent(summary.co2SavedKg);
  const carEquivalent = EMISSION_FACTORS.carPetrolSolo * summary.distanceKm;
  const busEmitted = trips.reduce((s, t) => s + busEmissionFactor(t.fuel) * t.distanceKm, 0);

  return (
    <Screen>
      <ScreenHeader
        title="Your travel impact"
        subtitle="Summed from your journey history"
        actions={
          <Link
            to="/trips"
            className="text-[12.5px] font-semibold text-brand-600"
          >
            Trips
          </Link>
        }
      />

      <div className="shrink-0 border-b border-line bg-surface px-4 pb-3">
        <Segmented<TimeRange>
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: '90 days' },
            { value: 'all', label: 'All time' },
          ]}
        />
      </div>

      <ScreenBody className="pt-4">
        <Stack>
          {/* ------------------------------ headline --------------------------- */}
          <Card>
            <div className="flex items-center gap-4">
              <Ring
                value={Math.min(100, (summary.co2SavedKg / 40) * 100)}
                size={96}
                stroke={8}
                color="var(--color-ok)"
                label={summary.co2SavedKg.toFixed(1)}
                sublabel="kg CO₂"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
                  Estimated CO₂ avoided
                </div>
                <div className="mt-1 font-display text-[17px] font-bold leading-snug text-ink">
                  About the same as {trees} tree{trees === 1 ? '' : 's'} absorb in a year
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <TreePine size={13} strokeWidth={2.3} className="text-ok" />
                  <span className="text-[11.5px] text-ink-3">
                    at {TREE_ABSORPTION_KG_PER_YEAR} kg per tree per year
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3.5">
              <Stat label="Bus trips" value={String(summary.trips)} />
              <Stat label="Distance" value={`${Math.round(summary.distanceKm)} km`} />
              <Stat label="Spent" value={rupees(summary.fareInr)} />
            </div>
          </Card>

          {/* ---------------------------- bus vs car --------------------------- */}
          <section>
            <SectionHeader
              title="Bus versus driving alone"
              hint={`Over the ${Math.round(summary.distanceKm)} km you travelled`}
            />
            <Card>
              <div className="space-y-3">
                <Comparison
                  icon={<Car size={15} strokeWidth={2.3} />}
                  label="Petrol car, one occupant"
                  value={carEquivalent}
                  max={carEquivalent}
                  tone="bad"
                  note={`${EMISSION_FACTORS.carPetrolSolo} kg CO₂/km`}
                />
                <Comparison
                  icon={<Leaf size={15} strokeWidth={2.3} />}
                  label="The buses you actually took"
                  value={busEmitted}
                  max={carEquivalent}
                  tone="ok"
                  note="weighted by the fuel of each vehicle"
                />
              </div>

              <div className="mt-3.5 flex items-center gap-2 rounded-field bg-ok-bg px-3 py-2.5">
                <TrendingDown size={16} strokeWidth={2.4} className="shrink-0 text-ok" />
                <span className="text-[12.5px] font-semibold text-ok">
                  {Math.round((1 - busEmitted / (carEquivalent || 1)) * 100)}% lower emissions than
                  driving those journeys alone
                </span>
              </div>
            </Card>
          </section>

          {/* ------------------------------ trend ------------------------------ */}
          <section>
            <SectionHeader title="Weekly trend" hint="CO₂ avoided per week, last six weeks" />
            <Card>
              <BarChart data={weekly} unit="" height={112} />
            </Card>
          </section>

          {/* --------------------------- fuel breakdown ------------------------ */}
          <section>
            <SectionHeader
              title="What you travelled on"
              hint="Distance by vehicle fuel type"
            />
            <Card>
              <div className="space-y-3">
                {byFuel.map(({ fuel, km, share }) => (
                  <div key={fuel}>
                    <div className="flex items-center justify-between gap-2">
                      <FuelBadge fuel={fuel} />
                      <span className="text-[12px] font-bold text-ink tnum">
                        {km} km · {Math.round(share * 100)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-surface-3">
                      <div
                        className={
                          fuel === 'diesel'
                            ? 'h-full rounded-full bg-fuel-diesel'
                            : fuel === 'electric'
                              ? 'h-full rounded-full bg-fuel-electric'
                              : fuel === 'cng'
                                ? 'h-full rounded-full bg-fuel-cng'
                                : 'h-full rounded-full bg-fuel-hybrid'
                        }
                        style={{ width: `${share * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {byFuel.length === 0 && (
                  <p className="text-[13px] text-ink-3">No journeys in this window.</p>
                )}
              </div>

              <div className="mt-3.5 flex items-center gap-2 border-t border-line pt-3">
                <Zap size={14} strokeWidth={2.4} className="shrink-0 text-fuel-electric" />
                <span className="text-[12px] text-ink-2">
                  <span className="font-bold">{Math.round(summary.cleanFuelShare * 100)}%</span> of
                  your trips were on electric, CNG or hybrid buses
                </span>
                <Badge tone={summary.cleanFuelShare > 0.4 ? 'ok' : 'warn'} className="ml-auto">
                  {summary.cleanFuelShare > 0.4 ? 'Good' : 'Room to improve'}
                </Badge>
              </div>
            </Card>
          </section>

          {/* --------------------------- the assumptions ------------------------ */}
          <section>
            <SectionHeader
              title="How these numbers are worked out"
              hint="Every figure on this page is an estimate"
            />
            <Card>
              <ul className="space-y-2.5">
                {GREEN_ASSUMPTIONS.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2">
                    <span className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-ink-4" />
                    {a}
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <Notice tone="neutral" icon={<Info size={14} strokeWidth={2.3} />}>
            These are modelled estimates, not measurements. They are useful for comparing your own
            choices over time; they are not an audited carbon account and should not be presented as
            one.
          </Notice>

          <Link
            to="/trips"
            className="flex items-center gap-2 rounded-field border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink">
              See the {summary.trips} journeys behind these figures
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-4" />
          </Link>
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

function Comparison({
  icon,
  label,
  value,
  max,
  tone,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  max: number;
  tone: 'ok' | 'bad';
  note: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={tone === 'ok' ? 'text-ok' : 'text-bad'}>{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{label}</span>
        <span className="shrink-0 text-[13px] font-bold text-ink tnum">{kg(value)}</span>
      </div>
      <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-surface-3">
        <div
          className={tone === 'ok' ? 'h-full rounded-full bg-ok' : 'h-full rounded-full bg-bad/70'}
          style={{ width: `${Math.max(3, (value / (max || 1)) * 100)}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-ink-4">{note}</div>
    </div>
  );
}
