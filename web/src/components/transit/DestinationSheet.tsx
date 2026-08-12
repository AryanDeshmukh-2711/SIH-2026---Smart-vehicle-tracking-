import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Footprints, MapPin, Search, SearchX, Sparkles, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/Field';
import { StateBlock } from '@/components/ui/States';
import {
  matchDestinations,
  popularDestinations,
  type DestinationOption,
} from '@/services/destination';
import { CATEGORY_LABEL } from '@/data/places';
import type { Place } from '@/types';
import { cn } from '@/lib/cn';

const categoryLabel = (p: Place) => CATEGORY_LABEL[p.category];

/**
 * "Where do you want to go?"
 *
 * Accepts what a passenger can actually name — a town, a stand, a temple, a café —
 * rather than requiring them to already know a stop id or route number. Search is
 * synchronous over the local dataset, so there is no latency, no loading state and
 * no chance of an out-of-order response.
 *
 * Before anything is typed it offers destinations genuinely reachable from where
 * the passenger is standing, which doubles as an answer to "where can this stop
 * even take me?" — the question someone who does not know the network really has.
 */
export function DestinationSheet({
  open,
  fromStopId,
  fromStopName,
  onClose,
  onPick,
}: {
  open: boolean;
  fromStopId: string;
  fromStopName: string;
  onClose: () => void;
  onPick: (destination: DestinationOption) => void;
}) {
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const suggestions = useMemo(
    () => popularDestinations(fromStopId, categoryLabel, 8),
    [fromStopId],
  );
  const results = useMemo(
    () => (q.trim() ? matchDestinations(q, categoryLabel, 10) : []),
    [q],
  );

  const searching = q.trim().length > 0;
  const list = searching ? results : suggestions;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Where do you want to go?"
      subtitle={`Buses from ${fromStopName.replace(/,.*$/, '')}`}
      maxHeight="88%"
    >
      <TextField
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="A town, a bus stand, a temple, a café"
        icon={<Search size={17} strokeWidth={2.2} />}
        className="mb-3"
        trailing={
          q ? (
            <button onClick={() => setQ('')} aria-label="Clear" className="text-ink-4">
              <X size={15} strokeWidth={2.5} />
            </button>
          ) : undefined
        }
      />

      {!searching && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.055em] text-ink-4">
          <Sparkles size={11} strokeWidth={2.6} className="text-brand-600" />
          Reachable from this stop
        </div>
      )}

      {list.length === 0 ? (
        <StateBlock
          compact
          icon={<SearchX size={20} strokeWidth={2} />}
          title={searching ? 'Nothing matches that' : 'No onward services from here'}
          body={
            searching
              ? 'Try the name of the town instead — most towns have one main stand.'
              : 'This stop has no onward departures in the current network data.'
          }
        />
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {list.map((d) => (
            <button
              key={`${d.kind}:${d.id}`}
              onClick={() => onPick(d)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]',
                  d.kind === 'place' ? 'bg-brand-50 text-brand-600' : 'bg-surface-3 text-ink-2',
                )}
              >
                <MapPin size={15} strokeWidth={2.3} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{d.name}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                  {d.town} · {d.detail}
                  {/* Say up front that a walk is involved, so the alighting stop
                      is never mistaken for the destination itself. */}
                  {d.walkMin > 0 && (
                    <span className="text-ink-4">
                      {' '}
                      · {d.walkMin} min walk from {d.alightStopName.replace(/,.*$/, '')}
                    </span>
                  )}
                </span>
              </span>

              {d.walkMin > 0 && (
                <Footprints size={13} strokeWidth={2.3} className="shrink-0 text-ink-4" />
              )}
              <ChevronRight size={15} className="shrink-0 text-ink-4" />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
