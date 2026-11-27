/**
 * The Vaanika mark in 3D, from the logo file's own paths (extruded; each face is a raster of that
 * element's own SVG: same fills, gradients and stroke, never redrawn or recoloured).
 *
 * data-mode="checks" (The Vaanika Standard): the whole lotus, face on, framed exactly like its still
 * (the mark fills 85% of the stage's shorter side, centred). The card nearest the middle of the window
 * (data-active on the stage, set by motion/chapters/standard.ts) lights its part: 01 Saraswati,
 * 02 Lakshmi, 03 Kali, 04 the chandra.
 * data-mode="bloom" (the name story, About): the lotus opens petal by petal: Saraswati, Lakshmi, Kali,
 * then the chandra and the base line.
 */
import { DoubleSide, Group, type Mesh, type Object3D, PerspectiveCamera, Scene, ShaderMaterial } from 'three';
import { ease, lerp, ramp } from '../../motion/tokens';
import type { StageFactory } from '../engine';
import { model, svgTexture } from '../assets';

type Part = 'saraswati' | 'lakshmi' | 'kali' | 'chandra' | 'base';
const STILL = /[?&]still\b/.test(location.search);
interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  s: number;
  op: number;
  lit: number;
}
const P = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, op = 1, lit = 0): Pose => ({ x, y, z, rx, ry, rz, s, op, lit });
const mix = (a: Pose, b: Pose, t: number): Pose => {
  const o = {} as Pose;
  for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = lerp(a[k], b[k], t);
  return o;
};

