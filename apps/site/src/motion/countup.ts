import { DUR, ease } from './tokens';

const running = new WeakMap<Element, number>();

/**
 * Count the numbers already written in an element up from zero (e.g. "About 12–14 guests"), then put
 * the original text back. Only numbers that exist on the page are ever shown.
 */
export function countUp(el: Element | null, ms = DUR.reveal * 0.8) {
  if (!el) return;
  const nodes: { node: Text; text: string }[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n as Text;
    if (/\d/.test(t.data)) nodes.push({ node: t, text: t.data });
  }
  if (!nodes.length) return;
  cancelAnimationFrame(running.get(el) ?? 0);
  const t0 = performance.now();
  const step = (now: number) => {
    const k = ease.outQuint(Math.min(1, (now - t0) / ms));
    for (const { node, text } of nodes) node.data = k >= 1 ? text : text.replace(/\d+/g, (d) => String(Math.round(Number(d) * k)));
    if (k < 1) running.set(el, requestAnimationFrame(step));
  };
  running.set(el, requestAnimationFrame(step));
}
