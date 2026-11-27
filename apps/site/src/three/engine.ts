/**
 * One WebGL renderer per page, on one fixed canvas behind the content (aria-hidden, decorative).
 * Each frame it draws the sky across the whole window, then every visible stage into its own
 * rectangle (scissor), with that stage's camera. It renders only while something changes (scroll,
 * pointer, a stage still settling), never while the tab is hidden, and caps the pixel ratio.
 * If frames are slow it lowers the pixel ratio; if they stay slow it hands back to the stills.
 *
 * Never an empty frame: every stage shows its still until its scene has drawn a first frame that is
 * checked to contain something (rendered once into a small target and read back). A stage whose
 * still has been on screen for 1.5 s without the 3D taking over keeps its still for good
 * (data-three="off", set by motion/index.ts). Each stage's state is in data-three, for ?debug=3d.
 */
import { ACESFilmicToneMapping, NoToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer, WebGLRenderTarget } from 'three';
import { kick, onFrame, progressOf } from '../motion/loop';
import { forcedTier, type Tier } from '../motion/tier';
import { createSky, type Sky } from './sky';

export interface FrameCtx {
  /** stage width / height */
  aspect: number;
  width: number;
  height: number;
  /** pointer over the window, -1..1 (desktop only; 0 on touch) */
  pointer: { x: number; y: number };
  tier: Tier;
  /** seconds the engine has been rendering (advances only while frames run) */
  time: number;
}

export interface StageScene {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Pose the scene for chapter progress p. Return true while it is still moving by itself. */
  update(p: number, dtMs: number, ctx: FrameCtx): boolean | void;
  /** Tone mapping off for scenes that are mostly flat colour (the logo). */
  flat?: boolean;
  dispose?(): void;
}

export type StageFactory = (el: HTMLElement, engine: Engine) => Promise<StageScene>;

