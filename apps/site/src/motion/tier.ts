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
  if (i.forced) return i.forced;
  if (i.reducedMotion || i.saveData || !i.webgl) return 'low';
  const r = i.renderer ?? '';
  if (SOFTWARE.test(r) || WEAK.test(r)) return 'low';
  if (i.memory !== undefined && i.memory < 2) return 'low';
  if (i.cores !== undefined && i.cores < 4) return 'low';
  if (i.frameMs !== undefined && i.frameMs > 34) return 'low';
  if (MID.test(r)) return 'mid';
  if (i.mobile && i.memory !== undefined && i.memory <= 4) return 'mid';
  if (i.cores !== undefined && i.cores <= 4) return 'mid';
  if (i.frameMs !== undefined && i.frameMs > 20) return 'mid';
  return 'high';
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
  const nav = navigator as Nav;
  const forced = forcedTier();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!nav.connection?.saveData;
  const probe = forced || reducedMotion || saveData ? { webgl: !!forced } : probeWebgl();
  return decideTier({
    ...probe,
    reducedMotion,
    saveData,
    memory: nav.deviceMemory,
    cores: nav.hardwareConcurrency || undefined,
    mobile: matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820,
    forced,
  });
}
