/**
 * Hero: as the page scrolls, the film grows a little and dims into the night sky, and the words lift
 * away a line at a time (eyebrow, each line of the headline, the sub-line, the button). CSS does the
 * moving from --p and each line's index (--l).
 */
import { addChapter, leaving } from '../loop';

export default function hero(section: HTMLElement) {
  const lines = () => {
    let l = 0;
    const tag = (el: Element | null) => {
      if (!el || (el as HTMLElement).offsetParent === null) return;
      (el as HTMLElement).dataset.l = '';
      (el as HTMLElement).style.setProperty('--l', String(l++));
    };
    tag(section.querySelector('.hero__eyebrow'));
    // words of the headline, grouped by the line they sit on
    let top = -1;
    for (const w of section.querySelectorAll<HTMLElement>('.hero__w')) {
      if (top >= 0 && Math.abs(w.offsetTop - top) > 4) l++;
      top = w.offsetTop;
      w.dataset.l = '';
      w.style.setProperty('--l', String(l));
    }
    l++;
    section.querySelectorAll('.hero__sub').forEach((el) => tag(el));
    tag(section.querySelector('.hero__actions'));
  };
  lines();
  addEventListener('resize', lines);
  addChapter({
    el: section,
    measure: leaving,
    update(p) {
      section.style.setProperty('--p', p.toFixed(4));
    },
  });
}
