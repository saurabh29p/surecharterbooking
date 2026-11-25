import React, { useMemo } from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { HdriSky, useHdrEnv } from '../../lib/hdri';
import { useBg, useOverlay, usePlate } from '../../lib/layer';
import { Cam, Stage, useIsPortrait, useTime } from '../../lib/Stage';
import { easeOutCubic, lerp, ramp, smooth, TL } from '../../lib/timing';
import { HeliV2 } from '../../models/HeliV2';
import { LightPoints } from '../../models/LightPoints';
import { Marigolds } from '../../models/Marigolds';
import { PalaceMesh, useTextures } from '../../models/PalaceMesh';
import { parse } from '../../overlay/Headline';
import { Title } from '../../overlay/Title';
import { project } from './S2Jet';
import { NOISE } from '../../lib/glsl';
import { SKY, SKY_ROT } from './S1Lake';
import type { Variant } from '../../Film';

/** Touchdown, in shot time. */
const TD = TL.events.heliTouchdown - TL.scenes.heli[0];
const PALACE_POS: [number, number, number] = [-26, 0, -112];

/** Approach from the upper left, flare, hover-taxi over the pad, slow vertical descent, touchdown at TD. */
export const heliPose = (tau: number) => {
  const hx = easeOutCubic(ramp(tau, -0.8, TD - 0.9));
  const hy = smooth(ramp(tau, -0.3, TD));
  const pos = new THREE.Vector3(lerp(-20, 0, hx), 12 * (1 - hy) ** 1.25, lerp(-9, 0, hx));
  const settle = tau > TD ? -0.05 * Math.sin(Math.min(1, (tau - TD) / 0.35) * Math.PI) : 0;
  pos.y += settle;
  const decel = smooth(ramp(tau, 0.2, 1.4)) * (1 - smooth(ramp(tau, 1.8, 3.2)));
  return {
    pos,
    pitch: 0.16 * decel - 0.05 * (1 - smooth(ramp(tau, -0.5, 0.6))),
    yaw: lerp(0.65, -0.55, smooth(ramp(tau, 0.0, TD - 0.3))),
    roll: 0.06 * Math.sin(tau * 1.3) * (1 - hy),
    height: pos.y,
  };
};
/** Running integral of rotor wash (strong near the ground) for the petals. */
const washAt = (h: number) => Math.exp(-h / 4);
const washIntegral = (tau: number) => {
  let s = 0;
  for (let x = -1; x < tau; x += 1 / 60) s += washAt(heliPose(x).height) / 60;
  return s;
};

const Forecourt: React.FC<{ time: number; wash: number }> = ({ time, wash }) => {
  const tex = useTextures([['leafy_grass_diff.jpg', true], ['old_sandstone_02_diff.jpg', true], ['leafy_grass_nor.jpg', false]]);
  const mat = useMemo(() => {
    if (!tex) return null;
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0, envMapIntensity: 0.6 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: tex[0] }; sh.uniforms.tStone = { value: tex[1] }; sh.uniforms.tNor = { value: tex[2] };
      sh.uniforms.uT = { value: 0 }; sh.uniforms.uWash = { value: 0 };
      m.userData.shader = sh;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vW; uniform sampler2D tGrass, tStone, tNor; uniform float uT, uWash;`)
        .replace('#include <map_fragment>', `
          float r = length(vW.xz);
          vec3 grass = texture2D(tGrass, vW.xz * .35).rgb * vec3(.15, .2, .16);
          grass *= .75 + .25 * texture2D(tGrass, vW.xz * .03).g;
          // rotor wash: rings of flattened grass running outward
          float ring = sin(r * 2.6 - uT * 15.) * exp(-r / 9.) * uWash;
          grass *= 1. + .7 * ring;
          vec3 stone = texture2D(tStone, vW.xz * .25).rgb * vec3(.55, .5, .45);
          float pad = smoothstep(7.05, 6.95, r);
          float path = step(abs(vW.x), 2.6) * step(vW.z, -6.5) * step(-120., vW.z);
          float stoneM = max(pad, path);
          float inlay = smoothstep(.09, .03, abs(r - 6.2)) * pad + smoothstep(.06, .02, abs(r - 3.2)) * pad;
          diffuseColor.rgb = mix(grass, stone, stoneM);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.85, .66, .32), inlay);`)
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(.95, .55, stoneM); roughnessFactor = mix(roughnessFactor, .25, inlay);`)
        .replace('#include <metalnessmap_fragment>', `float metalnessFactor = inlay;`);
    };
    m.customProgramCacheKey = () => 'forecourt';
    return m;
  }, [tex]);
  const lanterns = useMemo(() => {
    const p: number[] = [], c: number[] = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; p.push(Math.cos(a) * 7.6, 0.25, Math.sin(a) * 7.6); c.push(1, 0.66, 0.3); }
    for (let z = -9; z > -110; z -= 4) for (const x of [-3.4, 3.4]) { p.push(x, 0.3, z); c.push(1, 0.62, 0.28); }
    return { p: new Float32Array(p), c: new Float32Array(c) };
  }, []);
  if (!mat) return null;
  const sh = mat.userData.shader;
  if (sh) { sh.uniforms.uT.value = time; sh.uniforms.uWash.value = wash; }
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
        <planeGeometry args={[1200, 1200]} />
      </mesh>
      <LightPoints positions={lanterns.p} colors={lanterns.c} size={0.13} intensity={1.8} minPx={1.6} time={time} flicker={0.2} />
      <WashHaze time={time} wash={wash} />
    </>
  );
};

