import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, MessageSquare, Star, ThumbsUp } from 'lucide-react';
import type { RatingBreakdown } from '@/types';
import { Screen, ScreenBody, ScreenHeader, Stack } from '@/components/layout/Screen';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { ScoreBar, Stars } from '@/components/ui/Meters';
import { StateBlock, Notice } from '@/components/ui/States';
import { Segmented } from '@/components/ui/Field';
import { useLiveBus } from '@/hooks/useLive';
import { RATING_DIMENSIONS, reviewsForBus, summariseReviews } from '@/data/reviews';
import { TRIPS } from '@/data/trips';
import { dayLabel } from '@/lib/format';
import { cn } from '@/lib/cn';

type Sort = 'recent' | 'highest' | 'lowest';

/**
 * Reviews.
 *
 * Structured against four fixed dimensions and always tied to a specific
 * journey. The brief is explicit that this must stay useful rather than becoming
 * a social feed — so there are no follows, no threads, and no free-form posting
 * outside a completed trip.
 */
export function BusReviewsScreen() {
  const { busId } = useParams<{ busId: string }>();
  const live = useLiveBus(busId);
  const [sort, setSort] = useState<Sort>('recent');
  const [composing, setComposing] = useState(false);

  const reviews = useMemo(() => (busId ? reviewsForBus(busId) : []), [busId]);
  const summary = useMemo(() => summariseReviews(reviews), [reviews]);

  const sorted = useMemo(() => {
    const list = reviews.slice();
    if (sort === 'highest') return list.sort((a, b) => b.overall - a.overall);
    if (sort === 'lowest') return list.sort((a, b) => a.overall - b.overall);
    return list;
  }, [reviews, sort]);

  /** A review can only be written against a journey the user actually took. */
  const eligibleTrip = useMemo(
    () => TRIPS.find((t) => t.busId === busId && !t.reviewed),
    [busId],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Passenger reviews"
        subtitle={live ? `${live.bus.registration} · Route ${live.route.shortName}` : undefined}
      />

      <ScreenBody className="pt-4">
        {summary.count === 0 ? (
          <StateBlock
            icon={<MessageSquare size={24} strokeWidth={1.9} />}
            title="No reviews for this bus yet"
            body="Reviews are only accepted from passengers who have completed a journey on this vehicle, so a new bus starts empty."
            tone="brand"
          />
        ) : (
          <Stack>
            {/* -------------------------- aggregate -------------------------- */}
            <Card>
              <div className="flex items-start gap-5">
                <div className="shrink-0 text-center">
                  <div className="font-display text-[38px] font-extrabold leading-none text-ink tnum">
                    {summary.overall.toFixed(1)}
                  </div>
                  <Stars value={summary.overall} size={15} className="mt-2" />
                  <div className="mt-1.5 text-[11.5px] text-ink-4">
                    {summary.count} review{summary.count === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-[5px]">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = summary.distribution[star - 1];
                    const pct = summary.count ? (count / summary.count) * 100 : 0;
                    return (
                      <div key={star} className="flex items-center gap-2">
                        <span className="flex w-6 shrink-0 items-center gap-0.5 text-[11px] font-semibold text-ink-3 tnum">
                          {star}
                          <Star size={9} fill="currentColor" strokeWidth={0} className="text-ink-4" />
                        </span>
                        <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className="block h-full rounded-full bg-[#E8A93B]"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="w-4 shrink-0 text-right text-[11px] text-ink-4 tnum">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* ------------------------- dimensions -------------------------- */}
            <section>
              <SectionHeader
                title="What passengers rate"
                hint="Four fixed dimensions, so scores stay comparable across the fleet"
              />
              <Card>
                <div className="space-y-3.5">
                  {RATING_DIMENSIONS.map((d) => (
                    <ScoreBar
                      key={d.key}
                      label={d.label}
                      value={summary.breakdown[d.key]}
                      hint={d.hint}
                    />
                  ))}
                </div>
              </Card>
            </section>

            {/* --------------------------- the list -------------------------- */}
            <section>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-bold text-ink">Reviews</h2>
                <Segmented<Sort>
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'recent', label: 'Recent' },
                    { value: 'highest', label: 'Highest' },
                    { value: 'lowest', label: 'Lowest' },
                  ]}
                  className="w-[188px]"
                />
              </div>

              <div className="space-y-2.5">
                {sorted.map((r) => (
                  <Card key={r.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 font-display text-[13px] font-bold text-brand-700">
                          {r.author.charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13.5px] font-bold text-ink">
                              {r.author}
                            </span>
                            <CheckCircle2 size={12} strokeWidth={2.6} className="shrink-0 text-brand-500" />
                          </div>
                          <div className="mt-0.5 truncate text-[11.5px] text-ink-4">{r.journey}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Stars value={r.overall} size={12} />
                        <div className="mt-0.5 text-[11px] text-ink-4">{dayLabel(r.date)}</div>
                      </div>
                    </div>

                    <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">{r.comment}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-2.5">
                      {RATING_DIMENSIONS.map((d) => (
                        <span key={d.key} className="text-[11px] text-ink-3">
                          {d.label}{' '}
                          <span className="font-bold text-ink-2 tnum">
                            {r.breakdown[d.key as keyof RatingBreakdown]}
                          </span>
                        </span>
                      ))}
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-4">
                        <ThumbsUp size={11} strokeWidth={2.3} />
                        {r.helpfulCount}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            {/* ------------------------- write a review ---------------------- */}
            {eligibleTrip ? (
              <Card className="border-brand-200 bg-brand-50">
                <div className="text-[13.5px] font-bold text-brand-800">
                  You travelled on this bus
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-brand-700/85">
                  {eligibleTrip.from.replace(/,.*$/, '')} → {eligibleTrip.to.replace(/,.*$/, '')} ·{' '}
                  {dayLabel(eligibleTrip.date)}. Rate it so other passengers know what to expect.
                </p>
                <Button block className="mt-3" onClick={() => setComposing(true)}>
                  Write a review
                </Button>
              </Card>
            ) : (
              <Notice tone="neutral">
                Only passengers with a completed journey on this vehicle can leave a review. That is
                what keeps these scores usable by depot managers.
              </Notice>
            )}
          </Stack>
        )}
      </ScreenBody>

      <ReviewComposer
        open={composing}
        onClose={() => setComposing(false)}
        journey={
          eligibleTrip
            ? `${eligibleTrip.from.replace(/,.*$/, '')} → ${eligibleTrip.to.replace(/,.*$/, '')} · ${dayLabel(eligibleTrip.date)}`
            : ''
        }
      />
    </Screen>
  );
}

/* ----------------------------- review composer ---------------------------- */

function ReviewComposer({
  open,
  onClose,
  journey,
}: {
  open: boolean;
  onClose: () => void;
  journey: string;
}) {
  const [scores, setScores] = useState<RatingBreakdown>({
    cleanliness: 0,
    comfort: 0,
    punctuality: 0,
    safety: 0,
  });
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const complete = Object.values(scores).every((v) => v > 0);

  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose();
        setTimeout(() => setSubmitted(false), 300);
      }}
      title={submitted ? 'Thanks — review recorded' : 'Rate this journey'}
      subtitle={submitted ? undefined : journey}
      footer={
        submitted ? undefined : (
          <Button block size="lg" disabled={!complete} onClick={() => setSubmitted(true)}>
            Submit review
          </Button>
        )
      }
    >
      {submitted ? (
        <StateBlock
          icon={<CheckCircle2 size={24} strokeWidth={2} />}
          title="Your rating is in"
          tone="brand"
          body="It will appear on this bus and feed into the depot's monthly quality report."
        />
      ) : (
        <div className="space-y-5 pb-2">
          {RATING_DIMENSIONS.map((d) => (
            <div key={d.key}>
              <div className="flex items-baseline justify-between">
                <span className="text-[13.5px] font-semibold text-ink">{d.label}</span>
                <span className="text-[11.5px] text-ink-4">{d.hint}</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setScores((s) => ({ ...s, [d.key]: n }))}
                    aria-label={`${d.label} ${n} of 5`}
                    className={cn(
                      'flex h-10 flex-1 items-center justify-center rounded-[10px] border transition-colors',
                      scores[d.key] >= n
                        ? 'border-[#E8A93B] bg-[#FEF7EA]'
                        : 'border-line bg-surface hover:border-line-strong',
                    )}
                  >
                    <Star
                      size={17}
                      strokeWidth={2}
                      className={scores[d.key] >= n ? 'text-[#E8A93B]' : 'text-ink-4'}
                      fill={scores[d.key] >= n ? 'currentColor' : 'none'}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div>
            <label className="text-[13.5px] font-semibold text-ink" htmlFor="review-comment">
              Anything else? <span className="font-normal text-ink-4">(optional)</span>
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={280}
              placeholder="What should the next passenger know?"
              className="mt-2 w-full resize-none rounded-field border border-line bg-surface px-3 py-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-4 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <div className="mt-1 text-right text-[11px] text-ink-4 tnum">{comment.length}/280</div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
