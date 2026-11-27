/**
 * Device tier: how much of the 3D a device gets.
 *
 * - high: the full 3D scenes.
 * - mid: the same scenes with simpler materials, fewer particles and a lower pixel ratio.
 * - low: no WebGL at all; rendered stills and CSS reveals.
 *
 * Reduced motion, Save-Data, no WebGL, a software renderer, very little memory or too few cores
 * mean low. `decideTier` is pure (unit-tested); `detectTier` gathers the inputs in the browser.
 */
export type Tier = 'high' | 'mid' | 'low';

export interface TierInput {
  reducedMotion: boolean;
  saveData: boolean;
  /** a WebGL 2 context could be created */
  webgl: boolean;
  /** WebGL renderer string, when the browser shares it */
  renderer?: string;
  /** navigator.deviceMemory (GB), when known */
  memory?: number;
  /** navigator.hardwareConcurrency, when known */
  cores?: number;
  /** a phone or tablet (coarse pointer, small screen) */
  mobile: boolean;
  /** median frame time (ms) measured while the 3D first runs, if already known */
  frameMs?: number;
  /** ?tier= in the URL, for testing */
  forced?: Tier | null;
}

/** Software rasterisers: WebGL works but every frame is drawn on the CPU. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
/** GPUs too old for the scenes at a steady frame rate. */
const WEAK = /mali-[2-4]\d\d|mali-t[6-8]\d\d|adreno[^0-9]*[2-4]\d\d|powervr sgx|powervr rogue g6|intel.*(hd graphics [2-5]\d\d\b|gma)/i;
/** Mid-range mobile GPUs: fine with lighter scenes. */
const MID = /adreno[^0-9]*(5\d\d|6[0-4]\d)|mali-g(3\d|5\d|6\d|7[0-6])\b|powervr|xclipse 5|immortalis-g7[0-1]/i;

export function decideTier(i: TierInput): Tier {
  return explainTier(i).tier;
}

/** The tier and the reason for it (shown by ?debug=3d). */
export function explainTier(i: TierInput): { tier: Tier; reason: string } {
  const r = i.renderer ?? '';
  const t = (tier: Tier, reason: string) => ({ tier, reason });
  if (i.forced) return t(i.forced, 'forced with ?tier=');
  if (i.reducedMotion) return t('low', 'reduced motion is on');
  if (i.saveData) return t('low', 'Save-Data is on');
  if (!i.webgl) return t('low', 'no WebGL 2 (or a major performance caveat)');
  if (SOFTWARE.test(r)) return t('low', 'software renderer');
  if (WEAK.test(r)) return t('low', 'older GPU');
  if (i.memory !== undefined && i.memory < 2) return t('low', `${i.memory} GB memory`);
  if (i.cores !== undefined && i.cores < 4) return t('low', `${i.cores} CPU cores`);
  if (i.frameMs !== undefined && i.frameMs > 34) return t('low', `slow frames (${Math.round(i.frameMs)} ms)`);
  if (MID.test(r)) return t('mid', 'mid-range mobile GPU');
  if (i.mobile && i.memory !== undefined && i.memory <= 4) return t('mid', `phone with ${i.memory} GB memory`);
  if (i.cores !== undefined && i.cores <= 4) return t('mid', `${i.cores} CPU cores`);
  if (i.frameMs !== undefined && i.frameMs > 20) return t('mid', `frames at ${Math.round(i.frameMs)} ms`);
  return t('high', 'capable device');
}

/** One step down (used when the frame-time check fails at run time). */
export const lower = (t: Tier): Tier => (t === 'high' ? 'mid' : 'low');

type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

/** The renderer string, from a throwaway WebGL 2 context (null when WebGL 2 is unavailable). */
function probeWebgl(): { webgl: boolean; renderer?: string } {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return { webgl: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl: true, renderer };
  } catch {
    return { webgl: false };
  }
}

export function forcedTier(search = location.search): Tier | null {
  const m = /[?&]tier=(high|mid|low)\b/.exec(search);
  return m ? (m[1] as Tier) : null;
}

export function detectTier(): Tier {
  return detectTierInfo().tier;
}

/** Everything the tier was decided from, and the decision (for ?debug=3d). */
export function detectTierInfo() {
  const nav = navigator as Nav;
  const forced = forcedTier();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!nav.connection?.saveData;
  const probe = forced || reducedMotion || saveData ? { webgl: !!forced } : probeWebgl();
  const input: TierInput = {
    ...probe,
    reducedMotion,
    saveData,
    memory: nav.deviceMemory,
    cores: nav.hardwareConcurrency || undefined,
    mobile: matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820,
    forced,
  };
  return { ...explainTier(input), input };
}
