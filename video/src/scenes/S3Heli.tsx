import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { buildEnv } from '../lib/env';
import { NOISE } from '../lib/glsl';
import { useBg, useOverlay, usePlate } from '../lib/layer';
import { Cam, Stage } from '../lib/Stage';
import { FPS, lerp, ramp, smooth, TL } from '../lib/timing';
import { Glow } from '../models/Glow';
import { Helicopter } from '../models/Helicopter';
import { LightPoints } from '../models/LightPoints';
import { Palace } from '../models/Palace';
import { Petals } from '../models/Petals';
import { Sky, SkySpec } from '../models/Sky';
import { Headline, parse } from '../overlay/Headline';
import type { Variant } from '../Film';

const TOUCH = TL.events.heliTouchdown - TL.scenes.heli[0]; // 4.5 s, on the beat
const PALACE_Z = -98;

const TWILIGHT: SkySpec = {
  zenith: '#050918', mid: '#0d1736', horizon: '#253058', ground: '#0b0f1e',
  glowColor: '#8a6a44', glowDir: [0, 0, -1], glowPower: 0.18, glowSpread: 1.5, glowHeight: 9,
  moonDir: null, stars: 0.7, streaks: 0.35, streakColor: '#141c3a', streakLit: '#6e5a52',
};

export const heliPose = (tau: number) => {
  const u = Math.min(1, tau / TOUCH);
  const e = 1 - Math.pow(1 - u, 2.4);
  const settle = tau > TOUCH ? Math.exp(-(tau - TOUCH) * 6) * Math.sin((tau - TOUCH) * 18) * 0.04 : 0;
  return {
    pos: new THREE.Vector3(-15 * (1 - e), 26 * (1 - e) + settle, -12 * (1 - e)),
    yaw: -0.55 - 0.35 * (1 - e),
    pitch: 0.12 * (1 - e) * smooth(ramp(tau, 0, 1.5)),
    roll: 0.05 * (1 - e),
    height: 26 * (1 - e),
  };
};
const washAt = (tau: number) => 1 - smooth(ramp(heliPose(tau).height, 3, 20));
const washIntegral = (tau: number) => {
  let s = 0;
  for (let x = 0; x < tau; x += 0.01) s += washAt(x) * 0.01;
  return s;
};

const buildLights = () => {
  const p: number[] = [], c: number[] = [];
  // scalloped garland strings of fairy lights along each storey of the façade
  for (const y0 of [25.4, 17.2, 8.4]) {
    for (let x = -77; x <= 77; x += 0.45) {
      const ph = ((x + 77) % 6) / 6;
      p.push(x, y0 - 1.1 * Math.sin(ph * Math.PI), PALACE_Z + 1.2); c.push(1, 0.72, 0.36);
    }
  }
  for (let x = -38; x <= 38; x += 0.45) { const ph = ((x + 38) % 4.5) / 4.5; p.push(x, 33 - 0.8 * Math.sin(ph * Math.PI), PALACE_Z + 1.2); c.push(1, 0.72, 0.36); }
  // diya ring around the landing circle
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; p.push(Math.cos(a) * 9.6, 0.12, Math.sin(a) * 9.6); c.push(1, 0.55, 0.18); }
  // lantern rows lining the lawn
  for (let z = -86; z <= 46; z += 7) for (const x of [-26, 26]) { p.push(x, 1.7, z); c.push(1, 0.7, 0.35); }
  return { p: new Float32Array(p), c: new Float32Array(c) };
};

const lawnMaterial = () => {
  const m = new THREE.MeshStandardMaterial({ color: '#1d3a1c', roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWash = { value: 0 };
    sh.uniforms.uT = { value: 0 };
    m.userData.sh = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vW; uniform float uWash, uT;\n${NOISE}`).replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      {
        float r = length(vW.xz);
        float stripe = step(.5, fract(vW.x / 6.));
        float n = vnoise(vW.xz * 1.7) * .5 + vnoise(vW.xz * 7.) * .5;
        vec3 g = mix(vec3(.014, .06, .016), vec3(.024, .085, .026), stripe) * (.75 + .5 * n);
        // rotor wash ripples racing outward through the grass
        float rip = sin(r * 2.2 - uT * 14.) * .5 + .5;
        g *= 1. + uWash * rip * .5 * (1. - smoothstep(3., 22., r));
        // marigold garland rings around the landing circle
        float ring = smoothstep(.32, .1, abs(r - 8.6)) * (.7 + .3 * vnoise(vW.xz * 9.));
        float ring2 = smoothstep(.22, .05, abs(r - 8.1));
        vec3 col = mix(g, vec3(.95, .38, .03), ring);
        col = mix(col, vec3(1., .7, .12), ring2 * .9);
        // fallen petals scattered on the lawn
        float pet = step(.86, vnoise(vW.xz * 4.)) * (1. - smoothstep(10., 26., r)) * smoothstep(9., 10.5, r);
        col = mix(col, vec3(.9, .4, .04), pet * .7);
        diffuseColor.rgb = col;
      }`,
    );
  };
  return m;
};

