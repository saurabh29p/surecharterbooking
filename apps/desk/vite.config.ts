import vue from '@vitejs/plugin-vue';
import { PurgeCSS } from 'purgecss';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const api = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
// Same-site API, like the Vercel rewrites in production (dev server and `vite preview` of the build).
const proxy = {
  '/api': { target: api, changeOrigin: false },
  // Secure share links (/s/<token>) are pages served by the API.
  '/s/': { target: api, changeOrigin: false, rewrite: (path: string) => `/api${path}` },
};

/**
 * Production builds keep only the Tabler rules the desk actually uses (Tabler's full CSS is ~100 KB
 * compressed; most of it is components we never render). Only Tabler's file is trimmed: our own
 * styles, including the class names built at runtime (all `sj-…`), are never touched.
 */
function trimTabler(): Plugin {
  return {
    name: 'shubhjets:trim-tabler',
    apply: 'build',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.includes('@tabler/core') || !id.endsWith('.css')) return null;
      const [result] = await new PurgeCSS().purge({
        content: ['index.html', 'src/**/*.vue', 'src/**/*.ts'],
        css: [{ raw: code }],
        // Classes Vue or the browser add at runtime, plus Tabler's state classes.
        safelist: {
          standard: [/^is-/, /^was-/, /^show$/, /^active$/, /^disabled$/, /^router-link/, /^sj-/],
          greedy: [/data-bs-theme/, /data-v-/],
        },
        // Theme variables are cheap and some are read indirectly through other variables.
        variables: false,
        fontFace: false,
        keyframes: true,
      });
      return { code: result!.css, map: null };
    },
  };
}

export default defineConfig({
  plugins: [trimTabler(), vue()],
  resolve: { conditions: ['@shubhjets/source'] },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: {
    // Small, cache-friendly chunks: the framework changes rarely, our code often.
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes('node_modules/vue') || id.includes('node_modules/@vue') ? 'vue' : undefined,
      },
    },
  },
  test: { environment: 'happy-dom', include: ['test/**/*.test.ts'] },
});
