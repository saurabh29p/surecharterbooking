import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  resolve: { conditions: ['@shubhjets/source'] },
  server: { port: 5173 },
  test: { environment: 'happy-dom', include: ['test/**/*.test.ts'] },
});
