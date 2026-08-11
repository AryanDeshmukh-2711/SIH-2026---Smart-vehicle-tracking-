import type { RouteCategory } from '@/types';

/** Human-facing names for the service classes used across HRTC timetables. */
export const CATEGORY_LABEL: Record<RouteCategory, string> = {
  ordinary: 'Ordinary',
  express: 'Express',
  deluxe: 'Deluxe',
  volvo: 'Volvo AC',
  local: 'Local',
};
