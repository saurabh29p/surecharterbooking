// Render a composition (video only; audio is muxed separately by scripts/mux.mjs).
// node scripts/render.mjs <Composition> <out.mov|out.mp4> [--scale=1] [--frames=0-1139] [--codec=prores|h264] [--profile=hq|4444] [--alpha=1] [--concurrency=2]
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'node:path';

const [comp, out, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), onProgress: () => {} });
const composition = await selectComposition({ serveUrl, id: comp, inputProps: {} });
const codec = opt.codec ?? (out.endsWith('.mov') ? 'prores' : 'h264');
const frameRange = opt.frames ? opt.frames.split('-').map(Number) : null;
const t0 = Date.now();
let last = 0;
await renderMedia({
  serveUrl, composition, codec, outputLocation: out,
  ...(codec === 'prores' ? { proResProfile: opt.profile ?? 'hq' } : { crf: Number(opt.crf ?? 12), x264Preset: 'slow' }),
  pixelFormat: opt.alpha ? 'yuva444p10le' : codec === 'prores' ? 'yuv422p10le' : 'yuv420p',
  colorSpace: 'bt709',
  imageFormat: opt.img ?? 'png',
  ...(opt.img === 'jpeg' ? { jpegQuality: 95 } : {}),
  scale: Number(opt.scale ?? 1),
  muted: true,
  frameRange,
  concurrency: Number(opt.concurrency ?? 2),
  chromiumOptions: { gl: 'swangle' },
  timeoutInMilliseconds: 300000,
  onProgress: ({ renderedFrames, encodedFrames }) => {
    if (Date.now() - last > 30000) { last = Date.now(); console.log(`rendered ${renderedFrames}, encoded ${encodedFrames}, ${((Date.now() - t0) / 1000).toFixed(0)}s`); }
  },
  onBrowserLog: (l) => { if (l.type === 'error' && !/fallback to software WebGL/.test(l.text)) console.log('[browser]', l.text.slice(0, 300)); },
});
console.log(`done ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
