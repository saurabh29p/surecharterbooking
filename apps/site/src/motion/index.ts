/**
 * Motion boot. Runs once the page has painted. Under `.motion` (set before first paint unless the
 * visitor asked for reduced motion or Save-Data) it switches on the scroll choreography for each
 * [data-chapter], then, on capable devices, starts the 3D engine once the page has settled.
 * Chapters and scenes are separate chunks, loaded only on pages that have them.
 */
import { detectTier } from './tier';

const CHAPTERS = import.meta.glob<{ default: (el: HTMLElement) => void }>('./chapters/*.ts');
const STAGES = {
  showroom: () => import('../three/scenes/showroom'),
  mark: () => import('../three/scenes/mark'),
  map: () => import('../three/scenes/map'),
  shreeji: () => import('../three/scenes/shreeji'),
};

export function startMotion() {
  const root = document.documentElement;
  if (!root.classList.contains('motion')) return;
  for (const el of document.querySelectorAll<HTMLElement>('[data-chapter]')) {
    const load = CHAPTERS[`./chapters/${el.dataset.chapter}.ts`];
    void load?.().then((m) => m.default(el));
  }
  root.classList.add('motion-ready');
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) void import('./magnetic').then((m) => m.magnetic());

  if (!document.querySelector('[data-stage]')) return;
  const tier = detectTier();
  root.dataset.tier = tier;
  if (tier === 'low') return;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    void import('../three/engine').then((m) => m.startEngine(tier, STAGES));
  };
  // The 3D (three.js, the renderer, the models) costs about half a second of main-thread time on a
  // mid-range phone, so it never starts while the page is loading: only once a 3D moment is about to
  // come into view, or after the page has sat idle for a few seconds, whichever is first. Until then
  // each moment shows its still, and the setup never competes with the first paint or the first taps.
  const afterLoad = (fn: () => void) => {
    if (document.readyState === 'complete') fn();
    else addEventListener('load', fn, { once: true });
  };
  afterLoad(() => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 2000 }) : start()), 4000));
  const soon = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      soon.disconnect();
      afterLoad(() => setTimeout(start, 300));
    },
    { rootMargin: '15% 0px 15% 0px' },
  );
  document.querySelectorAll('[data-stage]').forEach((s) => soon.observe(s));
}
