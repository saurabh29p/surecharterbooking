/**
 * The Shreeji Arrival: night, the lit palace across the lawn, a ring of diyas round the landing spot.
 * The scroll brings the film's helicopter in from the upper right and down onto the lawn; near the
 * ground its downwash ripples the grass and lifts a few marigold petals (kept round the landing spot,
 * away from the text); after touchdown the rotor winds down. Everything follows the scroll.
 *
 * data-mode="arrival" (home, pinned), data-mode="hover" (helicopter arrivals header: the helicopter
 * holding over the lawn, turning slowly with the scroll).
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { ease, lerp, ramp } from '../../motion/tokens';
import type { StageFactory } from '../engine';
import { dressAircraft, environment, model } from '../assets';

const TOUCH = 0.84;

/** Helicopter pose for progress p (arrival). */
export function heliPose(p: number) {
  const app = ease.out(ramp(p, 0, 0.66));
  const down = ease.inOut(ramp(p, 0.6, TOUCH));
  const start = new Vector3(34, 30, -46);
  const hover = new Vector3(0, 7.5, 0);
  const pos = start.clone().lerp(hover, app);
  pos.y = lerp(lerp(start.y, hover.y, app), 0, down);
  const moving = 1 - app;
  return {
    pos,
    yaw: lerp(2.35, 0.55, ease.inOut(ramp(p, 0, 0.75))),
    pitch: 0.14 * Math.sin(Math.PI * ramp(p, 0.05, 0.7)) * (0.4 + moving),
    roll: -0.06 * Math.sin(Math.PI * ramp(p, 0.1, 0.6)),
    height: pos.y,
  };
}

/** Rotor angle: turns with the scroll, then winds down after touchdown. */
const rotorAngle = (p: number) => {
  const a = Math.min(p, TOUCH);
  const b = Math.max(0, p - TOUCH);
  const w = 1 - TOUCH;
  return 420 * (a + b - (b * b) / (2 * w));
};

