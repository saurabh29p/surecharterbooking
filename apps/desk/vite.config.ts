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
      // Secure share links (/s/<token>) are pages served by the API.
      '/s/': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: false,
        rewrite: (path) => `/api${path}`,
      },
    },
  },
  test: { environment: 'happy-dom', include: ['test/**/*.test.ts'] },
});
