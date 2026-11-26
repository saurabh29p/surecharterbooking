import { ease, ramp } from './tokens';

/**
 * Stepped chapters (the showroom, the four checks): which step the scroll is on and how far into the
 * change to the next one. Each step holds for half its range; the change is eased in and out around
 * the midpoint, where the active step switches.
 */
export function stepAt(p: number, n: number) {
  const s = Math.min(n - 1, Math.max(0, p * (n - 1)));
  const k = Math.min(n - 2, Math.floor(s));
  return { k, t: ease.inOut(ramp(s - k, 0.25, 0.75)), active: Math.round(s) };
}

/** The scroll position (px from the top of the page) where step i of a pinned chapter is centred. */
export function scrollForStep(track: HTMLElement, i: number, n: number) {
  const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0;
  const top = track.getBoundingClientRect().top + window.scrollY - header;
  return top + (i / (n - 1)) * Math.max(0, track.offsetHeight - (window.innerHeight - header));
}
