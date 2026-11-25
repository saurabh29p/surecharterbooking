import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { HdriSky, rotForAzimuth, SkyGrade, skyBrightDir, useHdrEnv } from '../../lib/hdri';
import { useBg, useOverlay, usePlate } from '../../lib/layer';
import { Cam, Stage, useIsPortrait, useTime } from '../../lib/Stage';
import { lerp, ramp, smooth, TL } from '../../lib/timing';
import { Hills3D } from '../../models/Hills3D';
import { JetV2, GEAR_H } from '../../models/JetV2';
import { Ribbon } from '../../models/Ribbon';
import { Runway } from '../../models/Runway';
import { parse } from '../../overlay/Headline';
import { Title } from '../../overlay/Title';
import type { Variant } from '../../Film';

export const JET_SKY = 'belfast_sunset_puresky' as const;
// low sun ahead of the jet and a little toward the camera: gold rakes the fuselage, the sky behind stays blue
const SUN_AZ = (30 * Math.PI) / 180;
export const JET_SKY_ROT = rotForAzimuth(JET_SKY, SUN_AZ);
export const SUN_DIR = skyBrightDir(JET_SKY, JET_SKY_ROT, 0);
/** The film grade applied to the dusk sky itself: midnight-blue clouds, gold around the sun. */
export const DUSK_GRADE: SkyGrade = { cool: '#6d8fd6', warm: '#ffc070', lo: 3.5, hi: 9, amount: 0.8, glow: '#ffa850', glowStrength: 5, glowPower: 6, zenith: 0.32 };

/** Shot time -> simulation time: normal speed, a slow-motion window around rotation, then normal. */
const ROT = TL.events.jetRotate - TL.scenes.jet[0]; // 2.5 s into the shot
export const simTime = (tau: number) => {
  let s = 0;
  const dt = 1 / 120;
  for (let x = 0; x < tau; x += dt) s += (1 - 0.68 * smooth(ramp(x, ROT - 0.55, ROT - 0.1)) * (1 - smooth(ramp(x, ROT + 0.85, ROT + 1.35)))) * dt;
  return s;
};
const S_LIFT = 2.62;
export const jetPose = (s: number) => {
  const x = -34 + 24 * s + 3.4 * s * s;
  const ds = Math.max(0, s - S_LIFT);
  const h = 5.2 * ds * ds + 3.6 * ds;
  const vx = 24 + 6.8 * s, vh = 10.4 * ds + (ds > 0 ? 3.6 : 0);
  const rotate = smooth(ramp(s, S_LIFT - 0.42, S_LIFT + 0.05)) * THREE.MathUtils.degToRad(9);
  const pitch = Math.max(rotate, Math.atan2(vh, vx) + rotate * 0.4 * smooth(ramp(s, S_LIFT, S_LIFT + 1.2)));
  return { pos: new THREE.Vector3(x, GEAR_H + h, 0), pitch, gear: 1 - smooth(ramp(s, S_LIFT + 0.45, S_LIFT + 1.1)) };
};
const engineWorld = (s: number, side: number) => {
  const { pos, pitch } = jetPose(s);
  return new THREE.Vector3(-6.4, 0.82, side * 1.82).applyAxisAngle(new THREE.Vector3(0, 0, 1), pitch).add(pos);
};

/** World point -> screen UV (0..1, y up) for a look-at camera. */
export const project = (p: THREE.Vector3, cam: THREE.Vector3, target: THREE.Vector3, vfov: number, aspect: number) => {
  const c = new THREE.PerspectiveCamera(vfov, aspect, 0.1, 10000);
  c.position.copy(cam); c.lookAt(target); c.updateMatrixWorld(); c.updateProjectionMatrix();
  const v = p.clone().project(c);
  return [v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, v.z] as const;
};

const farHills = (x: number, z: number) => smooth(ramp(Math.hypot(x - 600, z + 600), 1600, 2600));

