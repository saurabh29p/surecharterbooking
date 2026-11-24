import tl from '../data/timeline.json';

export const TL = tl;
export const FPS = tl.fps;
export const sec = (s: number) => Math.round(s * FPS);

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 at a, 1 at b, clamped. */
export const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
export const smooth = (x: number) => x * x * (3 - 2 * x);
export const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
/** Smooth window: rises over [a, a+fi], falls over [b-fo, b]. */
export const windowed = (x: number, a: number, b: number, fi: number, fo: number) =>
  smooth(ramp(x, a, a + fi)) * (1 - smooth(ramp(x, b - fo, b)));
