// Render the fallback stills (src/assets/3d/stills) from the live 3D scenes.
//   pnpm build && npx astro preview --port 4321 &
//   node scripts/render-stills.cjs src/assets/3d/stills [names, comma-separated]
// Uses the machine's Playwright with a software renderer; the CSP is bypassed only to hide the page
// text while capturing the canvas.
const { chromium } = require('playwright');
const S = [
  // [file, page, track selector, progress, stage selector, viewport]
  ...[0, 1, 2, 3, 4].map((i) => [`fleet-${i}`, '', '.fleet__track', i / 4, '.fleet__stage', [1440, 900]]),
  ['standard', '', '.standard__checks', 0.93, '.standard__stage', [1440, 900], 'read'],
  ['map', '', '.dest__track', 1, '.dest__stage', [1440, 900]],
  ['shreeji', '', '.shreeji', 0.9, '.shreeji__stage', [1440, 900]],
  ['bloom', '', '.name', 1, '.name__stage', [1440, 900]],
  ['hover', 'helicopter-arrivals/', '.band', 0.5, '.band__stage', [1440, 900], 'view'],
  ['map-udaipur', 'destinations/udaipur/', '.band', 0.9, '.band__stage', [1440, 900], 'view'],
  ['map-jaipur', 'destinations/jaipur/', '.band', 0.9, '.band__stage', [1440, 900], 'view'],
  ['map-goa', 'destinations/goa/', '.band', 0.9, '.band__stage', [1440, 900], 'view'],
];
(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, bypassCSP: true });
  let page = null, cur = null;
  const only = process.argv[3]?.split(',');
  for (const [file, path, track, p, stage, , mode = 'pin'] of S) {
    if (only && !only.includes(file)) continue;
    if (cur !== path) {
      if (page) await page.close();
      page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:4321/${path}?tier=high&still`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      cur = path;
    }
    await page.evaluate(([s, p, mode]) => {
      const t = document.querySelector(s);
      const hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0;
      const top = t.getBoundingClientRect().top + scrollY;
      let y;
      if (mode === 'read') y = top + p * t.offsetHeight - innerHeight * 0.5;
      else if (mode === 'view') y = top - innerHeight + 0.5 * (innerHeight + t.offsetHeight);
      else y = top - hh + p * Math.max(0, t.offsetHeight - (innerHeight - hh));
      window.scrollTo({ top: y, behavior: 'instant' });
    }, [track, p, mode]);
    await page.waitForTimeout(3500);
    // only the canvas: hide every element drawn over it, keep the layout
    await page.addStyleTag({ content: 'body *:not(.gl-canvas){visibility:hidden !important} .stage__caption{display:none}' });
    await page.waitForTimeout(300);
    const box = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(innerWidth, r.right) - Math.max(0, r.left), height: Math.min(innerHeight, r.bottom) - Math.max(0, r.top) }; }, stage);
    if (!(box.height > 0)) { console.log("SKIP", file, JSON.stringify(box), await page.evaluate((s) => JSON.stringify(document.querySelector(s).getBoundingClientRect()) + " scrollY=" + scrollY, stage)); continue; }
    await page.screenshot({ path: `${out}/${file}.jpg`, clip: box, type: "jpeg", quality: 90 });
    await page.evaluate(() => document.querySelectorAll('style').forEach((st) => { if (st.textContent.startsWith('body *:not(.gl-canvas)')) st.remove(); }));
    console.log(file, JSON.stringify(box));
  }
  await browser.close();
})();
