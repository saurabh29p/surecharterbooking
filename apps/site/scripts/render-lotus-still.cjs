// The Vaanika Standard's lotus still (src/assets/3d/stills/standard.png): transparent, face on, nothing
// lit, framed like the 3D (the mark fills 85% of the stage's shorter side), so the 3D takes over from it
// without a jump. Then re-run scripts/still-placeholders.py.
//   pnpm build && npx astro preview --port 4321 &
//   node scripts/render-lotus-still.cjs src/assets/3d/stills/standard.png
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3, bypassCSP: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://127.0.0.1:4321/?tier=high&still=clear', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('.standard__lotus').scrollIntoView({ block: 'center' }));
  await page.waitForFunction(() => document.querySelector('.standard__stage')?.dataset.three === 'live', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: 'html,body{background:transparent!important} body::before{display:none!important} body *:not(.gl-canvas){visibility:hidden!important}' });
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => {
    const r = document.querySelector('.standard__stage').getBoundingClientRect();
    const side = Math.min(r.width, r.height);
    return { x: r.left + (r.width - side) / 2, y: r.top + (r.height - side) / 2, width: side, height: side };
  });
  await page.screenshot({ path: out, clip: box, omitBackground: true });
  console.log('saved', out, JSON.stringify(box));
  await browser.close();
})();
