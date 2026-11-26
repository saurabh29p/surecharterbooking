/**
 * Models and materials. The .glb files are the film's own models (video/scripts/export-gltf.mjs on
 * the video-film branch); their material names and the livery shaders travel inside them, so the
 * aircraft here are painted by the same code as in the film.
 */
import {
  CanvasTexture,
  Color,
  DataTexture,
  EquirectangularReflectionMapping,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PMREMGenerator,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Tier } from '../motion/tier';
import jetUrl from '../assets/3d/jet.glb?url';
import airlinerUrl from '../assets/3d/airliner.glb?url';
import helicopterUrl from '../assets/3d/helicopter.glb?url';
import palaceUrl from '../assets/3d/palace.glb?url';
import markUrl from '../assets/3d/mark.glb?url';

export const MODELS = { jet: jetUrl, airliner: airlinerUrl, helicopter: helicopterUrl, palace: palaceUrl, mark: markUrl };
export type ModelName = keyof typeof MODELS;

const loader = new GLTFLoader();
const cache = new Map<ModelName, Promise<Object3D>>();

/** A fresh copy of a model (geometry shared; materials replaced by the caller). */
export async function model(name: ModelName): Promise<Object3D> {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(MODELS[name]).then((g) => g.scene));
  return (await cache.get(name)!).clone(true);
}

let envCache: Texture | null = null;

/**
 * Reflections: a small painted sky (midnight above, a warm gold horizon, dark ground), prefiltered
 * once. Gives the paint and chrome the brand's gold highlights without downloading an HDRI.
 */
export function environment(renderer: WebGLRenderer): Texture {
  if (envCache) return envCache;
  const W = 128, H = 64;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = 1 - y / (H - 1); // rows run bottom to top: v = 0 is straight up, 1 straight down
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const horizon = Math.exp(-(((v - 0.52) / 0.05) ** 2));
      const warm = 0.5 + 0.5 * Math.cos((u - 0.15) * Math.PI * 2);
      const key = Math.exp(-(((u - 0.15) / 0.08) ** 2) - (((v - 0.3) / 0.12) ** 2));
      let r = v < 0.52 ? 14 + 22 * (v / 0.52) : 10, g = v < 0.52 ? 18 + 24 * (v / 0.52) : 9, b = v < 0.52 ? 40 + 40 * (v / 0.52) : 12;
      r += horizon * (90 + 120 * warm) + key * 255;
      g += horizon * (62 + 80 * warm) + key * 230;
      b += horizon * (30 + 30 * warm) + key * 200;
      const i = (y * W + x) * 4;
      data[i] = Math.min(255, r);
      data[i + 1] = Math.min(255, g);
      data[i + 2] = Math.min(255, b);
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, W, H);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  const pm = new PMREMGenerator(renderer);
  envCache = pm.fromEquirectangular(tex).texture;
  pm.dispose();
  tex.dispose();
  return envCache;
}

const LIVERY_VERT = 'varying vec2 vHullUv; varying vec2 vHUv; uniform float uUvLength;';
/** The film's livery shader (from the model's extras), on a site material. */
function livery(base: MeshStandardMaterial, glsl: string, uvLength: number, cabinGlow: number) {
  base.onBeforeCompile = (sh) => {
    sh.uniforms.uUvLength = { value: uvLength };
    sh.uniforms.uCabin = { value: cabinGlow };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${LIVERY_VERT}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHullUv = vHUv = vec2(uv.x * uUvLength, uv.y);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHullUv; varying vec2 vHUv; uniform float uCabin; float gCab = 0.;')
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${glsl}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1., .62, .3) * gCab * uCabin;');
  };
  base.customProgramCacheKey = () => `livery${uvLength}`;
  return base;
}

const ENV: Record<string, number> = { chrome: 1.3, glass: 1.8, paint: 1.0, plain: 1.0, wing: 1.0, gold: 1.4, metal: 1.3, navy: 1.2, ivory: 1.1, blade: 0.25, dark: 0.5, tyre: 0.3 };

/**
 * Replace the glTF's materials with the site's: PBR values from the file, the livery shader where the
 * file carries one, emissive lights unlit. Mid tier: standard materials (no clearcoat).
 */
export function dressAircraft(root: Object3D, env: Texture, tier: Tier, opts: { cabinGlow?: number } = {}) {
  const made = new Map<Material, Material>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const src = m.material as MeshPhysicalMaterial;
    if (!made.has(src)) {
      let out: Material;
      if (src.name === 'exhaustM') {
        // the film's glowing exhaust reads as two lamps on a studio floor: plain dark metal here
        out = new MeshStandardMaterial({ color: '#1b1d22', metalness: 0.8, roughness: 0.45, envMap: env, side: src.side });
      } else if (src.userData.unlit || src.emissiveIntensity > 1.01) {
        out = new MeshBasicMaterial({ color: src.emissive.clone().multiplyScalar(Math.min(3, src.emissiveIntensity)), toneMapped: false });
      } else {
        const params = {
          name: src.name,
          color: src.color.clone(),
          roughness: src.roughness,
          metalness: src.metalness,
          envMap: env,
          envMapIntensity: ENV[src.name] ?? 1,
          transparent: src.transparent,
          opacity: src.opacity,
          side: src.side,
        };
        const physical = tier === 'high' && src.clearcoat > 0;
        out = physical
          ? new MeshPhysicalMaterial({ ...params, clearcoat: src.clearcoat, clearcoatRoughness: src.clearcoatRoughness })
          : new MeshStandardMaterial(params);
        const ud = src.userData as { glsl?: string; uvLength?: number };
        if (ud.glsl) livery(out as MeshStandardMaterial, ud.glsl, ud.uvLength ?? 1, opts.cabinGlow ?? 0.09);
      }
      made.set(src, out);
    }
    m.material = made.get(src)!;
  });
  return root;
}

/** Rasterise an SVG string (the logo's own elements) into a texture, via an image (CSP: data: images). */
export async function svgTexture(svg: string, width: number, height: number, scale: number): Promise<CanvasTexture> {
  const sized = svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${Math.round(width * scale)}" height="${Math.round(height * scale)}"`);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const gold = new Color('#d9bc78');
