import type { BusReview, RatingBreakdown } from '@/types';

/**
 * Passenger reviews are structured against four fixed dimensions rather than a
 * free-form feed. Each one is tied to a specific journey, so a rating always
 * answers "on which trip?" — that is what makes the aggregate usable by a depot
 * manager instead of just being social chatter.
 */
export const REVIEWS: BusReview[] = [
  {
    id: 'RV-001',
    busId: 'B-4021',
    author: 'Meera K.',
    date: '2026-08-04',
    overall: 5,
    breakdown: { cleanliness: 5, comfort: 5, punctuality: 4, safety: 5 },
    comment:
      'Electric bus, so the climb out of Shimla was near silent. Seats clean, USB points all working. Left about eight minutes late but made it up before Mandi.',
    journey: 'Shimla → Mandi · 09 Aug',
    helpfulCount: 34,
  },
  {
    id: 'RV-002',
    busId: 'B-4021',
    author: 'Rohit S.',
    date: '2026-07-29',
    overall: 4,
    breakdown: { cleanliness: 5, comfort: 4, punctuality: 4, safety: 5 },
    comment:
      'Very comfortable for a seven-hour run. Only complaint is that luggage space fills up fast — board at ISBT if you have a large bag.',
    journey: 'Shimla → Manali · 29 Jul',
    helpfulCount: 21,
  },
  {
    id: 'RV-003',
    busId: 'B-4021',
    author: 'Anjali T.',
    date: '2026-07-22',
    overall: 4,
    breakdown: { cleanliness: 4, comfort: 4, punctuality: 5, safety: 5 },
    comment:
      'Reached Kullu five minutes ahead of the timetable. Driver kept to the lane discipline on the Aut stretch, which I appreciated.',
    journey: 'Shimla → Kullu · 22 Jul',
    helpfulCount: 15,
  },
  {
    id: 'RV-004',
    busId: 'B-4021',
    author: 'Devendra P.',
    date: '2026-07-11',
    overall: 3,
    breakdown: { cleanliness: 3, comfort: 4, punctuality: 3, safety: 4 },
    comment:
      'Bus itself is good but it was held up nearly forty minutes near Pandoh for road work. The app warned me, so I am not marking it down further.',
    journey: 'Shimla → Manali · 11 Jul',
    helpfulCount: 9,
  },
  {
    id: 'RV-005',
    busId: 'B-1187',
    author: 'Sunita R.',
    date: '2026-08-06',
    overall: 3,
    breakdown: { cleanliness: 3, comfort: 3, punctuality: 4, safety: 4 },
    comment:
      'Older bus and it shows — noisy, and the windows rattle. But it runs reliably and the conductor was helpful with change.',
    journey: 'Shimla → Solan · 06 Aug',
    helpfulCount: 12,
  },
  {
    id: 'RV-006',
    busId: 'B-1187',
    author: 'Kabir M.',
    date: '2026-07-30',
    overall: 2,
    breakdown: { cleanliness: 2, comfort: 2, punctuality: 3, safety: 4 },
    comment:
      'Floor had not been swept. Fine for a short hop to Kandaghat, would not want it for a longer run.',
    journey: 'Shimla → Kandaghat · 30 Jul',
    helpfulCount: 18,
  },
  {
    id: 'RV-007',
    busId: 'B-8801',
    author: 'Priya N.',
    date: '2026-08-02',
    overall: 5,
    breakdown: { cleanliness: 5, comfort: 5, punctuality: 5, safety: 5 },
    comment:
      'Overnight Volvo to Dharamshala. Reclining seats, curtains, and it arrived four minutes early. Worth the fare over the ordinary service.',
    journey: 'Shimla → McLeod Ganj · 02 Aug',
    helpfulCount: 47,
  },
  {
    id: 'RV-008',
    busId: 'B-8801',
    author: 'Gaurav D.',
    date: '2026-07-19',
    overall: 4,
    breakdown: { cleanliness: 5, comfort: 5, punctuality: 3, safety: 5 },
    comment:
      'Excellent bus, but we lost half an hour at Hamirpur waiting for a connection that never got announced.',
    journey: 'Shimla → Palampur · 19 Jul',
    helpfulCount: 11,
  },
  {
    id: 'RV-009',
    busId: 'B-6677',
    author: 'Tashi L.',
    date: '2026-08-07',
    overall: 5,
    breakdown: { cleanliness: 5, comfort: 4, punctuality: 5, safety: 5 },
    comment:
      'Short run up to Solang and the electric bus handled the gradient without a struggle. No diesel smell at the stand either.',
    journey: 'Manali → Solang · 07 Aug',
    helpfulCount: 26,
  },
  {
    id: 'RV-010',
    busId: 'B-6677',
    author: 'Farah A.',
    date: '2026-07-25',
    overall: 4,
    breakdown: { cleanliness: 4, comfort: 4, punctuality: 5, safety: 5 },
    comment: 'Reliable and frequent. Gets crowded after eleven, so take an early one if you can.',
    journey: 'Manali → Solang · 25 Jul',
    helpfulCount: 8,
  },
  {
    id: 'RV-011',
    busId: 'B-1220',
    author: 'Nikhil B.',
    date: '2026-08-08',
    overall: 4,
    breakdown: { cleanliness: 4, comfort: 4, punctuality: 4, safety: 5 },
    comment:
      'City electric bus. Low floor helped my mother get on without difficulty. Quiet and clean.',
    journey: 'ISBT → Sanjauli · 08 Aug',
    helpfulCount: 19,
  },
  {
    id: 'RV-012',
    busId: 'B-0456',
    author: 'Ramesh V.',
    date: '2026-07-28',
    overall: 2,
    breakdown: { cleanliness: 2, comfort: 2, punctuality: 2, safety: 3 },
    comment:
      'Ran twenty minutes late and the exhaust was noticeable inside the cabin. Would take the HRTC service instead next time.',
    journey: 'Shimla → Solan · 28 Jul',
    helpfulCount: 31,
  },
];

