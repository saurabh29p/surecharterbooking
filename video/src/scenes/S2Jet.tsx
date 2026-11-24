import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { buildEnv } from '../lib/env';
import { useBg, useOverlay, usePlate } from '../lib/layer';
import { Cam, Stage } from '../lib/Stage';
import { FPS, lerp, ramp, smooth, TL } from '../lib/timing';
import { Glow } from '../models/Glow';
import { Jet } from '../models/Jet';
import { LightPoints } from '../models/LightPoints';
import { Ribbon } from '../models/Ribbon';
import { Ridge, RidgeSpec } from '../models/Ridge';
import { Sky, SkySpec } from '../models/Sky';
import { Headline, parse } from '../overlay/Headline';
import type { Variant } from '../Film';

const SUN: [number, number, number] = [0.62, 0.035, -1];
const LIFT = TL.events.jetLiftoff - TL.scenes.jet[0]; // 3.0 s into the shot, on the beat
const GROUND_H = 2.34;

const DUSK: SkySpec = {
  zenith: '#060d28', mid: '#16294f', horizon: '#c99a5e', ground: '#1d1b20',
  glowColor: '#ffb257', glowDir: SUN, glowPower: 0.95, glowSpread: 2.8, glowHeight: 13,
  moonDir: null, stars: 0.22, streaks: 0.75, streakColor: '#1d2944', streakLit: '#e9b26c',
};

const RIDGES: RidgeSpec[] = [
  { z: -2600, width: 9000, bottom: -300, top: 260, base: 28, amp: 60, freq: 0.0018, seed: 7.2, color: '#3a3550', rim: '#c88a55', mist: '#6e5a5e', mistAmount: 0.6 },
  { z: -1700, width: 7000, bottom: -300, top: 200, base: 8, amp: 46, freq: 0.0026, seed: 3.3, color: '#211f38', rim: '#a8744a', mist: '#46394a', mistAmount: 0.55, lamps: 0.02 },
  { z: -1100, width: 5000, bottom: -300, top: 120, base: -4, amp: 22, freq: 0.004, seed: 5.9, color: '#121222', rim: '#6e4f3c', mist: '#2c2533', mistAmount: 0.5, lamps: 0.03 },
];

/** Jet pose along the analytic take-off path (tau = seconds into the shot). */
const jetPose = (tau: number) => {
  const x = -42 + 8 * tau + 3.3 * tau * tau;
  const vx = 8 + 6.6 * tau;
  const dt = Math.max(0, tau - LIFT);
  const h = 1.7 * dt * dt + 1.6 * dt;
  const vh = 3.4 * dt + 1.6 * (dt > 0 ? 1 : 0);
  const climb = Math.atan2(vh, vx);
  const rotate = smooth(ramp(tau, LIFT - 0.45, LIFT + 0.15)) * THREE.MathUtils.degToRad(8.5);
  const pitch = Math.max(rotate, climb + rotate * 0.35 * smooth(ramp(tau, LIFT, LIFT + 1.5)));
  return { pos: new THREE.Vector3(x, GROUND_H + h, 0), pitch, gear: 1 - smooth(ramp(tau, LIFT + 0.9, LIFT + 2.2)) };
};

const engineWorld = (tau: number, side: number) => {
  const { pos, pitch } = jetPose(tau);
  const local = new THREE.Vector3(-5.9, 0.78, side * 1.72);
  return local.applyAxisAngle(new THREE.Vector3(0, 0, 1), pitch).add(pos);
};

const runwayLights = () => {
  const p: number[] = [], c: number[] = [];
  for (let x = -600; x <= 2400; x += 30) {
    for (const z of [-24, 24]) { p.push(x, 0.35, z); c.push(1.0, 0.82, 0.55); }
  }
  for (let x = -600; x <= 2400; x += 60) { p.push(x, 0.3, -70); c.push(0.25, 0.45, 1.0); }
  // distant settlement lights on the plain
  let s = 7;
  const r = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
  for (let i = 0; i < 500; i++) { p.push(-1500 + r() * 4500, 0.5, -300 - r() * 900); c.push(1, 0.6 + r() * 0.2, 0.3); }
  return { p: new Float32Array(p), c: new Float32Array(c) };
};

