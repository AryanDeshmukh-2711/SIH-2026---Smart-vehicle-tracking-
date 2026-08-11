import { Fuel, Leaf, Zap } from 'lucide-react';
import type { Bus, EmissionNorm, FuelType } from '@/types';
import { FUEL_LABEL, GREEN_BAND_LABEL, greenBand, greenScoreBreakdown } from '@/lib/green';
import { Ring } from '@/components/ui/Meters';
import { cn } from '@/lib/cn';

/**
 * Fuel and emission identity.
 *
 * Colour carries meaning here, so BS-IV and BS-III do not get a green treatment.
 * The SRS is explicit that mislabelling an older norm as clean is not acceptable,
 * and the palette enforces it rather than relying on the copy alone.
 */

const FUEL_STYLE: Record<FuelType, { bg: string; fg: string; border: string }> = {
  electric: { bg: 'bg-fuel-electric-bg', fg: 'text-fuel-electric', border: 'border-fuel-electric/20' },
  cng: { bg: 'bg-fuel-cng-bg', fg: 'text-fuel-cng', border: 'border-fuel-cng/20' },
  hybrid: { bg: 'bg-fuel-hybrid-bg', fg: 'text-fuel-hybrid', border: 'border-fuel-hybrid/20' },
  diesel: { bg: 'bg-fuel-diesel-bg', fg: 'text-fuel-diesel', border: 'border-fuel-diesel/25' },
};

const NORM_STYLE: Record<EmissionNorm, string> = {
  'zero-tailpipe': 'bg-fuel-electric-bg text-fuel-electric border-fuel-electric/20',
  'BS-VI': 'bg-info-bg text-info border-info-line',
  'BS-IV': 'bg-warn-bg text-warn border-warn-line',
  'BS-III': 'bg-bad-bg text-bad border-bad-line',
};

export function FuelBadge({ fuel, className }: { fuel: FuelType; className?: string }) {
  const s = FUEL_STYLE[fuel];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[7px] border px-1.5 py-0.5',
        'text-[11px] font-bold uppercase leading-[16px] tracking-[0.03em]',
        s.bg,
        s.fg,
        s.border,
        className,
      )}
    >
      {fuel === 'electric' ? <Zap size={11} strokeWidth={2.8} fill="currentColor" /> : <Fuel size={11} strokeWidth={2.5} />}
      {FUEL_LABEL[fuel]}
    </span>
  );
}

export function NormBadge({ norm, className }: { norm: EmissionNorm; className?: string }) {
  const text = norm === 'zero-tailpipe' ? 'Zero tailpipe' : norm;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[7px] border px-1.5 py-0.5',
        'text-[11px] font-bold leading-[16px] tracking-[0.01em]',
        NORM_STYLE[norm],
        className,
      )}
    >
      {text}
    </span>
  );
}

/** Fuel + norm + score, the trio that must always be visible on a bus card. */
export function GreenStrip({
  bus,
  score,
  showScore = true,
  className,
}: {
  bus: Bus;
  score: number;
  showScore?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <FuelBadge fuel={bus.fuel} />
      <NormBadge norm={bus.norm} />
      {showScore && (
        <span className="inline-flex items-center gap-1 rounded-[7px] border border-line bg-surface-3 px-1.5 py-0.5 text-[11px] font-bold leading-[16px] text-ink-2">
          <Leaf size={11} strokeWidth={2.5} className={scoreColorClass(score)} />
          <span className="tnum">{score}</span>
        </span>
      )}
      {bus.emissionDataEstimated && (
        <span className="text-[10.5px] font-medium text-ink-4">estimated</span>
      )}
    </div>
  );
}

export function scoreColorClass(score: number): string {
  const band = greenBand(score);
  return {
    excellent: 'text-fuel-electric',
    good: 'text-ok',
    fair: 'text-warn',
    poor: 'text-bad',
  }[band];
}

export function scoreColorVar(score: number): string {
  const band = greenBand(score);
  return {
    excellent: 'var(--color-fuel-electric)',
    good: 'var(--color-ok)',
    fair: 'var(--color-warn)',
    poor: 'var(--color-bad)',
  }[band];
}

/**
 * Full Green Score panel, with the arithmetic shown.
 *
 * The weighting is on screen because "94/100" means nothing on its own — a
 * depot manager challenging the number needs to see the three components and
 * their weights, which is exactly what SRS §9.2 defines.
 */
export function GreenScoreCard({ bus }: { bus: Bus }) {
  const b = greenScoreBreakdown(bus);
  const band = greenBand(b.score);

  const rows = [
    { label: 'Fuel', value: FUEL_LABEL[bus.fuel], points: b.fuel.points, weight: '50%' },
    { label: 'Emission norm', value: bus.norm === 'zero-tailpipe' ? 'Zero tailpipe' : bus.norm, points: b.norm.points, weight: '35%' },
    { label: 'Vehicle age', value: `${b.age.years} yr${b.age.years === 1 ? '' : 's'}`, points: b.age.points, weight: '15%' },
  ];

  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        <Ring
          value={b.score}
          size={86}
          stroke={7}
          color={scoreColorVar(b.score)}
          sublabel="/ 100"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
            Green Score
          </div>
          <div className={cn('font-display text-[19px] font-bold leading-tight', scoreColorClass(b.score))}>
            {GREEN_BAND_LABEL[band]}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <FuelBadge fuel={bus.fuel} />
            <NormBadge norm={bus.norm} />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-line pt-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-[104px] shrink-0 text-[12px] font-medium text-ink-3">{r.label}</span>
            <span className="flex-1 truncate text-[12.5px] font-semibold text-ink">{r.value}</span>
            <span className="text-[11px] text-ink-4 tnum">{r.weight}</span>
            <span className="w-8 text-right text-[12.5px] font-bold text-ink tnum">{r.points}</span>
          </div>
        ))}
        <p className="pt-1 text-[11px] leading-relaxed text-ink-4">
          Score = fuel×0.50 + norm×0.35 + age×0.15.
          {b.estimated && ' Fuel and norm were inferred from the year of manufacture because the operator has not filed an emission record.'}
        </p>
      </div>
    </div>
  );
}
