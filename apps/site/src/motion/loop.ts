/**
 * The one scroll loop. Scroll stays native: this only reads where each chapter is and turns it into
 * a progress value (0..1) that eases after the scroll, so scenes settle within about half a second
 * once the visitor stops. Frames run only while something is changing; when everything has settled
 * the loop stops.
 */
import { follow } from './tokens';

export type Measure = (r: DOMRect, vh: number) => number;

/** Height of the sticky header: pinned sections stick just below it. */
let pinTop = 0;
const readPinTop = () => {
  pinTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0;
};
readPinTop();
addEventListener('resize', readPinTop);

/** Pinned chapters: 0 when the section's top reaches the header, 1 when its end reaches the bottom. */
export const pinned: Measure = (r, vh) => {
  const room = r.height - (vh - pinTop);
  return room > 0 ? (pinTop - r.top) / room : r.top < pinTop ? 1 : 0;
};
/** Reading line: 0 when the element's top reaches the middle of the window, 1 when its bottom does. */
export const reading: Measure = (r, vh) => (vh * 0.5 - r.top) / r.height;
/** In view: 0 as the top enters at the bottom of the window, 1 as the bottom leaves at the top. */
export const inView: Measure = (r, vh) => (vh - r.top) / (vh + r.height);
/** Leaving: 0 at rest at the top of the page, 1 once the section has scrolled out at the top. */
export const leaving: Measure = (r) => (window.scrollY > 0 ? window.scrollY / Math.max(1, r.bottom + window.scrollY) : 0);

export interface Chapter {
  /** the chapter element (its 3D stage reads this chapter's progress) */
  el: HTMLElement;
  /** the element whose position is measured, if not the chapter element itself */
  measureEl?: HTMLElement;
  measure: Measure;
  /** Called with the eased progress. Return true to ask for another frame (something still moving). */
  update?: (p: number, dtMs: number) => boolean | void;
}

interface Live extends Chapter {
  target: number;
  current: number;
  near: boolean;
  fresh: boolean;
}

const clamp = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const live: Live[] = [];
const hooks = new Set<(dtMs: number) => boolean | void>();
/** The latest eased progress of each chapter element, for the 3D stages inside it. */
export const progressOf = new WeakMap<Element, number>();

let raf = 0;
let last = 0;

const near = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const c = live.find((l) => (l.measureEl ?? l.el) === e.target);
      if (!c) continue;
      c.near = e.isIntersecting;
      // jump straight to the right state on arrival (anchor links, fast flicks), then ease
      if (c.near) c.fresh = true;
    }
    kick();
  },
  { rootMargin: '60% 0px 60% 0px' },
);

export function addChapter(ch: Chapter) {
  const c: Live = { ...ch, target: 0, current: 0, near: false, fresh: true };
  live.push(c);
  near.observe(ch.measureEl ?? ch.el);
  kick();
  return c;
}

/** Run something every frame while the loop is awake (the 3D engine). Return true to keep it awake. */
export function onFrame(fn: (dtMs: number) => boolean | void) {
  hooks.add(fn);
  kick();
  return () => hooks.delete(fn);
}

export function kick() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick(now: number) {
  raf = 0;
  const dt = last ? Math.min(64, now - last) : 16.7;
  last = now;
  const vh = window.innerHeight;
  let more = false;
  // read every rectangle first, then write, so layout is computed once per frame
  for (const c of live) if (c.near || c.fresh) c.target = clamp(c.measure((c.measureEl ?? c.el).getBoundingClientRect(), vh));
  for (const c of live) {
    if (!c.near && !c.fresh) continue;
    if (c.fresh) {
      c.current = c.target;
      c.fresh = false;
    } else {
      c.current = follow(c.current, c.target, dt);
      if (Math.abs(c.current - c.target) < 1e-4) c.current = c.target;
      else more = true;
    }
    progressOf.set(c.el, c.current);
    if (c.update?.(c.current, dt)) more = true;
  }
  for (const h of hooks) if (h(dt)) more = true;
  if (more) kick();
  else last = 0;
}

addEventListener('scroll', kick, { passive: true });
addEventListener('resize', () => {
  for (const c of live) c.fresh = true;
  kick();
});