/** Downwash: a low, warm haze of dust and grass blown outward from the pad in rolling rings. */
const WashHaze: React.FC<{ time: number; wash: number }> = ({ time, wash }) => {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uW: { value: 0 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `${NOISE}
      uniform float uT, uW; varying vec2 vP;
      void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
        float n = fbm4(vec2(a * 3., r * .6 - uT * 2.2)) ;
        float rings = .5 + .5 * sin(r * 1.7 - uT * 9. + n * 3.);
        float m = smoothstep(2., 5., r) * smoothstep(16., 8., r) * (.35 + .65 * rings) * smoothstep(.35, .75, n);
        gl_FragColor = vec4(vec3(1., .78, .5) * m * uW * .16, 1.); }`,
  }), []);
  mat.uniforms.uT.value = time; mat.uniforms.uW.value = wash;
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.25, 0]} material={mat}><circleGeometry args={[16, 96]} /></mesh>;
};

const World: React.FC<{ tau: number; portrait: boolean; visible: (p: THREE.Vector3) => number }> = ({ tau, visible }) => {
  const env = useHdrEnv(SKY, SKY_ROT, 0.9);
  const pose = heliPose(tau);
  const wash = washAt(pose.height);
  const rotor = tau * 2 * Math.PI * 5.1;
  return (
    <>
      <fogExp2 attach="fog" args={['#0c1428', 0.0068]} />
      <HdriSky name={SKY} rot={SKY_ROT} equi={env?.equi ?? null} exposure={0.3} tint="#b4c4ff" twinkle={0.5} time={tau} ground="#0a0f1c" />
      {/* cool moon key from camera left, a gold rim from the palace behind, warm uplights from the pad lanterns */}
      <directionalLight position={[60, 70, 90]} color="#c9d6ff" intensity={1.6} />
      <directionalLight position={[-30, 60, -60]} color="#ffbf6a" intensity={1.2} />
      <hemisphereLight args={['#2a3762', '#120e0a', 0.3]} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + 0.6;
        return <pointLight key={i} position={[Math.cos(a) * 7.6, 0.6, Math.sin(a) * 7.6]} color="#ffae55" intensity={9} distance={20} decay={2} />;
      })}
      <PalaceMesh flood={0.6} glow={0.75} position={PALACE_POS} rotationY={0.2} />
      <Forecourt time={tau} wash={wash} />
      <group position={pose.pos} rotation={new THREE.Euler(pose.roll, pose.yaw, pose.pitch, 'YXZ')}>
        <HeliV2 rotorAngle={rotor} beacon={0.5 + 0.5 * Math.sin(tau * 2 * Math.PI * 0.8)} strobe={Math.max(0, 1 - (tau % 1.1) / 0.07)} />
      </group>
      <Marigolds time={tau} washInt={washIntegral(tau)} center={[0, 0, 0]} visible={visible}
        layers={[
          { count: 45, box: [5, 12, 0, 4, 11, 18], size: 0.05, fall: 0.5 },       // near the lens: big, soft
          { count: 120, box: [-16, 14, 0, 7, -7, 8], size: 0.05, fall: 0.6 },      // around the pad, lifted by the wash
          { count: 110, box: [-50, 30, 0, 9, -60, -10], size: 0.07, fall: 0.45 }, // behind, toward the palace
        ]} />
    </>
  );
};

