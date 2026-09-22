import { useMemo, useState } from 'react';
import type { PlaceCategory } from '@/types';
import { seeded } from '@/lib/format';
import { photoFor, photoUrl } from '@/data/placePhotos';
import { cn } from '@/lib/cn';

/**
 * Cover artwork for destinations.
 *
 * Real photographs of the specific landmarks, where we have one — see
 * `data/placePhotos.ts` for the files, their licences and the required credit.
 * They are bundled rather than hotlinked, because an app built for a weak hill
 * connection should not need a CDN round trip to show a cover.
 *
 * The generated ridge-line scene below is no longer the whole story, but it still
 * earns its place twice over: as the placeholder while a photograph decodes, and
 * as the fallback for the places we have no photograph of. It is deterministic
 * from `photoSeed`, so a given place always gets the same scene, and each
 * category draws its own subject rather than the same hillside in a new tint.
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

/**
 * A place's cover: its photograph where we have one, the illustration otherwise.
 *
 * The illustration always renders underneath. That makes it the placeholder while
 * the photo decodes *and* the fallback if the file is missing or fails to load,
 * with no layout shift either way — the picture fades in over a scene that was
 * already the right shape and colour.
 */
export function PlaceArt({
  seed,
  category,
  placeId,
  alt,
  className,
  showSun = true,
  priority = false,
}: {
  seed: number;
  category: PlaceCategory;
  /** Enables the real photograph when one exists for this place. */
  placeId?: string;
  alt?: string;
  className?: string;
  showSun?: boolean;
  /**
   * Set on an above-the-fold hero. Lazy-loading the one image the user is
   * already looking at just delays it; everything in a list stays lazy.
   */
  priority?: boolean;
}) {
  const photo = placeId ? photoFor(placeId) : undefined;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      <PlaceScene seed={seed} category={category} showSun={showSun} />

      {photo && !failed && (
        <img
          // A cached image can finish decoding before React attaches `onLoad`,
          // in which case that event never fires and the photo would sit at
          // opacity 0 forever — invisible on every revisit. The ref catches the
          // already-complete case that the event misses.
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoaded(true);
          }}
          src={photoUrl(photo)}
          alt={alt ?? ''}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </div>
  );
}

/** The generated scene. Placeholder and fallback for `PlaceArt`. */
function PlaceScene({
  seed,
  category,
  showSun = true,
}: {
  seed: number;
  category: PlaceCategory;
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
      className="block h-full w-full"
      aria-hidden
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

      <CategoryMotif category={category} seed={seed} palette={palette} />
    </svg>
  );
}

/**
 * The subject of the picture.
 *
 * Without this every category rendered the identical ridge line and differed only
 * by palette, which is why the covers read as placeholders rather than as the
 * place they are labelling — a temple, a tea stall and a ropeway all looked like
 * the same hillside in three tints.
 *
 * This is the fallback path. Places with a real photograph in `placePhotos.ts`
 * only show this while that photograph decodes.
 */