function material() {
  return new ShaderMaterial({
    transparent: true,
    side: DoubleSide,
    uniforms: { map: { value: null }, uOp: { value: 1 }, uLit: { value: 0 }, uSheen: { value: -2 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform float uOp, uLit, uSheen; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        // the texture is the logo element's own raster (sRGB, read back as linear light)
        vec3 base = texture2D(map, vUv).rgb;
        float ndv = clamp(dot(normalize(vN), normalize(vV)), 0., 1.);
        // the face keeps the logo's exact colour (face on, ndv is 1); the bevel catches a warm light;
        // a lit part lifts a little and a slow sheen crosses it
        vec3 col = base * (.84 + .16 * ndv);
        col += vec3(1., .86, .62) * pow(1. - ndv, 3.) * (.16 + .34 * uLit);
        col *= 1. + .2 * uLit;
        float band = exp(-pow((vUv.x * .7 + vUv.y * .7 - uSheen) / .12, 2.));
        col += vec3(1., .94, .8) * band * .22 * uLit;
        gl_FragColor = vec4(col, uOp);
        #include <colorspace_fragment>
      }`,
  });
}

/** Poses in SVG units (the mark is 200 units across, centred on 100,100). */
const WHOLE: Record<Part, Pose> = {
  saraswati: P(),
  lakshmi: P(),
  kali: P(),
  chandra: P(),
  base: P(),
};
const CLOSED: Record<Part, Pose> = {
  saraswati: P(4, -4, -4, 0, 0.2, -0.62, 0.92, 1, 0),
  lakshmi: P(0, -18, -6, 0, 0, 0, 0.82, 1, 0),
  kali: P(-4, -4, -4, 0, -0.2, 0.62, 0.92, 1, 0),
  chandra: P(0, -30, 0, 0, 0, 0, 0.4, 0, 0),
  base: P(0, 0, 0, 0, 0, 0, 0.6, 0, 0),
};

const create: StageFactory = async (el) => {
  const mode = el.dataset.mode === 'bloom' ? 'bloom' : 'checks';
  const scene = new Scene();
  const camera = new PerspectiveCamera(24, 1, 0.1, 100);
  const root = await model('mark');
  const group = new Group();
  const parts = {} as Record<Part, { holder: Group; mat: ShaderMaterial; pivot: [number, number] }>;
  const meshes: Mesh[] = [];
  root.traverse((o: Object3D) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  await Promise.all(
    meshes.map(async (m) => {
      const src = m.material as unknown as { userData: { svg: string; box: [number, number, number, number] } };
      const name = (m.name || (m.parent?.name ?? '')) as Part;
      const mat = material();
      const [, , bw, bh] = src.userData.box;
      mat.uniforms.map!.value = await svgTexture(src.userData.svg, bw, bh, 7);
      m.material = mat;
      const pivot = (m.userData.pivot ?? m.parent?.userData.pivot ?? [100, 100]) as [number, number];
      const holder = new Group();
      // place the element's pivot where it sits in the mark (SVG y runs down; centred on 100,100);
      // the mesh keeps its own node transform (it carries the glTF dequantisation)
      holder.position.set(pivot[0] - 100, -(pivot[1] - 100), 0);
      holder.add(m);
      group.add(holder);
      parts[name] = { holder, mat, pivot };
    }),
  );
  group.scale.setScalar(0.01);
  scene.add(group);

  const home = new Map<Part, [number, number]>();
  for (const [k, v] of Object.entries(parts)) home.set(k as Part, [v.holder.position.x, v.holder.position.y]);

  // checks: each part's light eases toward the active card's part (about a third of a second)
  const ORDER: Part[] = ['saraswati', 'lakshmi', 'kali', 'chandra'];
  const lit: Record<Part, number> = { saraswati: 0, lakshmi: 0, kali: 0, chandra: 0, base: 0 };
  const easeLit = (dt: number) => {
    // (?still renders the fallback still: nothing lit)
    const active = STILL || el.dataset.active === undefined || el.dataset.active === '' ? -1 : Number(el.dataset.active);
    let moving = false;
    for (const k of ORDER) {
      const target = ORDER.indexOf(k) === active ? 1 : 0;
      lit[k] += (target - lit[k]) * (1 - Math.exp(-dt / 110));
      if (Math.abs(target - lit[k]) < 0.004) lit[k] = target;
      else moving = true;
    }
    return moving;
  };

  const pose = (p: number): Record<Part, Pose> => {
    const out = {} as Record<Part, Pose>;
    if (mode === 'checks') {
      // the whole lotus; the lit part comes a few units toward you
      for (const k of Object.keys(WHOLE) as Part[]) {
        const l = lit[k];
        out[k] = { ...WHOLE[k], z: 6 * l, lit: l };
      }
    } else {
      const open: Record<Part, [number, number]> = { saraswati: [0.08, 0.3], lakshmi: [0.26, 0.48], kali: [0.44, 0.66], chandra: [0.62, 0.8], base: [0.76, 0.92] };
      for (const k of Object.keys(CLOSED) as Part[]) {
        const t = ease.inOut(ramp(p, open[k][0], open[k][1]));
        out[k] = mix(CLOSED[k], WHOLE[k], t);
        out[k].lit = 0.35 + 0.65 * t * (1 - 0.5 * ramp(p, 0.92, 1));
      }
    }
    return out;
  };

  return {
    scene,
    camera,
    flat: true,
    update(p, dt, ctx) {
      const moving = mode === 'checks' ? easeLit(dt) : false;
      const poses = pose(p);
      for (const [k, part] of Object.entries(parts) as [Part, (typeof parts)[Part]][]) {
        const q = poses[k];
        const [hx, hy] = home.get(k)!;
        part.holder.position.set(hx + q.x, hy + q.y, q.z);
        part.holder.rotation.set(q.rx, q.ry, q.rz);
        part.holder.scale.setScalar(q.s);
        part.holder.visible = q.op > 0.01;
        part.mat.uniforms.uOp!.value = q.op;
        part.mat.uniforms.uLit!.value = q.lit;
        part.mat.uniforms.uSheen!.value = mode === 'checks' ? lerp(-0.4, 2.2, 1 - q.lit) : lerp(-0.4, 2.2, (p * 2.2) % 1);
      }
      const fit = ctx.aspect < 1 ? 1 / ctx.aspect : 1;
      if (mode === 'checks') {
        // face on, framed like the still: 200 SVG units (2 world units) = 85% of the shorter side
        group.rotation.set(ctx.pointer.y * 0.03, ctx.pointer.x * 0.05, 0);
        const d = (fit * 1) / (0.85 * Math.tan((camera.fov * Math.PI) / 360));
        camera.position.set(0, 0, d);
        camera.lookAt(0, 0, 0);
      } else {
        // a slow turn with the scroll and the pointer; the mark is about 2 units tall
        group.rotation.y = lerp(-0.18, 0.18, p) + ctx.pointer.x * 0.1;
        group.rotation.x = -0.05 + ctx.pointer.y * 0.05;
        const d = 6.4 * fit * 1.22;
        camera.position.set(0, 0.05, d);
        camera.lookAt(0, 0.05, 0);
      }
      camera.updateProjectionMatrix();
      return moving;
    },
  };
};

export default create;