/** Low camera near the pad looking up; it creeps in and rises a little as the helicopter settles. */
export const heliCamera = (tau: number, portrait: boolean) => {
  const pose = heliPose(tau);
  const k = smooth(ramp(tau, 0, 5));
  const cam = portrait
    ? new THREE.Vector3(lerp(11.5, 7.5, k), lerp(0.5, 0.65, k), lerp(21, 15.5, k))
    : new THREE.Vector3(lerp(14, 9, k), lerp(0.45, 0.6, k), lerp(23, 15.5, k));
  const look = pose.pos.clone().add(new THREE.Vector3(0, lerp(1.3, portrait ? 3.2 : 2.2, smooth(ramp(tau, 2.5, 4.5))), 0));
  return { cam, look, pose, fov: portrait ? 34 : 29 };
};

export const S3Heli: React.FC<{ variant: Variant }> = ({ variant }) => {
  const tau = useTime();
  const bg = useBg(); const plate = usePlate(); const overlay = useOverlay();
  const portrait = useIsPortrait();
  const { width, height } = useVideoConfig();
  const { cam, look, pose, fov } = heliCamera(tau, portrait);
  const vfov = portrait ? (2 * Math.atan(Math.tan(2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9) * 0.62) / 2) / (width / height)) * 180) / Math.PI : fov;
  // keep petals off the helicopter: hide any petal whose screen position falls inside its screen box
  const box = useMemo(() => {
    const pts: [number, number][] = [];
    for (const dx of [-6.5, 6.5]) for (const dy of [-0.2, 4]) for (const dz of [-5.8, 5.8]) {
      const p = project(pose.pos.clone().add(new THREE.Vector3(dx, dy, dz)), cam, look, vfov, width / height);
      pts.push([p[0], p[1]]);
    }
    return [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  }, [tau, portrait]);
  const pc = useMemo(() => {
    const c = new THREE.PerspectiveCamera(vfov, width / height, 0.1, 10000);
    c.position.copy(cam); c.lookAt(look); c.updateMatrixWorld(); c.updateProjectionMatrix();
    return c;
  }, [tau, portrait]);
  const hd = cam.distanceTo(pose.pos);
  const visible = (p: THREE.Vector3) => {
    const s = p.clone().project(pc);
    const u = s.x * 0.5 + 0.5, v = s.y * 0.5 + 0.5;
    const m = 0.03;
    const inside = Math.min(u - box[0] + m, box[1] + m - u, v - box[2] + m, box[3] + m - v);
    // only petals between the lens and the helicopter can cover it
    if (p.distanceTo(cam) > hd) return 1;
    return 1 - smooth(ramp(inside, 0, 0.04));
  };
  return (
    <AbsoluteFill style={{ background: bg }}>
      {plate && (
        <Stage post={{ exposure: 1.2, dof: { focus: hd, aperture: 2.6, maxBlur: 14 }, time: tau }}>
          <Cam pos={cam} target={look} fov={fov} roll={Math.sin(tau * 0.7) * 0.006} />
          <World tau={tau} portrait={portrait} visible={visible} />
        </Stage>
      )}
      {overlay && variant.headlines && (
        <Title lines={[parse('Helicopter arrivals —'), parse('an entrance *they’ll never forget.*')]} inAt={0.5} outAt={4.6} />
      )}
    </AbsoluteFill>
  );
};