const World: React.FC<{ tau: number }> = ({ tau }) => {
  const gl = useThree((s) => s.gl);
  const env = useMemo(
    () => buildEnv(gl, {
      top: '#121a3a', horizon: '#8a6040', bottom: '#2a1d12',
      panels: [[[0, 0.2, -1], '#ffb060', 3.5, 0.45], [[0.3, 0.9, 0.2], '#3a4a80', 0.6, 0.6], [[1, 0.1, 0.4], '#ff9a50', 1.2, 0.25]],
    }),
    [gl],
  );
  const lawn = useMemo(lawnMaterial, []);
  const lights = useMemo(buildLights, []);
  const beamMat = useMemo(
    () => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uI: { value: 1 } },
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = -position.y / 30.; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = edge * (1. - smoothstep(0., 1., vY)) * smoothstep(0., .04, vY) * .14 * uI; gl_FragColor = vec4(vec3(1., .9, .72) * a, 1.); }`,
    }),
    [],
  );
  const pose = heliPose(tau);
  const wash = washAt(tau);
  if (lawn.userData.sh) { lawn.userData.sh.uniforms.uWash.value = wash; lawn.userData.sh.uniforms.uT.value = tau; }
  const rotor = tau * 2 * Math.PI * 4.1;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.roll, pose.yaw, pose.pitch, 'YXZ'));
  const beamOrigin = new THREE.Vector3(2.4, 0.9, 0).applyQuaternion(q).add(pose.pos);
  const beamOn = 1 - smooth(ramp(tau, TOUCH + 0.3, TOUCH + 1.2));
  const beat = 0.75;
  const beacon = 0.5 + 0.5 * Math.sin((tau * 2 * Math.PI) / beat);
  return (
    <>
      <fogExp2 attach="fog" args={['#141a33', 0.004]} />
      <Sky spec={TWILIGHT} time={tau} />
      <Palace position={[0, 0, PALACE_Z]} time={tau} />
      <hemisphereLight args={['#3a4a86', '#15200f', 0.4]} />
      <directionalLight position={[0, 18, -100]} color="#ffae5e" intensity={2.6} />
      <directionalLight position={[40, 30, 60]} color="#7f8fd0" intensity={0.25} />
      <pointLight position={[-26, 2, 18]} color="#ffc078" intensity={40} distance={40} decay={2} />
      <pointLight position={[26, 2, 18]} color="#ffc078" intensity={40} distance={40} decay={2} />
      <pointLight position={[0, 1, 0]} color="#ff9a3c" intensity={40 * (0.6 + 0.4 * smooth(ramp(pose.height, 12, 2)))} distance={18} decay={2} />
      <spotLight position={beamOrigin.toArray()} target-position={[pose.pos.x + 3, 0, pose.pos.z + 1]} angle={0.42} penumbra={0.6} intensity={900 * beamOn} distance={60} decay={2} color="#fff0d8" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={lawn}>
        <planeGeometry args={[600, 600]} />
      </mesh>
      <LightPoints positions={lights.p} colors={lights.c} size={0.08} intensity={1.3} time={tau} flicker={0.3} />
      <group position={pose.pos} quaternion={q}>
        <Helicopter env={env} rotorAngle={rotor} beacon={beacon} strobe={Math.max(0, 1 - (tau % 1.1) / 0.07)} />
        <mesh position={[2.4, 0.9, 0]} rotation={[0, 0, -0.18]} material={beamMat}>
          <coneGeometry args={[7.5, 30, 48, 1, true]} />
        </mesh>
      </group>
      <Glow position={beamOrigin.toArray() as [number, number, number]} color="#fff1d6" intensity={1.8 * beamOn + 0.15} size={3.2} />
      <Petals count={9000} time={tau} wash={wash} washInt={washIntegral(tau)} center={[0, 0, 0]} beamPos={beamOrigin.toArray() as [number, number, number]} beamOn={beamOn} focus={24} aperture={0.75} size={0.09} />
    </>
  );
};

export const S3Heli: React.FC<{ variant: Variant }> = ({ variant }) => {
  const frame = useCurrentFrame();
  const bg = useBg(); const plate = usePlate(); const overlay = useOverlay();
  const tau = frame / FPS;
  const p = smooth(ramp(tau, 0, 6));
  const pose = heliPose(tau);
  const cam: [number, number, number] = [lerp(13, 9, p), lerp(1.5, 2.0, p), lerp(36, 28, p)];
  const target: [number, number, number] = [lerp(pose.pos.x * 0.7, 0, p) - 1, lerp(pose.pos.y * 0.8 + 3, 3.4, smooth(ramp(tau, 1, 5))), pose.pos.z * 0.5];
  const flash = 0.9 * (1 - smooth(ramp(tau, 0, 0.5))) + 0.9 * smooth(ramp(tau, 5.6, 6.0));
  return (
    <AbsoluteFill style={{ background: bg }}>
      {plate && <Stage post={{ bloomStrength: 0.55, bloomThreshold: 1.0, exposure: 1.05, grain: 0.032, vignette: 0.6, flash, warmth: 0.6 }}>
        <Cam pos={cam} target={target} fov={lerp(36, 32, p)} roll={Math.sin(tau * 0.5) * 0.008} />
        <World tau={tau} />
      </Stage>}
      {overlay && variant.headlines && (
        <Headline lines={[parse('Helicopter arrivals —'), parse('an entrance *they’ll never forget.*')]} inAt={1.4} outAt={5.6} />
      )}
    </AbsoluteFill>
  );
};
