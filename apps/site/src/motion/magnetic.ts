/**
 * Desktop only: primary buttons lean gently toward the pointer as it nears them (at most 6 px), and
 * settle back when it leaves. Uses the `translate` property, so the buttons' own hover lift still works.
 */
const MAX = 6;

export function magnetic() {
  for (const el of document.querySelectorAll<HTMLElement>('.btn--gold, .btn--ivory, [data-magnetic]')) {
    let raf = 0;
    const set = (x: number, y: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => el.style.setProperty('translate', `${x}px ${y}px`));
    };
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      set(Math.max(-1, Math.min(1, dx)) * MAX, Math.max(-1, Math.min(1, dy)) * MAX * 0.6);
    });
    el.addEventListener('pointerleave', () => set(0, 0));
  }
}