interface StageEntry {
  el: HTMLElement;
  chapter: Element | null;
  factory: StageFactory;
  scene?: StageScene;
  loading?: boolean;
  near: boolean;
  lastP: number;
  lastW: number;
  lastH: number;
  live: boolean;
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly tier: Tier;
  private sky: Sky;
  private stages: StageEntry[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private maxDpr: number;
  private dirty = true;
  private lastScroll = -1;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private time = 0;
  private slow = 0;
  private frames = 0;
  private stopped = false;
  private probe: WebGLRenderTarget | null = null;
  private probeBuf = new Uint8Array(48 * 48 * 4);
  /** ?still=clear: no sky and a transparent canvas, for rendering stills with an alpha channel */
  private clear = /[?&]still=clear\b/.test(location.search);
  private io: IntersectionObserver;
  private unhook: () => void;

  constructor(tier: Tier) {
    this.tier = tier;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.maxDpr = tier === 'high' ? (mobile ? 1.5 : 2) : 1.25;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'gl-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.tabIndex = -1;
    document.body.prepend(this.canvas);
    try {
      this.renderer = new WebGLRenderer({
        canvas: this.canvas,
        antialias: tier === 'high' && devicePixelRatio < 2,
        alpha: this.clear,
        stencil: false,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      // no WebGL context after all: leave nothing behind, the stills stay
      this.canvas.remove();
      throw err;
    }
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.autoClear = false;
    this.renderer.localClippingEnabled = true;
    if (this.clear) this.renderer.setClearColor(0x000000, 0);
    this.sky = createSky(tier);
    this.resize();

    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const s = this.stages.find((x) => x.el === e.target);
          if (!s) continue;
          s.near = e.isIntersecting;
          if (s.near) void this.load(s);
        }
        this.dirty = true;
        kick();
      },
      { rootMargin: '120% 0px 120% 0px' },
    );

    addEventListener('resize', () => {
      this.resize();
      this.dirty = true;
      kick();
    });
    if (!mobile)
      addEventListener(
        'pointermove',
        (e) => {
          this.pointer.tx = (e.clientX / this.w) * 2 - 1;
          this.pointer.ty = (e.clientY / this.h) * 2 - 1;
          kick();
        },
        { passive: true },
      );
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stop('the WebGL context was lost');
    });
    document.documentElement.classList.add('gl');
    document.documentElement.dataset.engine = 'running';
    this.unhook = onFrame((dt) => this.frame(dt));
  }

  addStage(el: HTMLElement, factory: StageFactory) {
    const entry: StageEntry = { el, factory, chapter: el.closest('[data-chapter]'), near: false, lastP: -1, lastW: 0, lastH: 0, live: false };
    this.stages.push(entry);
    if (el.dataset.three !== 'off') el.dataset.three = 'waiting';
    this.io.observe(el);
  }

  private async load(s: StageEntry) {
    if (s.scene || s.loading || this.stopped || s.el.dataset.three === 'off') return;
    s.loading = true;
    const t0 = performance.now();
    if (s.el.dataset.three !== 'off') s.el.dataset.three = 'loading';
    try {
      const scene = await s.factory(s.el, this);
      // compile before the first frame that shows it, off the critical moment where possible;
      // the scene joins the frame loop only once compiled
      await this.renderer.compileAsync(scene.scene, scene.camera).catch(() => {});
      s.scene = scene;
      if (s.el.dataset.three !== 'off') s.el.dataset.three = 'ready';
      s.el.dataset.threeMs = String(Math.round(performance.now() - t0));
    } catch (err) {
      console.warn('3D stage could not load; keeping the still', err);
      s.el.dataset.three = 'off';
      s.el.dataset.threeWhy = 'the scene failed to load';
    }
    s.loading = false;
    this.dirty = true;
    kick();
  }

  private resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(devicePixelRatio || 1, this.maxDpr);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, true);
    this.sky.resize(this.w, this.h, this.dpr);
  }

  private frame(dt: number): boolean {
    if (this.stopped || document.hidden) return false;
    const p = this.pointer;
    p.x += (p.tx - p.x) * Math.min(1, dt / 220);
    p.y += (p.ty - p.y) * Math.min(1, dt / 220);
    const pointerMoving = Math.abs(p.tx - p.x) > 1e-3 || Math.abs(p.ty - p.y) > 1e-3;
    const scroll = window.scrollY;
    let needed = this.dirty || pointerMoving || scroll !== this.lastScroll;
    const rects: (DOMRect | null)[] = this.stages.map((s) => {
      if (!s.scene || !s.near || (s.el.dataset.three === 'off' && !s.live)) return null;
      const r = s.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > this.h || r.width < 2 || r.height < 2) return null;
      const prog = s.chapter ? (progressOf.get(s.chapter) ?? 0) : 0;
      if (prog !== s.lastP || r.width !== s.lastW || r.height !== s.lastH) needed = true;
      return r;
    });
    let more = pointerMoving;
    if (!needed && !this.stages.some((s) => s.scene && s.near && s.live && s.el.dataset.animating === '1')) return false;
    this.dirty = false;
    this.lastScroll = scroll;
    this.time += dt / 1000;
    this.watchSpeed(dt);

    const r = this.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.w, this.h);
    r.toneMapping = NoToneMapping;
    r.clear(true, true, false);
    if (this.sky.update(scroll, dt, p)) more = true;
    if (!this.clear) r.render(this.sky.scene, this.sky.camera);

    this.stages.forEach((s, i) => {
      const rect = rects[i];
      if (!rect || !s.scene) return;
      const prog = s.chapter ? (progressOf.get(s.chapter) ?? 0) : 0;
      const ctx: FrameCtx = { aspect: rect.width / rect.height, width: rect.width, height: rect.height, pointer: p, tier: this.tier, time: this.time };
      const cam = s.scene.camera;
      if (cam.aspect !== ctx.aspect) {
        cam.aspect = ctx.aspect;
        cam.updateProjectionMatrix();
      }
      const moving = !!s.scene.update(prog, dt, ctx);
      s.el.dataset.animating = moving ? '1' : '0';
      if (moving) more = true;
      s.lastP = prog;
      s.lastW = rect.width;
      s.lastH = rect.height;
      // the first frame is checked before it is shown: drawn once into a small target and read back
      if (!s.live && !this.drawsSomething(s.scene)) return;
      const y = this.h - rect.bottom;
      r.setViewport(rect.left, y, rect.width, rect.height);
      r.setScissor(Math.max(0, rect.left), Math.max(0, y), Math.min(this.w, rect.right) - Math.max(0, rect.left), Math.min(this.h, rect.bottom) - Math.max(0, rect.top));
      r.setScissorTest(true);
      r.clearDepth();
      r.toneMapping = s.scene.flat ? NoToneMapping : ACESFilmicToneMapping;
      r.render(s.scene.scene, cam);
      if (!s.live) {
        s.live = true;
        s.el.dataset.three = 'live';
        // let the first frame reach the screen, then fade the still away
        requestAnimationFrame(() => s.el.classList.add('is-live'));
      }
    });
    return more;
  }

  /**
   * Does the scene put anything on screen? Rendered into a 48 x 48 target cleared to transparent,
   * then read back: at least a few covered pixels are needed before the still gives way.
   */
  private drawsSomething(st: StageScene) {
    const r = this.renderer;
    this.probe ??= new WebGLRenderTarget(48, 48);
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.probe);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.toneMapping = st.flat ? NoToneMapping : ACESFilmicToneMapping;
    r.render(st.scene, st.camera);
    r.readRenderTargetPixels(this.probe, 0, 0, 48, 48, this.probeBuf);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, prevAlpha);
    let covered = 0;
    for (let i = 3; i < this.probeBuf.length; i += 4) if ((this.probeBuf[i] ?? 0) > 24) covered++;
    return covered >= 12;
  }

  /** Adaptive quality: a lower pixel ratio when frames are slow; stills if they stay slow. */
  private watchSpeed(dt: number) {
    if (dt > 40 || dt < 4) return; // a pause, not a slow frame
    this.frames++;
    this.slow = this.slow * 0.92 + (dt > 24 ? 1 : 0) * 0.08;
    if (this.frames < 30 || this.slow < 0.6) return;
    if (this.dpr > 1.01) {
      this.maxDpr = Math.max(1, this.dpr - 0.25);
      this.resize();
      this.slow = 0.3;
      this.frames = 0;
    } else if (this.slow > 0.85 && !forcedTier()) {
      // (a tier forced with ?tier= for testing keeps going, so software renderers can be checked)
      this.stop('frames stayed slow');
    }
  }

  /** Hand back to the stills for good (context lost, or too slow). */
  stop(why = 'stopped') {
    if (this.stopped) return;
    this.stopped = true;
    document.documentElement.dataset.engine = `stopped: ${why}`;
    this.unhook();
    this.io.disconnect();
    for (const s of this.stages) {
      s.el.classList.remove('is-live');
      s.el.dataset.three = 'off';
      s.el.dataset.threeWhy = why;
      s.scene?.dispose?.();
    }
    document.documentElement.classList.remove('gl');
    this.canvas.remove();
    this.renderer.dispose();
  }
}

let engine: Engine | null = null;

/** Start (once) and register every [data-stage] element with its scene module. */
export function startEngine(tier: Tier, factories: Record<string, () => Promise<{ default: StageFactory }>>) {
  if (engine) return engine;
  engine = new Engine(tier);
  if (/[?&]debug\b/.test(location.search)) (window as unknown as { vaanikaEngine: Engine }).vaanikaEngine = engine;
  for (const el of document.querySelectorAll<HTMLElement>('[data-stage]')) {
    const load = factories[el.dataset.stage ?? ''];
    if (!load) continue;
    engine.addStage(el, async (stageEl, eng) => (await load()).default(stageEl, eng));
  }
  return engine;
}