const World: React.FC<{ tau: number; s: number }> = ({ tau, s }) => {
  const env = useHdrEnv(JET_SKY, JET_SKY_ROT, 0.8, '#5c5a63', DUSK_GRADE);
  const pose = jetPose(s);
  const trail = (side: number) => {
    const s0 = Math.max(S_LIFT - 0.05, s - 1.3);
    const pts: THREE.Vector3[] = [];
    if (s <= s0) return pts;
    for (let i = 0; i <= 140; i++) pts.push(engineWorld(s0 + ((s - s0) * i) / 140, side));
    return pts;
  };
  const trailOn = smooth(ramp(s, S_LIFT, S_LIFT + 0.6));
  const beat = 0.625;
  return (
    <>
      <fogExp2 attach="fog" args={['#3d4260', 0.00018]} />
      <HdriSky name={JET_SKY} rot={JET_SKY_ROT} equi={env?.equi ?? null} exposure={0.19} grade={DUSK_GRADE} ground="#141218" />
      <directionalLight position={SUN_DIR.clone().setY(0.1).normalize().multiplyScalar(400)} color="#ffb767" intensity={4.2} />
      <directionalLight position={[-60, 40, 140]} color="#8ea4e8" intensity={0.3} />
      <hemisphereLight args={['#2b3760', '#4a4038', 0.35]} />
      <Hills3D lake={farHills} color="#1b1f30" height={70} lights={60} seed={5} />
      <Runway time={tau} />
      <group position={pose.pos} rotation={[0, 0, pose.pitch]}>
        <JetV2 exhaust={0.12} gear={pose.gear} strobe={Math.max(0, 1 - (tau % 1.0) / 0.06)} beacon={0.5 + 0.5 * Math.sin((tau * 2 * Math.PI) / beat)} />
      </group>
      {[1, -1].map((sd) => (
        <Ribbon key={sd} points={trail(sd)} time={tau} width={(u) => 0.15 + (1 - u) * 1.1}
          alpha={(u) => smooth(ramp(u, 0.1, 0.75)) * smooth(ramp(1 - u, 0.04, 0.3)) * 0.55 * trailOn} color="#e8b56a" core="#ffe6b8" intensity={0.9} />
      ))}
    </>
  );
};

/**
 * Camera: a long lens low beside the main wheels, tracking with the jet; slows with the slow-motion at rotation;
 * after lift-off it drops back and swings under the flight path, so the jet climbs past it into the gold.
 */
export const jetCamera = (tau: number, portrait: boolean) => {
  const s = simTime(tau);
  const pose = jetPose(s);
  const k = smooth(ramp(tau, 3.0, 5.0));
  const behind = lerp(1.5, 5, smooth(ramp(tau, 0, 3))) + 36 * Math.pow(k, 1.4);
  const side = portrait ? 25 : 24;
  const cam = new THREE.Vector3(pose.pos.x - behind, lerp(0.9, 2.4, k), lerp(side, 7, k));
  const look = pose.pos.clone().add(new THREE.Vector3(lerp(portrait ? 2.5 : -0.5, 2, k), lerp(portrait ? -0.2 : -0.7, 0.4, k), 0));
  return { s, cam, look, pose, fov: portrait ? lerp(22, 20, k) : lerp(24, 21, k) };
};

export const S2Jet: React.FC<{ variant: Variant }> = ({ variant }) => {
  const tau = useTime();
  const bg = useBg(); const plate = usePlate(); const overlay = useOverlay();
  const portrait = useIsPortrait();
  const { width, height } = useVideoConfig();
  const { s, cam, look, pose, fov } = jetCamera(tau, portrait);
  const vfov = portrait ? (2 * Math.atan(Math.tan(2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9) * 0.62) / 2) / (width / height)) * 180) / Math.PI : fov;
  const plumes = [1, -1].map((sd) => {
    const a = engineWorld(s, sd);
    const b = a.clone().add(new THREE.Vector3(-14, -0.6, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), pose.pitch));
    const pa = project(a, cam, look, vfov, width / height), pb = project(b, cam, look, vfov, width / height);
    return [pa[0], pa[1], pb[0], pb[1], pa[2] < 1 ? 0.9 : 0] as [number, number, number, number, number];
  });
  const horizon = project(new THREE.Vector3(cam.x + 1500, 0, -1500), cam, look, vfov, width / height)[1];
  return (
    <AbsoluteFill style={{ background: bg }}>
      {plate && (
        <Stage post={{ exposure: 1.05, dof: { focus: cam.distanceTo(pose.pos), aperture: 1.6, maxBlur: 10 }, haze: { plumes, band: [horizon - 0.05, horizon, 0.6] }, time: tau }}>
          <Cam pos={cam} target={look} fov={fov} roll={Math.sin(tau * 0.9) * 0.006} />
          <World tau={tau} s={s} />
        </Stage>
      )}
      {overlay && variant.headlines && (
        <Title lines={[parse('Private jets —'), parse('your family, *flown in together.*')]} inAt={0.6} outAt={4.6} />
      )}
    </AbsoluteFill>
  );
};