function lawn() {
  const mat = new ShaderMaterial({
    uniforms: { uWash: { value: 0 }, uPhase: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }`,
    fragmentShader: /* glsl */ `
      uniform float uWash, uPhase; varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float r = length(vW.xz);
        float n = noise(vW.xz * .8) * .6 + noise(vW.xz * 3.1) * .4;
        vec3 grass = mix(vec3(.018, .03, .022), vec3(.035, .055, .035), n);
        // the warm pool of the diyas round the landing spot
        grass += vec3(.32, .2, .08) * exp(-r * r / 60.) * .55;
        grass += vec3(.5, .32, .12) * exp(-pow((r - 7.) / .7, 2.)) * .12;
        // downwash: rings running out across the grass
        float ring = .5 + .5 * sin(r * 2.2 - uPhase);
        grass *= 1. + uWash * ring * .55 * exp(-r / 9.);
        // fade into the night toward the palace and the edges
        float far = smoothstep(150., 40., length(vW.xz - vec2(-10., -40.)));
        gl_FragColor = vec4(grass * far, 1.);
      }`,
  });
  const m = new Mesh(new PlaneGeometry(400, 400, 1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  return { mesh: m, mat };
}

function palaceMaterials(root: Object3D) {
  const flood = new Color(1.0, 0.62, 0.32);
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const src = m.material as MeshStandardMaterial & { userData: { colorScale?: number } };
    let out: Material;
    if (src.name === 'glow') {
      out = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: DoubleSide });
      (out as MeshBasicMaterial).color.setScalar((src.userData.colorScale ?? 1) * 2.4);
    } else if (src.name === 'gold') {
      out = new MeshStandardMaterial({ color: '#d9bc78', metalness: 1, roughness: 0.3, emissive: '#5a3a12', emissiveIntensity: 0.6, flatShading: true });
    } else {
      // plaster and stone, floodlit from the plinth: warm at the base, fading up the walls
      const sm = new MeshStandardMaterial({ color: src.color, roughness: 0.9, flatShading: true });
      sm.onBeforeCompile = (sh) => {
        sh.uniforms.uFlood = { value: flood };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvY = position.y;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vY; uniform vec3 uFlood;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uFlood * diffuseColor.rgb * (.05 + .55 * exp(-max(vY - 2.6, 0.) / 7.));');
      };
      sm.customProgramCacheKey = () => 'palaceflood';
      out = sm;
    }
    m.material = out;
  });
}

function diyas(n: number, r: number) {
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos.push(Math.cos(a) * r, 0.12, Math.sin(a) * r);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const p = new Points(
    g,
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uScale: { value: 1 } },
      vertexShader: /* glsl */ `uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = uScale * 90. / -mv.z; }`,
      fragmentShader: /* glsl */ `void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vec3(1., .66, .3) * (exp(-d * d * 30.) * 1.4 + exp(-d * d * 6.) * .25), 1.); }`,
    }),
  );
  p.frustumCulled = false;
  return p;
}

/** Marigold petals scattered round the landing spot; the downwash lifts and swirls them. */
function petals(count: number) {
  const geo = new PlaneGeometry(0.16, 0.11);
  const mat = new MeshBasicMaterial({ side: DoubleSide, toneMapped: true });
  const mesh = new InstancedMesh(geo, mat, count);
  const seeds = Array.from({ length: count }, (_, i) => {
    const rnd = (k: number) => {
      const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    // only on the far side and the right of the landing spot (the text is on the left)
    return { a: lerp(-1.9, 1.2, rnd(1)), r: lerp(3, 9.5, rnd(2)), h: rnd(3), s: rnd(4), c: rnd(5) };
  });
  const colors = [new Color('#f2a33a'), new Color('#f6c445'), new Color('#e9782c')];
  seeds.forEach((s, i) => mesh.setColorAt(i, colors[Math.floor(s.c * 3)].clone().multiplyScalar(0.7)));
  const dummy = new Object3D();
  const update = (lift: number, spin: number) => {
    seeds.forEach((s, i) => {
      const L = lift * (0.4 + 0.6 * s.h);
      const ang = s.a + L * (1.2 + s.s) + spin * 0.15 * s.s;
      const rad = s.r + L * 3.5;
      dummy.position.set(Math.cos(ang) * rad, 0.03 + L * (0.8 + 3.2 * s.h) * (0.6 + 0.4 * Math.sin(spin * 0.7 + s.s * 6)), Math.sin(ang) * rad);
      dummy.rotation.set(Math.PI / 2 + L * 6 * s.s + spin * s.h, L * 4 * s.h, s.s * 6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0, 0);
  return { mesh, update };
}

const create: StageFactory = async (el, engine) => {
  const mode = el.dataset.mode === 'hover' ? 'hover' : 'arrival';
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.5, 600);
  const env = environment(engine.renderer);
  const [heli, palace] = await Promise.all([model('helicopter'), model('palace')]);
  dressAircraft(heli, env, engine.tier, { cabinGlow: 0.6 });
  palaceMaterials(palace);
  palace.position.set(-26, 0, -112);
  palace.rotation.y = 0.2;
  scene.add(palace);
  const ground = lawn();
  scene.add(ground.mesh);
  scene.add(diyas(engine.tier === 'high' ? 32 : 24, 7));
  const pad = new Mesh(new CircleGeometry(4.2, 64), new MeshBasicMaterial({ color: '#1a1408', transparent: true, opacity: 0.5 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  scene.add(pad);
  const fl = petals(engine.tier === 'high' ? 140 : 70);
  scene.add(fl.mesh);

  const holder = new Group();
  holder.add(heli);
  scene.add(holder);
  const rotor = heli.getObjectByName('rotor');

  scene.add(new HemisphereLight('#2c3760', '#0b0d0a', 0.5));
  const moon = new DirectionalLight('#c9d2f0', 0.7);
  moon.position.set(-30, 60, 20);
  const warm = new PointLight('#ffb766', 60, 40, 1.6);
  warm.position.set(0, 3, 3);
  const rim = new DirectionalLight('#ffcf87', 1.6);
  rim.position.set(20, 14, -40);
  scene.add(moon, warm, rim);

  return {
    scene,
    camera,
    update(p, _dt, ctx) {
      let pose: ReturnType<typeof heliPose>;
      if (mode === 'hover') {
        pose = { pos: new Vector3(0, 6.5 - 1.5 * p, 0), yaw: lerp(0.2, 1.6, p), pitch: 0.03, roll: 0, height: 6.5 - 1.5 * p };
      } else pose = heliPose(p);
      holder.position.copy(pose.pos);
      holder.rotation.set(0, pose.yaw, 0);
      heli.rotation.set(pose.roll, 0, pose.pitch);
      if (rotor) rotor.rotation.y = mode === 'hover' ? p * 120 : rotorAngle(p);
      const wash = Math.exp(-pose.height / 3.2) * (mode === 'hover' ? 0.5 : 1 - ramp(p, TOUCH, 1));
      ground.mat.uniforms.uWash.value = wash;
      ground.mat.uniforms.uPhase.value = p * 90;
      fl.update(mode === 'hover' ? 0 : wash * 1.1, p * 30);
      fl.mesh.visible = mode !== 'hover';

      // camera: low over the lawn, the landing spot right of centre on wide screens (text on the left)
      const wide = ctx.aspect >= 1;
      const fit = wide ? 1 : Math.pow(1 / ctx.aspect, 0.6);
      const look = wide ? new Vector3(-9, 6.5, -14) : new Vector3(-1, 7.5, -8);
      const pos = wide ? new Vector3(-14 + ctx.pointer.x * 1.5, 6 - ctx.pointer.y * 0.6, 30) : new Vector3(-3, 7, 30);
      camera.position.copy(look).add(pos.clone().sub(look).multiplyScalar(fit));
      camera.position.y += lerp(1.5, 0, ease.inOut(p));
      camera.fov = wide ? 30 : 38;
      camera.lookAt(look);
      camera.updateProjectionMatrix();
    },
  };
};

export default create;
