/**
 * One motion language for the whole site. The same values exist as CSS custom properties in
 * styles/global.css (--ease-*, --dur-*); keep the two in step.
 *
 * Everything eases in and out; nothing bounces. Text staggers by line, never by letter.
 */

/** Durations in milliseconds. */
export const DUR = {
  /** hover, press */
  micro: 160,
  /** panels, cards changing */
  panel: 280,
  /** page transitions */
  page: 240,
  /** a section revealing itself */
  reveal: 900,
  /** how long the 3D takes to fade in over its still */
  fadeIn: 700,
} as const;

/**
 * How quickly scroll-driven scenes follow the scroll: each frame closes this share of the gap per
 * 16.7 ms (an exponential follow, so a scene settles within about half a second of the scroll
 * stopping, and never overshoots).
 */
export const FOLLOW = 0.14;

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before a, 1 after b, linear in between. */
export const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

export const ease = {
  linear: (t: number) => t,
  /** entering things */
  out: (t: number) => 1 - (1 - t) ** 3,
  outQuint: (t: number) => 1 - (1 - t) ** 5,
  /** leaving things */
  in: (t: number) => t * t * t,
  /** camera moves and anything that both starts and stops */
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  smooth: (t: number) => t * t * (3 - 2 * t),
} as const;

/** Exponential follow that does not depend on the frame rate. */
export const follow = (current: number, target: number, dtMs: number, rate = FOLLOW) =>
  current + (target - current) * (1 - (1 - rate) ** (dtMs / 16.7));
