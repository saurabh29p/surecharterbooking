/**
 * The Vaanika Standard: the card nearest the middle of the window is the active one. Its border glows,
 * and so does its part of the lotus: the DOM glow over the still (CSS, from data-active on the
 * section) and, when the 3D has taken over, the 3D part itself (data-active on the stage).
 * Card positions are measured on resize, not every frame, so scrolling never forces a layout.
 */
import { addChapter, inView } from '../loop';

export default function standard(section: HTMLElement) {
  const checks = [...section.querySelectorAll<HTMLElement>('[data-check]')];
  const stage = section.querySelector<HTMLElement>('[data-stage]');
  let centres: number[] = [];
  const measure = () => {
    centres = checks.map((c) => {
      const r = c.getBoundingClientRect();
      return r.top + window.scrollY + r.height / 2;
    });
  };
  measure();
  addEventListener('resize', measure);
  addEventListener('load', measure, { once: true });
  new ResizeObserver(measure).observe(section);

  let active = -2;
  addChapter({
    el: section,
    measure: inView,
    update() {
      const mid = window.scrollY + window.innerHeight / 2;
      // the nearest card, if it is within the middle third of the window
      let best = -1;
      let dist = window.innerHeight / 3;
      centres.forEach((c, i) => {
        const d = Math.abs(c - mid);
        if (d < dist) {
          dist = d;
          best = i;
        }
      });
      if (best === active) return;
      active = best;
      const value = best < 0 ? '' : String(best);
      section.dataset.active = value;
      if (stage) stage.dataset.active = value;
      checks.forEach((c, i) => c.classList.toggle('is-active', i === best));
    },
  });
}
