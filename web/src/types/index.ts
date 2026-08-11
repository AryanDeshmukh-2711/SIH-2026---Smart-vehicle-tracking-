/**
 * The domain model lives in `@himgati/shared` so the API and the client cannot
 * drift apart. This re-export keeps the existing `@/types` import path working.
 */
export * from '@himgati/shared/types';
