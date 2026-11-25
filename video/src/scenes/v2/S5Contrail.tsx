import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { CenterGlow } from '../../overlay/CenterGlow';
import * as THREE from 'three';
import { HdriSky, useHdrEnv } from '../../lib/hdri';
import { useBg, useOverlay, usePlate } from '../../lib/layer';
import { Cam, Stage, useIsPortrait, useTime } from '../../lib/Stage';
import { easeInOutCubic, lerp, ramp, smooth, TL } from '../../lib/timing';
import { JetV2 } from '../../models/JetV2';
import { Ribbon } from '../../models/Ribbon';
import { DUSK_GRADE, JET_SKY, JET_SKY_ROT, SUN_DIR } from './S2Jet';
import type { Variant } from '../../Film';

const T0 = TL.scenes.contrail[0];
const CLOSEST = TL.events.passClosest - T0; // 0.9 s
const SWEEP = TL.events.contrailSweep - T0; // 1.1 s
const DUR = TL.scenes.contrail[1] - T0; // 2.5 s

/**
 * The jet from scene 2, now at altitude in the last light, banks past close to the lens; its gold
 * contrail is then carried across the frame as a light wipe that leaves midnight behind for the logo.
 */
const V = 70;
const DIR = new THREE.Vector3(1, 0.06, 0.55).normalize();
const C = new THREE.Vector3(4, -3.2, -26);
const jetAt = (t: number) => C.clone().add(DIR.clone().multiplyScalar((t - CLOSEST) * V));
const YAW = -Math.atan2(DIR.z, DIR.x);
const engine = (t: number, side: number) =>
  new THREE.Vector3(-6.4, 0.82, side * 1.82).applyEuler(new THREE.Euler(-0.32, YAW, 0.03, 'YXZ')).add(jetAt(t));

export const contrailCamera = (t: number, portrait: boolean) => {
  const follow = smooth(ramp(t, 0.2, 1.4));
  const cam = new THREE.Vector3(0, 0, 0);
  const look = new THREE.Vector3(lerp(-22, 26, follow), lerp(1.5, -1.5, follow), lerp(-60, -40, follow));
  return { cam, look, fov: portrait ? 44 : 40 };
};

export const S5Contrail: React.FC<{ variant: Variant }> = () => {
  const t = useTime();
  const bg = useBg(); const plate = usePlate(); const overlay = useOverlay();
  const portrait = useIsPortrait();
  const { width, height } = useVideoConfig();
  const { cam, look, fov } = contrailCamera(t, portrait);
  // light wipe: a diagonal gold edge crossing the frame left to right; midnight behind it
  const wipe = easeInOutCubic(ramp(t, SWEEP, DUR - 0.35));
  const edge = lerp(-0.35, 1.35, wipe);
  const trail = (side: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) pts.push(engine(t - 2.2 + (2.2 * i) / 160, side));
    return pts;
  };
  const jet = jetAt(t);
  return (
    <AbsoluteFill style={{ background: bg }}>
      {plate && (
        <Stage post={{ exposure: 1.05, dof: { focus: Math.max(4, cam.distanceTo(jet)), aperture: 0.9, maxBlur: 8 }, time: t + 30 }}>
          <Cam pos={cam} target={look} fov={fov} roll={lerp(0.05, -0.03, smooth(ramp(t, 0, DUR)))} />
          <World t={t} />
          {[1, -1].map((s) => (
            <Ribbon key={s} points={trail(s)} time={t} width={(u) => 0.25 + (1 - u) * 2.4}
              alpha={(u) => smooth(ramp(u, 0.0, 0.5)) * smooth(ramp(1 - u, 0.01, 0.06)) * 0.8} color="#e2ad5c" core="#fff0cf" intensity={1.2} />
          ))}
        </Stage>
      )}
      {overlay && (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          {/* midnight follows the gold edge; the edge itself is a narrow band, never a full-frame flash */}
          {/* behind the edge: the logo scene's own midnight backdrop (radial), so the cut at the bloom is seamless */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 75% 75% at 50% 50%, #1a2048 0%, #121838 45%, #090c18 100%)',
            WebkitMaskImage: `linear-gradient(${portrait ? 160 : 105}deg, #000 0%, #000 ${edge * 100 - 2}%, transparent ${edge * 100 + 5}%)`,
            maskImage: `linear-gradient(${portrait ? 160 : 105}deg, #000 0%, #000 ${edge * 100 - 2}%, transparent ${edge * 100 + 5}%)`,
            opacity: wipe > 0 ? 1 : 0,
          }} />
          <div style={{
            position: 'absolute', inset: '-40%',
            background: `linear-gradient(${portrait ? 160 : 105}deg, rgba(244,227,181,0) ${edge * 100 * 0.556 + 20.5}%, rgba(255,226,160,0.85) ${edge * 100 * 0.556 + 23.2}%, rgba(217,188,120,0.25) ${edge * 100 * 0.556 + 24.5}%, rgba(244,227,181,0) ${edge * 100 * 0.556 + 27}%)`,
            opacity: smooth(ramp(t, SWEEP - 0.05, SWEEP + 0.2)) * (1 - smooth(ramp(t, DUR - 0.45, DUR - 0.05))),
            mixBlendMode: 'screen', filter: 'blur(6px)',
          }} />
          <CenterGlow x={width / 2} y={height * (portrait ? 0.44 : 0.5)} size={height * (portrait ? 0.16 : 0.24)} opacity={0.85 * smooth(ramp(t, DUR - 1.1, DUR))} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const World: React.FC<{ t: number }> = ({ t }) => {
  const env = useHdrEnv(JET_SKY, JET_SKY_ROT + 1.1, 0.7, '#3a3846', DUSK_GRADE);
  const j = jetAt(t);
  return (
    <>
      <HdriSky name={JET_SKY} rot={JET_SKY_ROT + 1.1} equi={env?.equi ?? null} exposure={0.1} grade={DUSK_GRADE} ground="#0d1020" elevShift={-6} />
      <directionalLight position={SUN_DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -1.1).setY(0.12).normalize().multiplyScalar(400)} color="#ffb767" intensity={2.4} />
      <hemisphereLight args={['#33406e', '#14121a', 0.4]} />
      <group position={j} rotation={new THREE.Euler(-0.32, YAW, 0.03, 'YXZ')}>
        <JetV2 gear={0} exhaust={0.1} strobe={Math.max(0, 1 - ((t + 0.3) % 1.0) / 0.06)} beacon={0.6} />
      </group>
    </>
  );
};
