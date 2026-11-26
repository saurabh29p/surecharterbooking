/**
 * Destinations: a pinned map. The route list lights each route as its contrail draws; the pins (HTML,
 * placed by three/scenes/map.ts) open a small card on hover, focus or tap.
 */
import { addChapter, pinned } from '../loop';
import { HOME_ROUTES } from '../routes';

export default function dest(track: HTMLElement) {
  const items = [...track.querySelectorAll<HTMLElement>('[data-route]')];
  addChapter({
    el: track,
    measure: pinned,
    update(p) {
      items.forEach((li, i) => li.classList.toggle('is-on', p >= (HOME_ROUTES[i]?.at[0] ?? 1)));
    },
  });
  for (const item of track.querySelectorAll<HTMLElement>('[data-pin]')) {
    const btn = item.querySelector<HTMLButtonElement>('button');
    btn?.addEventListener('click', () => {
      const open = !item.classList.contains('is-open');
      for (const other of track.querySelectorAll('[data-pin].is-open')) {
        other.classList.remove('is-open');
        other.querySelector('button')?.setAttribute('aria-expanded', 'false');
      }
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  }
}