function CategoryMotif({
  category,
  seed,
  palette,
}: {
  category: PlaceCategory;
  seed: number;
  palette: Palette;
}) {
  // Darkest ridge colour, so the motif reads as the nearest silhouette.
  const ink = palette.ridges[palette.ridges.length - 1];
  const mid = palette.ridges[1];
  const jitter = (n: number) => (seeded(seed * n) - 0.5) * 46;

  switch (category) {
    /* Shikhara, mandapa and a flag — the profile of a hill temple. */
    case 'culture':
      return (
        <g fill={ink} transform={`translate(${196 + jitter(3.1)} 0)`}>
          <path d="M0 214V150h56v64z" />
          <path d="M6 150 28 96l22 54z" />
          <path d="M28 96 22 78h12z" opacity="0.9" />
          <rect x="20" y="176" width="16" height="38" fill={palette.sky[1]} opacity="0.55" />
          <path d="M-16 214v-30h16v30z" opacity="0.75" />
          <path d="M56 214v-30h16v30z" opacity="0.75" />
        </g>
      );

    /* Deodar stand — the tree that actually covers these slopes. */
    case 'nature':
      return (
        <g fill={ink} transform={`translate(${150 + jitter(4.7)} 0)`}>
          {[0, 46, 92, 132].map((x, i) => {
            const h = 56 + (i % 2) * 22;
            return (
              <g key={x} transform={`translate(${x} ${214 - h})`}>
                <path d={`M14 0 28 ${h * 0.42} 20 ${h * 0.42} 30 ${h * 0.74} 0 ${h * 0.74} 8 ${h * 0.42} 0 ${h * 0.42}z`} />
                <rect x="12" y={h * 0.74} width="4" height={h * 0.26} />
              </g>
            );
          })}
        </g>
      );

    /* Viewing railing with a bench looking out over the valley. */
    case 'viewpoint':
      return (
        <g transform={`translate(${120 + jitter(5.3)} 0)`}>
          <rect x="0" y="188" width="170" height="3.5" fill={ink} />
          {[0, 40, 80, 120, 160].map((x) => (
            <rect key={x} x={x} y="188" width="3.5" height="26" fill={ink} />
          ))}
          <rect x="52" y="200" width="44" height="3" fill={mid} />
          <rect x="54" y="203" width="3" height="11" fill={mid} />
          <rect x="91" y="203" width="3" height="11" fill={mid} />
        </g>
      );

    /* Ropeway cabin on a cable, the Solang/Gulaba signature. */
    case 'adventure':
      return (
        <g transform={`translate(${90 + jitter(6.1)} 0)`}>
          <path d="M0 118 220 150" stroke={ink} strokeWidth="2" fill="none" />
          <rect x="4" y="112" width="5" height="102" fill={ink} opacity="0.75" />
          <rect x="212" y="146" width="5" height="68" fill={ink} opacity="0.75" />
          <g transform="translate(96 132)">
            <rect x="-1.5" y="0" width="3" height="10" fill={ink} />
            <rect x="-15" y="10" width="30" height="21" rx="5" fill={ink} />
            <rect x="-10" y="15" width="20" height="9" rx="2.5" fill={palette.sky[1]} opacity="0.7" />
          </g>
        </g>
      );

    /* Dhaba stall: striped awning, counter, steam off the tawa. */
    case 'food':
      return (
        <g transform={`translate(${172 + jitter(7.3)} 0)`}>
          <rect x="0" y="170" width="86" height="44" fill={ink} />
          <path d="M-8 170h102l-10-20H2z" fill={mid} />
          <rect x="14" y="184" width="18" height="30" fill={palette.sky[1]} opacity="0.5" />
          <rect x="52" y="184" width="18" height="30" fill={palette.sky[1]} opacity="0.5" />
          <path d="M40 152c6-6-4-10 2-16" stroke={ink} strokeWidth="2.5" fill="none" opacity="0.5" />
        </g>
      );

    /* A cup, because that is what a Himachali café is for. */
    case 'cafe':
      return (
        <g transform={`translate(${186 + jitter(8.9)} 0)`}>
          <path d="M0 178h52v18a18 18 0 0 1-18 18H18A18 18 0 0 1 0 196z" fill={ink} />
          <path d="M52 184h9a11 11 0 0 1 0 22h-9" stroke={ink} strokeWidth="5" fill="none" />
          <rect x="-10" y="212" width="74" height="4" rx="2" fill={ink} />
          <path d="M18 166c6-6-4-10 2-16M34 166c6-6-4-10 2-16" stroke={ink} strokeWidth="2.5" fill="none" opacity="0.45" />
        </g>
      );

    /* Bazaar row — striped awnings stepping down a hill street. */
    case 'shopping':
      return (
        <g transform={`translate(${132 + jitter(9.7)} 0)`}>
          {[0, 58, 116].map((x, i) => (
            <g key={x} transform={`translate(${x} ${172 + i * 6})`}>
              <rect x="0" y="10" width="50" height="42" fill={ink} />
              <path d="M-6 10h62l-8-14H2z" fill={mid} />
              <rect x="16" y="26" width="18" height="26" fill={palette.sky[1]} opacity="0.5" />
            </g>
          ))}
        </g>
      );

    /* Pitched-roof guesthouse with lit windows. */
    case 'stay':
      return (
        <g transform={`translate(${168 + jitter(10.3)} 0)`}>
          <rect x="0" y="164" width="92" height="50" fill={ink} />
          <path d="M-10 164 46 128l56 36z" fill={mid} />
          {[10, 38, 66].map((x) => (
            <rect key={x} x={x} y="178" width="16" height="16" fill={palette.accent} opacity="0.8" />
          ))}
          <rect x="38" y="198" width="16" height="16" fill={palette.sky[1]} opacity="0.6" />
        </g>
      );

    default:
      return null;
  }
}

/** Cover with a soft scrim so overlaid text stays legible. */
export function PlaceCover({
  seed,
  category,
  placeId,
  alt,
  className,
  children,
}: {
  seed: number;
  category: PlaceCategory;
  placeId?: string;
  alt?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('relative overflow-hidden bg-surface-3', className)}>
      <PlaceArt seed={seed} category={category} placeId={placeId} alt={alt} />
      {children && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3.5">{children}</div>
        </>
      )}
    </div>
  );
}

/**
 * Photographer credit. Required by the CC BY / BY-SA licences the photographs
 * are used under — this is a condition of use, not decoration.
 */
export function PhotoCredit({ placeId, className }: { placeId: string; className?: string }) {
  const photo = photoFor(placeId);
  if (!photo) return null;

  return (
    <p className={cn('text-[10.5px] leading-relaxed text-ink-4', className)}>
      Photo: {photo.author} ·{' '}
      <a
        href={photo.source}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-line-strong underline-offset-2 hover:text-ink-3"
      >
        {photo.license}
      </a>{' '}
      via Wikimedia Commons
    </p>
  );
}
