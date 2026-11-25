import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { useBg, useOverlay, usePlate } from '../lib/layer';
import { Cam, Stage, useIsPortrait } from '../lib/Stage';
import { easeInOutSine, FPS, lerp, ramp, smooth } from '../lib/timing';
import { CloudSpec } from '../models/Cloud';
import { Headline, parse } from '../overlay/Headline';
import { NightWorld } from './NightWorld';
import type { Variant } from '../Film';

const LIT = '#6d77a6';
const SHADOW = '#0f1430';
const RIM = '#d8ad66';

// Camera path (shared with the cloud layout so each clearing sits where the camera crosses).
const Z0 = 86, Z1 = 24;
const camAtZ = (z: number) => {
  const p = (Z0 - z) / (Z0 - Z1);
  return [lerp(-4, 3, p), lerp(31, 27, p)] as const;
};

/** A cloud sheet across the camera path with an off-centre clearing the camera glides through. */
const sheet = (z: number, ox: number, oy: number, w: number, h: number, seed: number, holeR: number, opacity = 0.85, light: [number, number] = [0.65, 0.5]): CloudSpec => {
  const [cx, cy] = camAtZ(z);
  const px = cx + ox, py = cy + oy;
  return {
    pos: [px, py, z], size: [w, h], seed, opacity, lit: LIT, shadow: SHADOW, rim: RIM, light, coverage: 0.62, scale: 2.0,
    hole: [(cx - px) / w + 0.5, (cy - py) / h + 0.5, holeR],
  };
};

const CLOUDS: CloudSpec[] = [
  sheet(76, 3, -2, 46, 24, 1.1, 0.2, 0.9),
  sheet(64, -4, 3, 52, 28, 2.4, 0.22, 0.85, [0.7, 0.3]),
  sheet(52, 5, 1, 60, 30, 3.9, 0.24, 0.8),
  sheet(41, -6, -3, 64, 32, 5.3, 0.26, 0.75, [0.6, 0.6]),
  sheet(31, 4, 4, 70, 34, 6.8, 0.3, 0.7),
];

export const S1Night: React.FC<{ variant: Variant }> = ({ variant }) => {
  const frame = useCurrentFrame();
  const bg = useBg(); const plate = usePlate(); const overlay = useOverlay();
  const t = frame / FPS;
  const portrait = useIsPortrait();
  const p = easeInOutSine(ramp(t, 0, 6.2));
  const camZ = lerp(86, 24, p);
  const camY = lerp(31, 27, p);
  const camX = lerp(-4, 3, p);
  // a slow breath of roll, and the end flash into the next scene (lands on the 6.0 s downbeat)
  const roll = Math.sin(t * 0.6) * 0.008 + lerp(0.01, -0.012, p);
  const flash = smooth(ramp(t, 5.68, 6.0)) * 0.85;
  const fadeIn = 1 - smooth(ramp(t, 0, 1.4));
  return (
    <AbsoluteFill style={{ background: bg }}>
      {plate && <Stage
        post={{ bloomStrength: 0.85, bloomRadius: 0.75, bloomThreshold: 0.62, exposure: 1.05 + flash * 0.25, grain: 0.032, vignette: 0.62, flash, fade: fadeIn, warmth: 0.55, saturation: 0.82 }}
      >
        <Cam pos={[camX, camY, camZ]} target={[camX * 0.4 + (portrait ? 140 : 10), 6, -700]} fov={32} roll={roll} />
        <NightWorld
          t={t}
          camZ={camZ}
          clouds={CLOUDS}
          cloudFade={[1.5, 9]}
          dust={{ count: 2600, min: [-90, -10, -80], size: [180, 80, 180], particleSize: 0.16, focus: 34, aperture: 0.9, intensity: 1.25, rise: 1.2, wind: [1.2, 0, -0.6], seed: 3 }}
        />
      </Stage>}
      {overlay && variant.headlines && (
        <Headline lines={[parse('Some arrivals are'), parse('*remembered forever.*')]} inAt={0.8} outAt={5.5} />
      )}
    </AbsoluteFill>
  );
};
