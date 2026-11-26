// Export the film's models (src/models) as compact glTF files for the website's 3D scenes:
//   node scripts/export-gltf.mjs [outDir]        (default: out/gltf)
// Builds the models in headless Chromium with the film's own code (scripts/export-gltf/page.tsx),
// then welds, simplifies (meshoptimizer, error-bounded) and quantises them (KHR_mesh_quantization,
// read by three.js's GLTFLoader with no decoder or WebAssembly). Copy the .glb files to
// apps/site/src/assets/3d/ on the site branch.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

// Playwright is the machine's own install (not a dependency of the film): require() finds it via NODE_PATH
const { chromium } = createRequire(import.meta.url)('playwright');

const outDir = path.resolve(process.argv[2] ?? 'out/gltf');
await mkdir(outDir, { recursive: true });
const bundle = path.join(outDir, 'page.js');
await build({
  entryPoints: ['scripts/export-gltf/page.tsx'],
  bundle: true,
  format: 'iife',
  outfile: bundle,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[browser]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ path: bundle });
const files = await page.evaluate(() => window.exportAll());
await browser.close();

// prune keeps TEXCOORD_0 although no texture uses it: the livery shader and the logo faces read it.
// Simplification per model: the error is relative to each mesh's size, so small parts keep their shape.
const SIMPLIFY = { jet: 0.0003, airliner: 0.0003, helicopter: 0.0004, palace: 0.0008, mark: 0.0005 };
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [name, b64] of Object.entries(files)) {
  const doc = await io.readBinary(new Uint8Array(Buffer.from(b64, 'base64')));
  const steps = [dedup(), weld()];
  // thin surface patches (windscreen glass and its frame) sit millimetres above the hull: simplifying
  // them would flatten them under it, so they keep every triangle
  if (SIMPLIFY[name])
    steps.push((d) => {
      for (const mesh of d.getRoot().listMeshes())
        for (const prim of mesh.listPrimitives())
          if (!['glass', 'frame'].includes(prim.getMaterial()?.getName() ?? ''))
            simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error: SIMPLIFY[name], lockBorder: false });
    });
  steps.push(quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeColor: 8 }), prune({ keepAttributes: true }));
  await doc.transform(...steps);
  const out = await io.writeBinary(doc);
  const tris = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  await writeFile(path.join(outDir, `${name}.glb`), out);
  console.log(`${name}.glb  ${(out.byteLength / 1024).toFixed(0)} KB  ${Math.round(tris)} triangles`);
}
