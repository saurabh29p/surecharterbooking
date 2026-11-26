/** The name story: pinned; the lotus opens with the scroll, and each part's name appears (CSS from --p). */
import { addChapter, pinned } from '../loop';

export default function name(section: HTMLElement) {
  addChapter({
    el: section,
    measure: pinned,
    update(p) {
      section.style.setProperty('--p', p.toFixed(4));
    },
  });
}
