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
};

export function startMotion() {
  const root = document.documentElement;
  if (!root.classList.contains('motion')) return;
  for (const el of document.querySelectorAll<HTMLElement>('[data-chapter]')) {
    const load = CHAPTERS[`./chapters/${el.dataset.chapter}.ts`];
    void load?.().then((m) => m.default(el));
  }
  root.classList.add('motion-ready');

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
  // after the page has settled (load, then an idle moment), or sooner if a stage is about to show
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 600));
  if (document.readyState === 'complete') setTimeout(idle, 800);
  else addEventListener('load', () => setTimeout(idle, 800), { once: true });
  const soon = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && document.readyState === 'complete') {
        soon.disconnect();
        start();
      }
    },
    { rootMargin: '100% 0px 100% 0px' },
  );
  document.querySelectorAll('[data-stage]').forEach((s) => soon.observe(s));
}
