import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = process.cwd();
const shared = (file: string) => path.resolve(root, 'packages/shared/src', file);

/**
 * Tests cover the pure logic that the product's credibility rests on: whether a
 * GPS reading can be trusted, how arrival confidence decays, and how a bus is
 * scored for emissions. None of it needs Postgres, Redis or a broker — that is
 * deliberate, and the reason those rules live in plain functions.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: '@routify/shared/data', replacement: shared('data/index.ts') },
      { find: '@routify/shared/types', replacement: shared('types.ts') },
      { find: '@routify/shared/eta', replacement: shared('eta.ts') },
      { find: '@routify/shared/green', replacement: shared('green.ts') },
      { find: '@routify/shared/geo', replacement: shared('geo.ts') },
      { find: '@routify/shared', replacement: shared('index.ts') },
    ],
  },
  test: {
    environment: 'node',
    include: ['api/src/**/*.test.ts', 'packages/shared/src/**/*.test.ts'],
    reporters: ['default'],
  },
});
