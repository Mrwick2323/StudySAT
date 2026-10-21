import { defineConfig } from 'vitest/config';

/**
 * Live checks against the real College Board question bank API.
 * Not part of `npm test` because they need network access; run with
 * `npm run check:api`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/live/**/*.live.test.ts'],
    testTimeout: 15 * 60 * 1000,
    hookTimeout: 5 * 60 * 1000,
  },
});
