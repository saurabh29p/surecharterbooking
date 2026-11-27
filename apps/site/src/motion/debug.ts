/**
 * ?debug=3d: a small panel showing which tier this device got and why, the GPU, and what each 3D
 * stage is doing (waiting, loading, live, or keeping its still and why). For testing on real phones;
 * loaded only when the parameter is present.
 */
import { detectTierInfo } from './tier';

function gpu(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'no WebGL 2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return r;
  } catch {
    return 'WebGL error';
  }
}

export function showDebug() {
  const root = document.documentElement;
  const info = detectTierInfo();
  const box = document.createElement('div');
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'off');
  // inline styles through the CSSOM (allowed by the content security policy)
  Object.assign(box.style, {
    position: 'fixed',
    right: '8px',
    top: 'calc(var(--header-h) + 8px)',
    zIndex: '100',
    maxWidth: 'min(88vw, 400px)',
    padding: '8px 10px',
    borderRadius: '10px',
    background: 'rgba(5, 7, 15, 0.92)',
    border: '1px solid #8c6a2f',
    color: '#f3ede2',
    font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
    whiteSpace: 'pre-wrap',
    cursor: 'pointer',
  });
  // tap to fold it to one line (and back), so it never sits on what you are checking
  let folded = false;
  box.addEventListener('click', () => {
    folded = !folded;
    draw();
  });
  document.body.append(box);
  const gpuName = gpu();
  const i = info.input;
  function draw() {
    const tier = root.dataset.tier ?? info.tier;
    const lines = [
      `3D debug`,
      `tier: ${tier} (${root.dataset.tierWhy ?? info.reason})`,
      `motion: ${root.classList.contains('motion-ready') ? 'on' : 'off'}${i.reducedMotion ? ' · reduced motion' : ''}${i.saveData ? ' · Save-Data' : ''}`,
      `GPU: ${gpuName}`,
      `memory: ${i.memory ?? '?'} GB · cores: ${i.cores ?? '?'} · DPR: ${devicePixelRatio} · ${innerWidth}×${innerHeight}`,
      `engine: ${root.dataset.engine ?? 'not started'}`,
      ...[...document.querySelectorAll<HTMLElement>('[data-stage]')].map((s) => {
        const name = `${s.dataset.stage}${s.dataset.mode ? `(${s.dataset.mode})` : ''}`;
        const state = s.dataset.three ?? (root.classList.contains('motion-ready') ? 'waiting' : 'still (motion is off)');
        const extra = state === 'off' ? ` · still: ${s.dataset.threeWhy ?? ''}` : s.dataset.threeMs ? ` · loaded in ${s.dataset.threeMs} ms` : '';
        return `• ${name}: ${state}${extra}`;
      }),
    ];
    box.textContent = folded ? `3D: ${tier} · tap to open` : `${lines.join('\n')}\n(tap to fold)`;
  };
  draw();
  setInterval(draw, 500);
}
