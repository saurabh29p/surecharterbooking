import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { HdriSky, rotForAzimuth, skyBrightDir, useHdrEnv } from '../../lib/hdri';
import { useBg, useOverlay, usePlate } from '../../lib/layer';
import { Cam, Stage, useIsPortrait, useTime } from '../../lib/Stage';
import { easeInOutSine, lerp, ramp, smooth } from '../../lib/timing';
import { Diyas } from '../../models/Diyas';
import { GoldDust } from '../../models/GoldDust';
import { Hills3D } from '../../models/Hills3D';
import { Lake } from '../../models/Lake';
import { LightPoints } from '../../models/LightPoints';
import { Moon } from '../../models/Moon';
import { PalaceMesh, getPalace } from '../../models/PalaceMesh';
import { parse } from '../../overlay/Headline';
import { Title } from '../../overlay/Title';
import type { Variant } from '../../Film';

export const SKY = 'kloppenheim_02_puresky' as const;
// The HDRI's own moon sits behind the camera (front-left of the façade): its image light and a cool
// key from the same side light the palace. A crisp crescent is placed in view, upper right; it also
// drives the glitter path on the water.
export const SKY_ROT = rotForAzimuth(SKY, (128 * Math.PI) / 180);
export const ELEV_SHIFT = 0;
export const KEY_DIR = skyBrightDir(SKY, SKY_ROT, 0);
const az = (-66 * Math.PI) / 180, el = (6.5 * Math.PI) / 180;
export const MOON_DIR = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));

/** 0 in the lake, rising smoothly to 1 on land: a far shore behind the palace and side shores, with a wandering shoreline. */
export const lakeMask = (x: number, z: number) => {
  const wob = 30 * Math.sin(x / 95 + 1.3) + 18 * Math.sin(x / 41 + 0.4);
  const back = smooth(ramp(-(z + 300 + wob), 0, 520));
  const sideX = Math.abs(x) - (520 + 40 * Math.sin(z / 120));
  const side = smooth(ramp(sideX, 0, 380));
  return Math.min(1, Math.max(back, side));
};

export const LakeWorld: React.FC<{ t: number; loop?: number; diyas?: number }> = ({ t, loop = 0, diyas = 140 }) => {
  const env = useHdrEnv(SKY, SKY_ROT, 1.1);
  const pal = getPalace();
  const lamps = React.useMemo(() => {
    const p: number[] = [], c: number[] = [];
    pal.lamps.forEach((v) => { p.push(v.x, v.y, v.z); c.push(1, 0.68, 0.34); });
    return { p: new Float32Array(p), c: new Float32Array(c) };
  }, []);
  return (
    <>
      <fogExp2 attach="fog" args={['#0b1226', 0.00055]} />
      <HdriSky name={SKY} rot={SKY_ROT} equi={env?.equi ?? null} exposure={0.42} tint="#b4c4ff" twinkle={0.8} time={t} elevShift={ELEV_SHIFT} ground="#0a0f1c" />
      <Moon dir={MOON_DIR} angle={0.026} intensity={7} />
      <directionalLight position={KEY_DIR.clone().multiplyScalar(500)} color="#a9bbff" intensity={0.55} />
      <directionalLight position={MOON_DIR.clone().multiplyScalar(500)} color="#d9e2ff" intensity={0.8} />
      <hemisphereLight args={['#2a3762', '#0b0f1a', 0.25]} />
      <PalaceMesh flood={2.8} glow={1.25} />
      <LightPoints positions={lamps.p} colors={lamps.c} size={0.35} intensity={2.4} minPx={2} time={t} flicker={0.15} />
      <Hills3D lake={lakeMask} color="#2a3352" height={95} />
      <Lake time={t} lightDir={MOON_DIR} deep="#040710" fog="#0b1226" fogDensity={0.00055} />
      <Diyas count={diyas} area={[-60, 60, 18, 150]} time={t} loop={loop} scale={1.2} />
      <GoldDust spec={{ count: 900, min: [-120, 0, -20], size: [240, 60, 260], particleSize: 0.12, focus: 120, aperture: 0.3, intensity: 0.7, rise: 0.6, wind: [0.4, 0, 0], seed: 11, loopPeriod: loop || undefined }} time={t} />
    </>
  );
};

export const S1Lake: React.FC<{ variant: Variant }> = ({ variant }) => {
  const t = useTime();
  const bg = useBg(); const plate = usePlate(); const overlay = useOverlay();
  const portrait = useIsPortrait();
  const p = easeInOutSine(ramp(t, -0.6, 5.4));
  const cam = portrait
    ? new THREE.Vector3(lerp(-12, -3, p), lerp(24, 13, p), lerp(165, 96, p))
    : new THREE.Vector3(lerp(-28, -7, p), lerp(28, 14, p), lerp(178, 94, p));
  const target = new THREE.Vector3(lerp(4, 0, p), lerp(13, 15, p), 0);
  const fadeIn = 0.35 * (1 - smooth(ramp(t, 0, 0.6)));
  return (
    <AbsoluteFill style={{ background: bg }}>
      {plate && (
        <Stage post={{ exposure: 1.3, fade: fadeIn }}>
          <Cam pos={cam} target={target} fov={portrait ? 40 : 36} roll={Math.sin(t * 0.5) * 0.004} />
          <LakeWorld t={t} />
        </Stage>
      )}
      {overlay && variant.headlines && (
        <Title lines={[parse('Some arrivals are'), parse('*remembered forever.*')]} inAt={0.6} outAt={4.6} />
      )}
    </AbsoluteFill>
  );
};
