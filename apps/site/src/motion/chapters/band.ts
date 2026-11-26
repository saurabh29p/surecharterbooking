/** Inner pages' 3D bands: the scene plays as the band passes through the window (data-range remaps it). */
import { addChapter, inView } from '../loop';
import { ramp } from '../tokens';

export default function band(el: HTMLElement) {
  const [a, b] = (el.dataset.range ?? '0,1').split(',').map(Number);
  addChapter({ el, measure: (r, vh) => ramp(inView(r, vh), a ?? 0, b ?? 1) });
}
