/**
 * The sky behind every page: midnight, two depths of stars and drifting gold dust.
 * Drawn in screen space (cheap): each layer slides with the scroll at its own speed, so the sky has
 * depth. Nothing moves unless the page scrolls or the pointer moves, and the sky stops altogether
 * from the first [data-calm] section (FAQ, form, footer) onwards.
 */
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Mesh, OrthographicCamera, PlaneGeometry, Points, Scene, ShaderMaterial } from 'three';
import type { Tier } from '../motion/tier';

export interface Sky {
  scene: Scene;
  camera: OrthographicCamera;
  resize(w: number, h: number, dpr?: number): void;
  /** Returns true while the sky is still settling. */
  update(scroll: number, dtMs: number, pointer: { x: number; y: number }): boolean;
}

/** Deterministic random numbers, so the sky is the same on every visit and every page. */
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function layer(count: number, seed: number, size: [number, number], depth: [number, number]) {
  const r = rng(seed);
  const pos: number[] = [], extra: number[] = [];
  for (let i = 0; i < count; i++) {
    pos.push(r(), r(), 0);
    // size, parallax depth, twinkle phase, brightness
    extra.push(size[0] + (size[1] - size[0]) * r() ** 3, depth[0] + (depth[1] - depth[0]) * r(), r() * 6.283, 0.35 + 0.65 * r() ** 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aExtra', new Float32BufferAttribute(extra, 4));
  return g;
}

const pointsVert = /* glsl */ `
  attribute vec4 aExtra;
  uniform vec2 uRes; uniform float uScroll, uDpr, uTime; uniform vec2 uPointer;
  varying float vAlpha;
  void main() {
    float depth = aExtra.y;
    vec2 p = position.xy;
    // slide with the scroll (wrapping), a touch of pointer parallax by depth
    p.y = fract(p.y + uScroll * depth / uRes.y);
    p += uPointer * depth * vec2(0.012, -0.008);
    p.x = fract(p.x);
    gl_Position = vec4(p * 2. - 1., 0., 1.);
    gl_Position.y *= -1.;
    float tw = 0.75 + 0.25 * sin(uTime * (0.6 + depth * 2.) + aExtra.z);
    vAlpha = aExtra.w * tw;
    gl_PointSize = aExtra.x * uDpr;
  }`;

export function createSky(tier: Tier): Sky {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uRes: { value: [1, 1] as [number, number] },
    uScroll: { value: 0 },
    uDpr: { value: 1 },
    uTime: { value: 0 },
    uPointer: { value: [0, 0] as [number, number] },
  };

  const bg = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: /* glsl */ `
        uniform vec2 uRes; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 px = vUv * uRes;
          vec3 top = vec3(0.043, 0.063, 0.125), low = vec3(0.051, 0.071, 0.145);
          vec3 col = mix(low, top, smoothstep(0., 1., vUv.y));
          // dither, so the gradient never bands
          col += (hash(px) - 0.5) / 255.;
          gl_FragColor = vec4(col, 1.);
        }`,
    }),
  );
  bg.frustumCulled = false;
  bg.renderOrder = -2;
  scene.add(bg);

  const n = tier === 'high' ? 1 : 0.5;
  const starMat = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms,
    vertexShader: pointsVert,
    fragmentShader: /* glsl */ `varying float vAlpha;
      void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); gl_FragColor = vec4(vec3(0.93, 0.9, 1.) * a * vAlpha * 0.8, 1.); }`,
  });
  const far = new Points(layer(Math.round(700 * n), 7, [0.8, 1.9], [0.015, 0.05]), starMat);
  const near = new Points(layer(Math.round(160 * n), 11, [1.6, 2.8], [0.06, 0.12]), starMat);
  const dustMat = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms,
    vertexShader: pointsVert,
    fragmentShader: /* glsl */ `varying float vAlpha;
      void main(){ float d = length(gl_PointCoord - .5); float a = exp(-d * d * 18.); gl_FragColor = vec4(vec3(0.85, 0.7, 0.42) * a * vAlpha * 0.45, 1.); }`,
  });
  const dust = new Points(layer(Math.round(90 * n), 23, [3, 9], [0.18, 0.42]), dustMat);
  for (const p of [far, near, dust]) {
    p.frustumCulled = false;
    scene.add(p);
  }

  let calmY = Infinity;
  const measure = () => {
    const calm = document.querySelector('[data-calm]');
    calmY = calm ? calm.getBoundingClientRect().top + window.scrollY : Infinity;
  };
  measure();
  addEventListener('load', measure);

  return {
    scene,
    camera,
    resize(w, h, dpr = Math.min(devicePixelRatio || 1, 2)) {
      uniforms.uRes.value = [w, h];
      uniforms.uDpr.value = dpr;
      measure();
    },
    update(scroll, dt, pointer) {
      // the sky stops before the calm sections: the content then scrolls over a still backdrop
      const s = Math.min(scroll, Math.max(0, calmY - window.innerHeight * 1.2));
      uniforms.uScroll.value = s;
      uniforms.uTime.value += (Math.abs(s - lastS) > 0.5 ? dt : 0) / 1000;
      lastS = s;
      uniforms.uPointer.value = [pointer.x, pointer.y];
      return false;
    },
  };
}
let lastS = 0;
