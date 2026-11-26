/** The Shreeji Arrival: pinned; the 3D scene reads this chapter's progress (three/scenes/shreeji.ts). */
import { addChapter, pinned } from '../loop';

export default function shreeji(section: HTMLElement) {
  addChapter({ el: section, measure: pinned });
}
