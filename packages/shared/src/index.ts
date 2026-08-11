/**
 * Shared domain logic.
 *
 * Everything in here is pure: no DOM, no database, no network. It is imported
 * by both the web client and the API so that the rules which define the product
 * — how ETA confidence degrades, how a Green Score is composed, how CO₂ is
 * estimated — exist in exactly one place and cannot drift between the two.
 */
export * from './types';
export * from './eta';
export * from './green';
export * from './geo';
