import { useMemo } from 'react';
import type { PlaceCategory } from '@/types';
import { seeded } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * Procedural cover artwork for destinations.
 *
 * Photography would mean either shipping tens of megabytes or fetching from a
 * CDN — neither acceptable for an app whose whole premise is working on a weak
 * hill connection. Instead each place renders a deterministic ridge-line scene
 * from its `photoSeed`, so covers are distinct, weightless, and identical every
 * time the same place is opened.
 */

interface Palette {
  sky: [string, string];
  ridges: string[];
  accent: string;
}

const PALETTES: Record<PlaceCategory, Palette> = {
  nature: {
    sky: ['#DCEAE6', '#F2F7F5'],
    ridges: ['#9FBDB4', '#7BA093', '#4F7A6C', '#2E5A4E'],
    accent: '#F0E4C8',
  },
  viewpoint: {
    sky: ['#DCE6F2', '#F4F7FA'],
    ridges: ['#A8BCD2', '#7F9AB8', '#54728F', '#33506B'],
    accent: '#FAE3C6',
  },
  adventure: {
    sky: ['#E4E9F2', '#F6F8FB'],
    ridges: ['#B2BCCC', '#8892A8', '#5C6580', '#3A4257'],
    accent: '#F5D7B8',
  },
  culture: {
    sky: ['#F0E6DC', '#FAF6F1'],
    ridges: ['#CDB49B', '#B2917A', '#8A6A56', '#5F473A'],
    accent: '#E8CBA4',
  },
  food: {
    sky: ['#F3E9DE', '#FBF7F2'],
    ridges: ['#D6BCA0', '#C09B7C', '#96725B', '#6B5040'],
    accent: '#EBD3AA',
  },
  cafe: {
    sky: ['#EDE7E0', '#F9F6F3'],
    ridges: ['#C9BBAD', '#AA9887', '#7F6E5F', '#584B40'],
    accent: '#E4D2B8',
  },
  shopping: {
    sky: ['#E8E6F0', '#F7F6FA'],
    ridges: ['#BDB8CE', '#9891B0', '#6D678A', '#484364'],
    accent: '#E9D9C4',
  },
  stay: {
    sky: ['#E2ECEA', '#F5F9F8'],
    ridges: ['#A9C4BE', '#84A69E', '#5A8177', '#3A5D55'],
    accent: '#F1E6CC',
  },
};

/** Build one ridge silhouette as an SVG path. */
function ridgePath(seed: number, baseY: number, amplitude: number, width = 400, height = 220): string {
  const points: string[] = [];
  const steps = 7;

  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const noise = seeded(seed * 3.7 + i * 1.31);
    const noise2 = seeded(seed * 8.1 + i * 2.17);
    const y = baseY - amplitude * (0.35 + noise * 0.65) - (i % 2 === 0 ? noise2 * amplitude * 0.28 : 0);
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${Math.max(6, y).toFixed(1)}`);
  }

  return `${points.join(' ')} L${width},${height} L0,${height} Z`;
}

export function PlaceArt({
  seed,
  category,
  className,
  showSun = true,
}: {
  seed: number;
  category: PlaceCategory;
  className?: string;
  showSun?: boolean;
}) {
  const palette = PALETTES[category] ?? PALETTES.nature;

  const layers = useMemo(
    () =>
      palette.ridges.map((colour, i) => ({
        colour,
        d: ridgePath(seed + i * 11, 130 + i * 26, 66 - i * 11),
        opacity: 1,
      })),
    [seed, palette],
  );

  const sunX = 70 + seeded(seed * 5.3) * 260;
  const sunY = 44 + seeded(seed * 9.1) * 22;
  const gid = `sky-${seed}-${category}`;

  return (
    <svg
      viewBox="0 0 400 220"
      preserveAspectRatio="xMidYMid slice"
      className={cn('block h-full w-full', className)}
      role="img"
      aria-label="Illustrated ridge line"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.sky[0]} />
          <stop offset="100%" stopColor={palette.sky[1]} />
        </linearGradient>
      </defs>

      <rect width="400" height="220" fill={`url(#${gid})`} />

      {showSun && <circle cx={sunX} cy={sunY} r="17" fill={palette.accent} opacity="0.85" />}

      {/* haze band behind the ridges */}
      <rect y="96" width="400" height="46" fill="#ffffff" opacity="0.28" />

      {layers.map((l, i) => (
        <path key={i} d={l.d} fill={l.colour} />
      ))}

      {/* snow caps on the furthest ridge */}
      <path
        d={ridgePath(seed, 130, 66)}
        fill="#ffffff"
        opacity="0.22"
        style={{ clipPath: 'inset(0 0 78% 0)' }}
      />
    </svg>
  );
}

/** Cover with a soft scrim so overlaid text stays legible. */
export function PlaceCover({
  seed,
  category,
  className,
  children,
}: {
  seed: number;
  category: PlaceCategory;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('relative overflow-hidden bg-surface-3', className)}>
      <PlaceArt seed={seed} category={category} />
      {children && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3.5">{children}</div>
        </>
      )}
    </div>
  );
}
