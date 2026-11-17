import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/env.js';

export default defineConfig({
  // SWC keeps decorator metadata, which Nest's dependency injection needs.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { conditions: ['@shubhjets/source'] },
  test: {
    include: ['test/**/*.test.ts'],
    env: TEST_ENV,
    globalSetup: ['test/global-setup.ts'],
    // Tests share one real database, so files run one at a time.
    fileParallelism: false,
  },
});
