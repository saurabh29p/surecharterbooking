/**
 * Three moments: pinned, the panels slide past horizontally as the page scrolls down (native scroll;
 * CSS does the moving from --p and --shift). Reading order and keyboard order stay top to bottom.
 */
import { addChapter, pinned } from '../loop';

export default function moments(section: HTMLElement) {
  const grid = section.querySelector<HTMLElement>('.moments__grid');
  const box = grid?.parentElement;
  if (!grid || !box) return;
  const measure = () => {
    const cs = getComputedStyle(box);
    const inner = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    section.style.setProperty('--shift', `${Math.max(0, grid.scrollWidth - inner)}px`);
  };
  measure();
  addEventListener('resize', measure);
  addChapter({
    el: section,
    measure: pinned,
    update(p) {
      section.style.setProperty('--p', p.toFixed(4));
    },
  });
}
