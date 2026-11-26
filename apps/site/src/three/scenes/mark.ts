/**
 * The Vaanika mark in 3D, from the logo file's own paths (extruded; each face is a raster of that
 * element's own SVG: same fills, gradients and stroke, never redrawn or recoloured).
 *
 * data-mode="checks" (The Vaanika Standard): the three petals and the crescent float a little apart;
 * as each of the four checks arrives, its part turns toward you and catches the light; at the end the
 * parts come together.
 * data-mode="bloom" (the name story, About): the lotus opens petal by petal: Saraswati, Lakshmi, Kali,
 * then the chandra and the base line.
 */
import { DoubleSide, Group, type Mesh, type Object3D, PerspectiveCamera, Scene, ShaderMaterial } from 'three';
import { ease, lerp, ramp } from '../../motion/tokens';
import type { StageFactory } from '../engine';
import { model, svgTexture } from '../assets';

type Part = 'saraswati' | 'lakshmi' | 'kali' | 'chandra' | 'base';
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
        vec3 base = texture2D(map, vUv).rgb;
        float ndv = clamp(dot(normalize(vN), normalize(vV)), 0., 1.);
        // the face keeps the logo's own colour; the bevel catches a warm light; lit parts glow a little
        vec3 col = base * mix(.55 + .45 * ndv, 1., .35 + .65 * uLit);
        col += vec3(1., .86, .62) * pow(1. - ndv, 3.) * (.25 + .5 * uLit);
        float band = exp(-pow((vUv.x * .7 + vUv.y * .7 - uSheen) / .12, 2.));
        col += vec3(1., .94, .8) * band * .35 * uLit;
        gl_FragColor = vec4(col * (.72 + .28 * uLit), uOp);
      }`,
  });
}

/** Rest poses (SVG units, the mark is about 200 tall) for each mode. */
const APART: Record<Part, Pose> = {
  saraswati: P(-16, -2, 0, 0, 0.32, 0.05),
  lakshmi: P(0, 6, -10, 0, 0, 0),
  kali: P(16, -2, 0, 0, -0.32, -0.05),
  chandra: P(0, 16, 6, 0.1, 0, 0),
  base: P(0, -10, 0, 0, 0, 0, 1, 0.6),
};
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
      const src = m.material as { userData: { svg: string; box: [number, number, number, number] } };
      const name = (m.name || (m.parent?.name ?? '')) as Part;
      const mat = material();
      const [, , bw, bh] = src.userData.box;
      mat.uniforms.map.value = await svgTexture(src.userData.svg, bw, bh, 7);
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

  const pose = (p: number): Record<Part, Pose> => {
    const out = {} as Record<Part, Pose>;
    if (mode === 'checks') {
      // four checks: 0..1 over the list; part i is lit around the middle of its quarter
      const order: Part[] = ['saraswati', 'lakshmi', 'kali', 'chandra'];
      const together = ease.inOut(ramp(p, 0.9, 1));
      for (const k of Object.keys(APART) as Part[]) {
        const i = order.indexOf(k);
        const c = (i + 0.5) / 4;
        const lit = i < 0 ? 0 : Math.max(0, 1 - Math.abs(p - c) / 0.17);
        const l = ease.smooth(Math.min(1, lit * 1.4));
        const a = APART[k];
        const facing = P(a.x * 0.85, a.y, a.z + 14, 0, 0, a.rz * 0.5, 1.06, 1, 1);
        out[k] = mix(mix(a, facing, l), WHOLE[k], together);
        out[k].lit = Math.max(l, together * 0.6);
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
    update(p, _dt, ctx) {
      const poses = pose(p);
      for (const [k, part] of Object.entries(parts) as [Part, (typeof parts)[Part]][]) {
        const q = poses[k];
        const [hx, hy] = home.get(k)!;
        part.holder.position.set(hx + q.x, hy + q.y, q.z);
        part.holder.rotation.set(q.rx, q.ry, q.rz);
        part.holder.scale.setScalar(q.s);
        part.holder.visible = q.op > 0.01;
        part.mat.uniforms.uOp.value = q.op;
        part.mat.uniforms.uLit.value = q.lit;
        part.mat.uniforms.uSheen.value = lerp(-0.4, 2.2, (p * 2.2) % 1);
      }
      // a slow turn with the scroll and the pointer; the mark is about 2 units tall
      group.rotation.y = lerp(-0.18, 0.18, p) + ctx.pointer.x * 0.1;
      group.rotation.x = -0.05 + ctx.pointer.y * 0.05;
      const fit = ctx.aspect < 1 ? 1 / ctx.aspect : 1;
      const d = 6.4 * fit * (mode === 'bloom' ? 1.22 : 1.25);
      camera.position.set(0, 0.05, d);
      camera.lookAt(0, 0.05, 0);
      camera.updateProjectionMatrix();
    },
  };
};

export default create;
