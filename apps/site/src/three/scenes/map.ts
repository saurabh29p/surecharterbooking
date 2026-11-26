/**
 * Across India: a dark, faceted map with the coastline in gold, seen from the south-west. Only the
 * coast is drawn (src/three/data/coast.json, Natural Earth, public domain); the land fades into the
 * night to the north and at both ends of the coast, so no land border is ever drawn. As the scroll
 * moves, gold contrails draw from the origin cities to each destination, which then rises.
 *
 * data-mode="home": the six routes on the home page cards, destination by destination.
 * data-mode="dest:<id>": a destination page: the four cities to that destination.
 *
 * The destination pins are HTML (links and buttons, outside the decorative canvas); this scene only
 * moves them to where their city is drawn.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  QuadraticBezierCurve3,
  Scene,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import coast from '../data/coast.json';
import { HOME_ROUTES } from '../../motion/routes';
import { ease, lerp, ramp } from '../../motion/tokens';
import type { StageFactory } from '../engine';

const K = coast.projection.k;
const xy = (lat: number, lon: number) => new Vector3((lon - coast.projection.lon0) * K, 0, coast.projection.lat0 - lat);

export const CITIES: Record<string, Vector3> = {
  delhi: xy(28.61, 77.21),
  mumbai: xy(19.08, 72.88),
  bengaluru: xy(12.97, 77.59),
  kolkata: xy(22.57, 88.36),
  udaipur: xy(24.59, 73.71),
  jaipur: xy(26.91, 75.79),
  goa: xy(15.38, 73.83),
};
const ORIGINS = ['delhi', 'mumbai', 'bengaluru', 'kolkata'];

const hashGlsl = /* glsl */ `float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`;

function land() {
  // the coast, closed far to the north (beyond the fade), so the peninsula and the plains are land
  const c = coast.coast.map(([x, z]) => new Vector2(x, z));
  const first = c[0], last = c[c.length - 1];
  const shape = new Shape([...c, new Vector2(last.x + 6, last.y), new Vector2(last.x + 6, -26), new Vector2(first.x - 6, -26), new Vector2(first.x - 6, first.y)]);
  const g = new ShapeGeometry(shape, 1);
  g.rotateX(Math.PI / 2); // shape y -> world z (south positive)
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: { uEast: { value: last.x }, uWest: { value: first.x } },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }`,
    fragmentShader: /* glsl */ `
      ${hashGlsl}
      uniform float uEast, uWest; varying vec3 vW;
      void main(){
        // facets: a triangular lattice, each triangle its own shade of midnight
        vec2 p = vW.xz * 1.9;
        vec2 s = vec2(p.x + p.y * .57735, p.y * 1.1547);
        vec2 i = floor(s); vec2 f = fract(s);
        float tri = step(f.y, f.x);
        float h = hash(i * 2. + tri);
        vec3 col = mix(vec3(.075, .085, .15), vec3(.12, .13, .2), h);
        // the plains glow faintly warm toward the coast cities, nothing more
        float north = smoothstep(-13.5, -9.5, vW.z);
        float sides = smoothstep(uEast + 1.2, uEast - .6, vW.x) * smoothstep(uWest - 1.2, uWest + .8, vW.x);
        gl_FragColor = vec4(col, .92 * north * sides);
      }`,
  });
  return new Mesh(g, mat);
}

/** A flat ribbon along a polyline (the coast), faded at both ends. */
function ribbon(pts: number[][], width: number, fadeEnds: boolean) {
  const pos: number[] = [], along: number[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * width, nz = (dx / l) * width;
    pos.push(pts[i][0] + nx, 0.01, pts[i][1] + nz, pts[i][0] - nx, 0.01, pts[i][1] - nz);
    const t = i / (n - 1);
    along.push(t, t);
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uFade: { value: fadeEnds ? 1 : 0 } },
    vertexShader: /* glsl */ `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `uniform float uFade; varying float vT;
      void main(){ float e = mix(1., smoothstep(0., .06, vT) * smoothstep(1., .94, vT), uFade); gl_FragColor = vec4(vec3(.95, .74, .38) * .9 * e, 1.); }`,
  });
  return new Mesh(g, mat);
}

function arcMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uDraw: { value: 0 } },
    vertexShader: /* glsl */ `varying float vT; void main(){ vT = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `uniform float uDraw; varying float vT;
      void main(){
        if (vT > uDraw) discard;
        float head = exp(-pow((uDraw - vT) / .05, 2.)) * step(uDraw, .999);
        float tail = .55 + .45 * smoothstep(0., .4, vT);
        gl_FragColor = vec4(vec3(1., .82, .5) * (tail * .8 + head * 1.6), 1.);
      }`,
  });
}

function dots(points: Vector3[], colors: number[][], sizes: number[]) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points.flatMap((p) => [p.x, p.y + 0.02, p.z]), 3));
  g.setAttribute('aColor', new Float32BufferAttribute(colors.flat(), 3));
  g.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uDpr: { value: Math.min(2, devicePixelRatio || 1) }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `attribute vec3 aColor; attribute float aSize; uniform float uDpr, uScale; varying vec3 vC;
      void main(){ vC = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_PointSize = aSize * uDpr * uScale; }`,
    fragmentShader: /* glsl */ `varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); float a = exp(-d * d * 22.) + .6 * smoothstep(.16, .1, d); gl_FragColor = vec4(vC * a, 1.); }`,
  });
  const p = new Points(g, mat);
  p.frustumCulled = false;
  return p;
}

const create: StageFactory = async (el) => {
  const mode = el.dataset.mode ?? 'home';
  const destId = mode.startsWith('dest:') ? mode.slice(5) : null;
  const routes = destId
    ? ORIGINS.map((from, i) => ({ from, to: destId, at: [0.12 + i * 0.12, 0.3 + i * 0.12] as [number, number] }))
    : HOME_ROUTES;
  const dests = [...new Set(routes.map((r) => r.to))];
  const pinLayer = el.parentElement?.querySelector<HTMLElement>('[data-pins]') ?? null;
  const pins = new Map<string, HTMLElement>();
  pinLayer?.querySelectorAll<HTMLElement>('[data-pin]').forEach((p) => pins.set(p.dataset.pin!, p));

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.5, 200);
  const world = new Group();
  scene.add(world);
  world.add(land());
  world.add(ribbon(coast.coast, 0.035, true));
  for (const isl of coast.islands) world.add(ribbon(isl, 0.025, false));

  // faint graticule every 5 degrees, the only other line on the map
  const grid = new Mesh(
    new PlaneGeometry(60, 60),
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {},
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }`,
      fragmentShader: /* glsl */ `varying vec3 vW;
        void main(){
          vec2 g = abs(fract(vec2(vW.x / (5. * ${K.toFixed(5)}), vW.z / 5.) + .5) - .5) / fwidth(vec2(vW.x / (5. * ${K.toFixed(5)}), vW.z / 5.));
          float line = 1. - min(min(g.x, g.y), 1.);
          float fade = smoothstep(26., 6., length(vW.xz - vec2(0., 1.)));
          gl_FragColor = vec4(vec3(.85, .7, .42) * line * .05 * fade, 1.);
        }`,
    }),
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -0.01;
  world.add(grid);

  // the contrails
  const arcs = routes.map((r) => {
    const a = CITIES[r.from], b = CITIES[r.to];
    const d = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y = 0.18 + d * 0.22;
    const curve = new QuadraticBezierCurve3(a.clone().setY(0.03), mid, b.clone().setY(0.03));
    const mat = arcMaterial();
    const mesh = new Mesh(new TubeGeometry(curve, 72, 0.028, 6, false), mat);
    world.add(mesh);
    return { ...r, mat };
  });

  const originPts = ORIGINS.map((o) => CITIES[o]);
  world.add(dots(originPts, originPts.map(() => [0.95, 0.9, 0.82]), originPts.map(() => 9)));
  const destDots = dots(dests.map((d) => CITIES[d]), dests.map(() => [1, 0.78, 0.4]), dests.map(() => 0));
  world.add(destDots);
  // a thin gold beam rises from each destination once its first contrail lands
  const beams = dests.map((d) => {
    const curve = new CatmullRomCurve3([CITIES[d].clone().setY(0), CITIES[d].clone().setY(1)]);
    const mat = arcMaterial();
    const m = new Mesh(new TubeGeometry(curve, 8, 0.012, 5, false), mat);
    world.add(m);
    return { id: d, mat, at: Math.min(...routes.filter((r) => r.to === d).map((r) => r.at[1])) };
  });

  // framing: the whole route set, seen from the south-west, looking north
  const focus = destId ? CITIES[destId].clone().lerp(new Vector3(1, 0, -1), 0.4) : new Vector3(1, 0, 1.2);
  const span = destId ? 17 : 24.5;
  const v = new Vector3();
  return {
    scene,
    camera,
    update(p, _dt, ctx) {
      for (const a of arcs) a.mat.uniforms.uDraw.value = ease.inOut(ramp(p, a.at[0], a.at[1]));
      const sizes = destDots.geometry.getAttribute('aSize');
      dests.forEach((d, i) => {
        const b = beams.find((x) => x.id === d)!;
        const rise = ease.out(ramp(p, b.at - 0.02, b.at + 0.08));
        b.mat.uniforms.uDraw.value = rise;
        sizes.setX(i, rise * 16);
        const pin = pins.get(d);
        if (pin) pin.classList.toggle('is-up', rise > 0.5);
      });
      sizes.needsUpdate = true;
      // camera: a slow drift north as the routes draw; the pointer adds a little
      const fit = ctx.aspect < 1.2 ? Math.pow(1.2 / ctx.aspect, 0.85) : 1;
      const dist = span * fit;
      const az = lerp(-0.2, -0.05, p) + ctx.pointer.x * 0.05;
      const el2 = lerp(0.95, 0.85, p) - ctx.pointer.y * 0.03;
      camera.position.set(focus.x + Math.sin(az) * Math.cos(el2) * dist, Math.sin(el2) * dist, focus.z + Math.cos(az) * Math.cos(el2) * dist);
      camera.lookAt(focus.x, 0, focus.z - 0.6);
      camera.updateMatrixWorld();
      // move the HTML pins to their cities
      for (const [id, pin] of pins) {
        const c = CITIES[id];
        if (!c) continue;
        v.set(c.x, 1.05, c.z).project(camera);
        pin.style.transform = `translate(${((v.x + 1) / 2) * ctx.width}px, ${((1 - v.y) / 2) * ctx.height}px)`;
      }
    },
  };
};

export default create;
