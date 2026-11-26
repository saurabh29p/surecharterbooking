/**
 * The Vaanika Standard: the check nearest the reading line is the active one; the mark beside it
 * (three/scenes/mark.ts, mode "checks") lights the matching part from this chapter's progress.
 */
import { addChapter, reading } from '../loop';

export default function standard(section: HTMLElement) {
  const list = section.querySelector<HTMLElement>('.standard__checks');
  if (!list) return;
  const checks = [...list.querySelectorAll<HTMLElement>('[data-check]')];
  let active = -1;
  addChapter({
    el: section,
    measureEl: list,
    measure: reading,
    update(p) {
      const a = Math.min(checks.length - 1, Math.max(0, Math.floor(p * checks.length)));
      if (a === active) return;
      active = a;
      checks.forEach((c, i) => c.classList.toggle('is-active', i === a));
    },
  });
}
