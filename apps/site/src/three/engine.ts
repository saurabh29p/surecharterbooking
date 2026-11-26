/**
 * One WebGL renderer per page, on one fixed canvas behind the content (aria-hidden, decorative).
 * Each frame it draws the sky across the whole window, then every visible stage into its own
 * rectangle (scissor), with that stage's camera. It renders only while something changes (scroll,
 * pointer, a stage still settling), never while the tab is hidden, and caps the pixel ratio.
 * If frames are slow it lowers the pixel ratio; if they stay slow it hands back to the stills.
 */
import { ACESFilmicToneMapping, NoToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
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
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: tier === 'high' && devicePixelRatio < 2,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.autoClear = false;
    this.renderer.localClippingEnabled = true;
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
      this.stop();
    });
    document.documentElement.classList.add('gl');
    this.unhook = onFrame((dt) => this.frame(dt));
  }

  addStage(el: HTMLElement, factory: StageFactory) {
    const entry: StageEntry = { el, factory, chapter: el.closest('[data-chapter]'), near: false, lastP: -1, lastW: 0, lastH: 0, live: false };
    this.stages.push(entry);
    this.io.observe(el);
  }

  private async load(s: StageEntry) {
    if (s.scene || s.loading || this.stopped) return;
    s.loading = true;
    try {
      s.scene = await s.factory(s.el, this);
      // compile before the first frame that shows it, off the critical moment where possible
      await this.renderer.compileAsync(s.scene.scene, s.scene.camera).catch(() => {});
    } catch (err) {
      console.warn('3D stage could not load; keeping the still', err);
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
      if (!s.scene || !s.near) return null;
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
    r.render(this.sky.scene, this.sky.camera);

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
      const y = this.h - rect.bottom;
      r.setViewport(rect.left, y, rect.width, rect.height);
      r.setScissor(Math.max(0, rect.left), Math.max(0, y), Math.min(this.w, rect.right) - Math.max(0, rect.left), Math.min(this.h, rect.bottom) - Math.max(0, rect.top));
      r.setScissorTest(true);
      r.clearDepth();
      r.toneMapping = s.scene.flat ? NoToneMapping : ACESFilmicToneMapping;
      r.render(s.scene.scene, cam);
      if (!s.live) {
        s.live = true;
        // let the first frame reach the screen, then fade the still away
        requestAnimationFrame(() => s.el.classList.add('is-live'));
      }
    });
    return more;
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
      this.stop();
    }
  }

  /** Hand back to the stills for good (context lost, or too slow). */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.unhook();
    this.io.disconnect();
    for (const s of this.stages) {
      s.el.classList.remove('is-live');
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
