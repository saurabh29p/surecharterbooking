import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

const api = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
// Same-site API, like the Vercel rewrites in production (dev server and `vite preview` of the build).
const proxy = {
  '/api': { target: api, changeOrigin: false },
  // Secure share links (/s/<token>) are pages served by the API.
  '/s/': { target: api, changeOrigin: false, rewrite: (path: string) => `/api${path}` },
};

export default defineConfig({
  plugins: [vue()],
  resolve: { conditions: ['@shubhjets/source'] },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  test: { environment: 'happy-dom', include: ['test/**/*.test.ts'] },
});