const World: React.FC<{ tau: number }> = ({ tau }) => {
  const gl = useThree((s) => s.gl);
  const env = useMemo(
    () => buildEnv(gl, {
      top: '#1a2552', horizon: '#d99a5c', bottom: '#1c1a1f',
      sunDir: SUN, sunColor: '#ffc27a', sunPower: 14, sunSize: 0.05,
      panels: [[[-0.4, 0.8, 0.4], '#4a5a94', 0.35, 0.7], [[0.9, 0.15, -0.2], '#ff9f5a', 2.0, 0.2]],
    }),
    [gl],
  );
  const ground = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#202128', roughness: 0.5, metalness: 0.0, envMapIntensity: 0.55 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vW;\n
          float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
          float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f); return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          {
            float z = abs(vW.z), x = vW.x;
            float onRwy = step(z, 22.5);
            float n = vn(vW.xz * .08) * .6 + vn(vW.xz * .6) * .4;
            vec3 asphalt = vec3(.018, .019, .023) * (.8 + .4 * n);
            vec3 field = vec3(.02, .017, .014) * (.7 + .6 * vn(vW.xz * .02));
            vec3 base = mix(field, asphalt, onRwy);
            float aa = fwidth(z) + .02;
            float paint = smoothstep(.45 + aa, .45 - aa, abs(z - 21.4)) + smoothstep(.45 + aa, .45 - aa, z) * step(mod(x, 50.), 30.);
            paint += smoothstep(1.4, 1.2, abs(mod(z, 3.6) - 1.8)) * step(z, 18.) * step(abs(x + 470.), 22.); // threshold bars
            paint = clamp(paint, 0., 1.) * onRwy;
            float tire = smoothstep(.4, .9, vn(vec2(x * .02, z * .9))) * step(z, 8.) * .5;
            diffuseColor.rgb = mix(base * (1. - tire * .4), vec3(.42, .42, .4), paint);
            roughnessFactor = mix(mix(.92, .55 + .2 * n, onRwy), .6, paint);
          }`);
    };
    return m;
  }, []);
  ground.envMap = env;
  const lights = useMemo(runwayLights, []);
  const pose = jetPose(tau);
  const beat = 0.75;
  const strobe = Math.max(0, 1 - ((tau % 1.0) / 0.06)) ;
  const beacon = 0.5 + 0.5 * Math.sin(tau * 2 * Math.PI / beat);
  // contrails: from just before lift-off, trailing up to 3 s of history
  const trail = (side: number) => {
    const t0 = Math.max(LIFT - 0.25, tau - 3.0);
    const pts: THREE.Vector3[] = [];
    const N = 160;
    if (tau <= t0) return pts;
    for (let i = 0; i <= N; i++) pts.push(engineWorld(t0 + ((tau - t0) * i) / N, side));
    return pts;
  };
  const trailOn = smooth(ramp(tau, LIFT - 0.15, LIFT + 0.6));
  const ll = pose.pos.clone().add(new THREE.Vector3(7.6, -1.45, 0.25).applyAxisAngle(new THREE.Vector3(0, 0, 1), pose.pitch));
  const ll2 = pose.pos.clone().add(new THREE.Vector3(2.7, -0.7, 1.4).applyAxisAngle(new THREE.Vector3(0, 0, 1), pose.pitch));
  return (
    <>
      <fogExp2 attach="fog" args={['#4a3c44', 0.00045]} />
      <Sky spec={DUSK} time={tau} />
      {RIDGES.map((r, i) => <Ridge key={i} spec={r} time={tau} />)}
      <hemisphereLight args={['#5464a0', '#2a2018', 0.28]} />
      <directionalLight position={[SUN[0] * 100, 14, SUN[2] * 100]} color="#ffb468" intensity={4.2} />
      <directionalLight position={[-30, 20, 60]} color="#8a98d0" intensity={0.35} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={ground} position={[400, 0, 0]}>
        <planeGeometry args={[8000, 4000]} />
      </mesh>
      <LightPoints positions={lights.p} colors={lights.c} size={0.22} intensity={1.6} time={tau} />
      <group position={pose.pos} rotation={[0, 0, pose.pitch]}>
        <Jet env={env} gear={pose.gear} strobe={strobe} beacon={beacon} landingLights={1} exhaust={0.3 + 0.7 * smooth(ramp(tau, 0, LIFT))} />
      </group>
      <Glow position={[ll.x, ll.y, ll.z]} color="#fff2dc" intensity={1.6 * pose.gear + 0.2} size={3.2} />
      <Glow position={[ll2.x, ll2.y, ll2.z]} color="#fff2dc" intensity={0.7} size={1.8} />
      {[1, -1].map((s) => (
        <Ribbon key={s} points={trail(s)} time={tau}
          width={(u) => 0.25 + (1 - u) * 2.4}
          alpha={(u) => smooth(ramp(u, 0, 0.35)) * smooth(ramp(1 - u, 0, 0.02)) * 0.9 * trailOn}
          color="#e7b764" core="#fff3d6" intensity={1.6} />
      ))}
    </>
  );
};

export const S2Jet: React.FC<{ variant: Variant }> = ({ variant }) => {
  const frame = useCurrentFrame();
  const bg = useBg(); const plate = usePlate(); const overlay = useOverlay();
  const tau = frame / FPS;
  const pose = jetPose(tau);
  const cx = -26 + 9.5 * tau - 1.0 * Math.max(0, tau - 3) ** 2;
  const cy = lerp(4.4, 4.0, smooth(ramp(tau, 2.5, 6)));
  const cz = lerp(31, 34, smooth(ramp(tau, 0, 6)));
  const look = pose.pos.clone().add(new THREE.Vector3(lerp(6, 0, smooth(ramp(tau, 0, 3))), lerp(-0.4, 1, smooth(ramp(tau, 2, 5))), 0));
  const flash = 0.85 * (1 - smooth(ramp(tau, 0, 0.38)));
  const out = smooth(ramp(tau, 5.75, 6.0));
  return (
    <AbsoluteFill style={{ background: bg }}>
      {plate && <Stage post={{ bloomStrength: 0.6, bloomThreshold: 1.15, exposure: 1.0 + flash * 0.3, grain: 0.03, vignette: 0.55, flash: flash + out * 0.6, warmth: 0.6 }}>
        <Cam pos={[cx, cy, cz]} target={[look.x, look.y, look.z]} fov={lerp(27, 30, smooth(ramp(tau, 3, 6)))} roll={Math.sin(tau * 0.7) * 0.01} />
        <World tau={tau} />
      </Stage>}
      {overlay && variant.headlines && (
        <Headline lines={[parse('Private jets —'), parse('your family, *flown in together.*')]} inAt={1.4} outAt={5.6} />
      )}
    </AbsoluteFill>
  );
};