export const RATING_DIMENSIONS: Array<{ key: keyof RatingBreakdown; label: string; hint: string }> = [
  { key: 'cleanliness', label: 'Cleanliness', hint: 'Floors, seats, windows' },
  { key: 'comfort', label: 'Comfort', hint: 'Seating, space, ride quality' },
  { key: 'punctuality', label: 'Punctuality', hint: 'Departure and arrival against timetable' },
  { key: 'safety', label: 'Safety', hint: 'Driving, doors, emergency equipment' },
];

export interface ReviewSummary {
  count: number;
  overall: number;
  breakdown: RatingBreakdown;
  /** Star counts, index 0 = one star. */
  distribution: number[];
}

export function summariseReviews(reviews: BusReview[]): ReviewSummary {
  if (reviews.length === 0) {
    return {
      count: 0,
      overall: 0,
      breakdown: { cleanliness: 0, comfort: 0, punctuality: 0, safety: 0 },
      distribution: [0, 0, 0, 0, 0],
    };
  }

  const avg = (pick: (r: BusReview) => number) =>
    Math.round((reviews.reduce((s, r) => s + pick(r), 0) / reviews.length) * 10) / 10;

  const distribution = [0, 0, 0, 0, 0];
  for (const r of reviews) distribution[Math.min(4, Math.max(0, Math.round(r.overall) - 1))]++;

  return {
    count: reviews.length,
    overall: avg((r) => r.overall),
    breakdown: {
      cleanliness: avg((r) => r.breakdown.cleanliness),
      comfort: avg((r) => r.breakdown.comfort),
      punctuality: avg((r) => r.breakdown.punctuality),
      safety: avg((r) => r.breakdown.safety),
    },
    distribution,
  };
}

export function reviewsForBus(busId: string): BusReview[] {
  return REVIEWS.filter((r) => r.busId === busId).sort((a, b) => b.date.localeCompare(a.date));
}
