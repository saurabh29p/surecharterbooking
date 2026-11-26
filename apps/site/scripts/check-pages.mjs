// Page checks for the 3D site: every built page with JavaScript off, with reduced motion, and with the
// motion on (default tier), plus the home page on a throttled mid-range Android profile.
//   pnpm build && npx astro preview --port 4321 &
//   node scripts/check-pages.mjs [baseUrl]
// Fails (exit 1) on a page error, a missing or doubled H1, sideways scrolling, or a 3D stage that
// shows nothing where it should show its still.
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Playwright is the machine's own install, not a dependency of the site
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:4321';
const dist = path.resolve('dist');

const pages = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f === 'index.html') pages.push('/' + path.relative(dist, dir).split(path.sep).join('/') + (dir === dist ? '' : '/'));
  }
};
walk(dist);
pages.sort();

const MODES = [
  ['js-off', { viewport: { width: 1280, height: 800 }, javaScriptEnabled: false }],
  ['reduced-motion', { ...devices['Pixel 7'], reducedMotion: 'reduce' }],
  ['motion', { viewport: { width: 1440, height: 900 } }],
];

const browser = await chromium.launch();
let failures = 0;
for (const [mode, opts] of MODES) {
  const ctx = await browser.newContext(opts);
  for (const url of pages) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + url.replace(/\/+/g, '/'), { waitUntil: 'load' });
    await page.waitForTimeout(mode === 'motion' ? 600 : 150);
    const r = await page.evaluate(async (wait) => {
      const h1 = [...document.querySelectorAll('h1')].filter((h) => h.getBoundingClientRect().height > 0).length;
      // scroll through so lazy stills load and the chapters run
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.9) {
        window.scrollTo(0, y);
        // (with JavaScript off the page's timers never run, so don't wait on one)
        if (wait) await new Promise((r) => setTimeout(r, 30));
      }
      const overflow = document.documentElement.scrollWidth - innerWidth;
      const stages = [...document.querySelectorAll('[data-stage]')].filter((s) => s.getBoundingClientRect().height > 0);
      const blank = stages.filter((s) => s.querySelector('.stage__still') && !s.querySelector('.stage__still.is-active')).length;
      return { h1, overflow, stages: stages.length, blank };
    }, mode !== 'js-off');
    const problems = [];
    if (errors.length) problems.push(`errors: ${errors.join(' | ')}`);
    if (r.h1 !== 1 && !url.includes('404')) problems.push(`${r.h1} visible H1s`);
    if (r.overflow > 1) problems.push(`scrolls sideways by ${r.overflow}px`);
    if (r.blank) problems.push(`${r.blank} stage(s) with no still showing`);
    if (problems.length) {
      failures++;
      console.log(`FAIL ${mode} ${url}: ${problems.join('; ')}`);
    } else console.log(`ok   ${mode} ${url} (${r.stages} stage${r.stages === 1 ? '' : 's'})`);
    await page.close();
  }
  await ctx.close();
}

// Throttled mid-range Android: 4x CPU slowdown, a 4G-like network. LCP, layout shift, main-thread
// long tasks during load, and frame times while scrolling the whole page.
for (const q of ['', '?tier=mid']) {
  const ctx = await browser.newContext({ ...devices['Moto G4'] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 });
  await page.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0, long: 0 };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__m.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__m.cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__m.long += Math.max(0, e.duration - 50)))).observe({ type: 'longtask', buffered: true });
  });
  await page.goto(base + '/' + q, { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  const load = await page.evaluate(() => ({ ...window.__m, tier: document.documentElement.dataset.tier ?? '-' }));
  const frames = await page.evaluate(async () => {
    const times = [];
    let last = performance.now();
    let y = 0;
    const H = document.documentElement.scrollHeight - innerHeight;
    await new Promise((done) => {
      const step = (t) => {
        times.push(t - last);
        last = t;
        y += 40;
        window.scrollTo(0, y);
        if (y < H && times.length < 500) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    times.sort((a, b) => a - b);
    return { median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], frames: times.length };
  });
  console.log(`throttled home${q} (tier ${load.tier}): LCP ${Math.round(load.lcp)} ms, CLS ${load.cls.toFixed(3)}, long-task time after 50 ms ${Math.round(load.long)} ms; scroll frames median ${frames.median.toFixed(1)} ms, p95 ${frames.p95.toFixed(1)} ms over ${frames.frames} frames (the first ${frames.frames * 40} px of the page)`);
  await ctx.close();
}

await browser.close();
console.log(failures ? `${failures} page check(s) failed` : 'all page checks passed');
process.exit(failures ? 1 : 0);
