/**
 * Motion boot. Runs once the page has painted. Under `.motion` (set before first paint unless the
 * visitor asked for reduced motion or Save-Data) it switches on the scroll choreography for each
 * [data-chapter], then, on capable devices, starts the 3D engine once the page has settled.
 * Chapters and scenes are separate chunks, loaded only on pages that have them.
 */
import { detectTierInfo } from './tier';

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

  const stages = [...document.querySelectorAll<HTMLElement>('[data-stage]')];
  if (!stages.length) return;
  // the stills are lazy for the first paint; once the page has loaded they all start downloading
  // (low priority), so a fast scroll or a jump to a section never finds one missing
  const loadStills = () =>
    setTimeout(() => {
      for (const img of document.querySelectorAll<HTMLImageElement>('img.stage__still[loading="lazy"]')) img.loading = 'eager';
    }, 600);
  if (document.readyState === 'complete') loadStills();
  else addEventListener('load', loadStills, { once: true });
  const info = detectTierInfo();
  const tier = info.tier;
  root.dataset.tier = tier;
  root.dataset.tierWhy = info.reason;
  if (tier === 'low') {
    for (const s of stages) {
      s.dataset.three = 'off';
      s.dataset.threeWhy = `no 3D on this device: ${info.reason}`;
    }
    return;
  }
  // Never an empty frame: each stage shows its still until its 3D has drawn a checked first frame.
  // If the still has been on screen for 1.5 s and the 3D has not taken over, the still stays.
  const deadline = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        deadline.unobserve(e.target);
        const el = e.target as HTMLElement;
        setTimeout(() => {
          const was = el.dataset.three ?? 'not started';
          if (was === 'live' || was === 'off') return;
          el.dataset.three = 'off';
          el.dataset.threeWhy = `the 3D was not ready 1.5 s after it came into view (it was ${was})`;
        }, 1500);
      }
    },
    { threshold: 0.25 },
  );
  // (?still renders the stills themselves: no deadline)
  if (!/[?&]still\b/.test(location.search)) stages.forEach((s) => deadline.observe(s));
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    void import('../three/engine')
      .then((m) => m.startEngine(tier, STAGES))
      .catch((err) => {
        // no WebGL after all (or the 3D failed to start): every stage keeps its still
        root.dataset.engine = `failed: ${err instanceof Error ? err.message : String(err)}`;
        for (const s of stages) {
          s.dataset.three = 'off';
          s.dataset.threeWhy = 'the 3D could not start';
        }
      });
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
  stages.forEach((s) => soon.observe(s));
}
