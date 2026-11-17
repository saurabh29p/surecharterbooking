import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  resolve: { conditions: ['@shubhjets/source'] },
  server: {
    port: 5173,
    // Same-site API in development, like the Vercel rewrite in production.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  test: { environment: 'happy-dom', include: ['test/**/*.test.ts'] },
});
