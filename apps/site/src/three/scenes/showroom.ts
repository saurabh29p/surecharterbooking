/**
 * Choose your arrival: a studio turntable of the film's generic aircraft. The scroll steps through
 * helicopter → light jet → super-midsize → heavy jet → group charter. Models change by sinking through
 * the floor and rising in place; the jets grow to show relative size (no lengths shown). No
 * registrations, operator logos or liveries: these are the film's own generic models.
 */
import {
  AmbientLight,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { stepAt } from '../../motion/steps';
import { ease, lerp } from '../../motion/tokens';
import type { StageFactory } from '../engine';
import { dressAircraft, environment, model } from '../assets';

/** The five classes, in page order: model, scale, length used for framing (m), wheels-to-origin. */
export const CLASSES = [
  { model: 'helicopter', scale: 1, length: 12.2, lift: 0 },
  { model: 'jet', scale: 0.74, length: 15.5, lift: 2.25 },
  { model: 'jet', scale: 1, length: 21, lift: 2.25 },
  { model: 'jet', scale: 1.45, length: 30.5, lift: 2.25 },
  { model: 'airliner', scale: 1, length: 36, lift: 2.25 * 1.32 },
] as const;


function floor() {
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: { uRing: { value: 8 }, uYaw: { value: 0 }, uLen: { value: 12 } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `
      uniform float uRing, uYaw, uLen; varying vec2 vP;
      void main(){
        float r = length(vP);
        // a soft pool of light on a dark floor, fading into the sky at the edges
        float pool = exp(-r * r / (uRing * uRing * 2.6));
        vec3 col = mix(vec3(0.035, 0.045, 0.09), vec3(0.11, 0.1, 0.12), pool);
        float a = smoothstep(uRing * 1.75, uRing * 0.75, r);
        // the gold ring and a fainter inner ring
        float ring = exp(-pow((r - uRing) / (uRing * 0.012 + 0.03), 2.));
        float inner = exp(-pow((r - uRing * 0.93) / (uRing * 0.006 + 0.02), 2.)) * 0.35;
        col += vec3(0.85, 0.66, 0.33) * (ring + inner) * 1.4;
        a = max(a, ring);
        // contact shadow along the aircraft's length
        float c = cos(uYaw), s = sin(uYaw);
        vec2 q = vec2(c * vP.x - s * vP.y, s * vP.x + c * vP.y);
        float sh = exp(-pow(q.x / (uLen * 0.5), 2.) - pow(q.y / (uLen * 0.16), 2.));
        col *= 1. - 0.75 * sh;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const m = new Mesh(new PlaneGeometry(240, 240), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -1;
  return { mesh: m, mat };
}

/** Clip everything below the floor, so a model can sink through it. */
const clipFloor = new Plane(new Vector3(0, 1, 0), 0);
const clip = (root: Object3D) =>
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    (m.material as Material).clippingPlanes = [clipFloor];
  });

const create: StageFactory = async (_el, engine) => {
  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 0.5, 600);
  const env = environment(engine.renderer);
  const [heli, jet, airliner] = await Promise.all([model('helicopter'), model('jet'), model('airliner')]);
  for (const m of [heli, jet, airliner]) {
    dressAircraft(m, env, engine.tier);
    clip(m);
  }
  const rotor = heli.getObjectByName('rotor');
  const stand = new Group();
  const holders = { helicopter: new Group(), jet: new Group(), airliner: new Group() };
  holders.helicopter.add(heli);
  holders.jet.add(jet);
  holders.airliner.add(airliner);
  for (const h of Object.values(holders)) stand.add(h);
  scene.add(stand);

  const f = floor();
  scene.add(f.mesh);
  scene.add(new HemisphereLight('#3a4470', '#120f0c', 0.55));
  scene.add(new AmbientLight('#ffffff', 0.08));
  const key = new DirectionalLight('#fff1dc', 2.4);
  key.position.set(18, 26, 22);
  const rim = new DirectionalLight('#ffcf87', 2.0);
  rim.position.set(-22, 12, -26);
  scene.add(key, rim);

  let lastP = -1;
  let rotorAngle = 0;
  return {
    scene,
    camera,
    update(p, _dt, ctx) {
      const { k, t } = stepAt(p, CLASSES.length);
      const a = CLASSES[k]!, b = CLASSES[k + 1]!;
      const len = lerp(a.length, b.length, t);
      // presence of each model: 1 shown, 0 sunk below the floor
      const w = { helicopter: 0, jet: 0, airliner: 0 } as Record<string, number>;
      if (a.model === b.model) w[a.model] = 1;
      else {
        w[a.model] = 1 - t;
        w[b.model] = t;
      }
      const jetScale = a.model === 'jet' && b.model === 'jet' ? lerp(a.scale, b.scale, t) : a.model === 'jet' ? a.scale : b.scale;
      for (const [name, h] of Object.entries(holders)) {
        const v = w[name] ?? 0;
        h.visible = v > 0.001;
        const cls = name === 'jet' ? { scale: jetScale, lift: 2.25 * jetScale } : CLASSES.find((c) => c.model === name)!;
        const sc = cls.scale * (0.9 + 0.1 * ease.out(v));
        h.scale.setScalar(sc);
        const height = name === 'helicopter' ? 5 : 8 * sc;
        h.position.y = cls.lift - (1 - ease.inOut(v)) * height * 1.15;
      }
      // the turntable follows the scroll; the pointer adds a little
      const yaw = -0.75 + p * Math.PI * 1.7 + ctx.pointer.x * 0.12;
      stand.rotation.y = yaw;
      if (rotor && lastP >= 0) rotorAngle += (p - lastP) * 60;
      if (rotor) rotor.rotation.y = rotorAngle;
      lastP = p;
      f.mat.uniforms.uRing!.value = len * 0.58;
      f.mat.uniforms.uLen!.value = len;
      f.mat.uniforms.uYaw!.value = yaw;
      // camera: framed for a size between this aircraft's and the largest, so the bigger ones fill
      // more of the frame (relative size shows) and every one fits, ring included
      const frameSize = Math.pow(len, 0.72) * Math.pow(CLASSES[CLASSES.length - 1]!.length, 0.28);
      camera.fov = ctx.aspect < 1 ? 32 : 24;
      const vHalf = (camera.fov * Math.PI) / 360;
      const half = Math.min(vHalf, Math.atan(Math.tan(vHalf) * ctx.aspect));
      const d = (frameSize * 0.46) / Math.sin(half);
      const elev = 0.3 + ctx.pointer.y * -0.03;
      camera.position.set(Math.sin(0.5) * d * Math.cos(elev), d * Math.sin(elev) + 1, Math.cos(0.5) * d * Math.cos(elev));
      camera.lookAt(0, len * 0.06 + 0.6, 0);
      camera.updateProjectionMatrix();
    },
  };
};

export default create;
