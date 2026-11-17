import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC keeps decorator metadata, which Nest's dependency injection needs.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { conditions: ['@shubhjets/source'] },
  test: { include: ['test/**/*.test.ts'] },
});
