// Render single frames for review: node scripts/stills.mjs <Composition> <frame>[,<frame>...] [outPrefix]
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';

const [comp = 'Film', framesArg = '0', prefix = 'out/still'] = process.argv.slice(2);
const frames = framesArg.split(',').map(Number);
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), onProgress: () => {} });
const composition = await selectComposition({ serveUrl, id: comp, inputProps: {} });
for (const frame of frames) {
  const output = `${prefix}_${comp}_${String(frame).padStart(4, '0')}.png`;
  const t0 = Date.now();
  await renderStill({
    serveUrl, composition, frame, output,
    chromiumOptions: { gl: 'swangle' },
    timeoutInMilliseconds: 240000,
    onBrowserLog: (l) => { if (!/fallback to software WebGL/.test(l.text)) console.log(`[browser ${l.type}]`, l.text.slice(0, 400)); },
  });
  console.log(`${output}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
