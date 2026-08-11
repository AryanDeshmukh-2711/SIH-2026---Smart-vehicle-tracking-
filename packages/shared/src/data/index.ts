/**
 * Canonical transit dataset: 8 HRTC corridors, 26 stops and 16 vehicles across
 * the Shimla, Mandi, Kullu and Kangra valleys.
 *
 * This is the single source of truth. The API seeds PostgreSQL from it, and the
 * web client keeps it as its offline fallback for when the backend is
 * unreachable — which, in the region this app is built for, is a normal
 * operating condition rather than an error case.
 */
export * from './stops';
export * from './routes';
export * from './buses';
export * from './alerts';
