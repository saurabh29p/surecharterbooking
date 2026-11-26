/**
 * Choose your arrival: a pinned showroom. The scroll steps through the five classes; the card, the
 * still (when there is no 3D) and the step dots follow. Focusing a card with the keyboard scrolls to
 * its step, so nothing is ever focused while hidden.
 */
import { countUp } from '../countup';
import { addChapter, pinned } from '../loop';
import { scrollForStep, stepAt } from '../steps';

export default function fleet(track: HTMLElement) {
  const cards = [...track.querySelectorAll<HTMLElement>('.fleet__card')];
  const marks = [...track.querySelectorAll<HTMLElement>('[data-step]')];
  const n = cards.length;
  let active = -1;
  addChapter({
    el: track,
    measure: pinned,
    update(p) {
      track.style.setProperty('--p', p.toFixed(4));
      const { active: a } = stepAt(p, n);
      if (a === active) return;
      const first = active < 0;
      active = a;
      track.dataset.active = String(a);
      cards.forEach((c, i) => c.classList.toggle('is-active', i === a));
      for (const m of marks) m.classList.toggle('is-active', Number(m.dataset.step) === a);
      if (!first) countUp(cards[a]?.querySelector('.fleet__seats'));
    },
  });
  track.addEventListener('focusin', (e) => {
    const i = cards.findIndex((c) => c.contains(e.target as Node));
    if (i >= 0 && i !== active) window.scrollTo({ top: scrollForStep(track, i, n), behavior: 'instant' });
  });
}
