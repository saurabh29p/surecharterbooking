import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import './lib/fonts';
import { Cam, Stage } from './lib/Stage';
import { FPS, ramp, smooth } from './lib/timing';
import { CloudSpec } from './models/Cloud';
import { Glow } from './models/Glow';
import { Ribbon } from './models/Ribbon';
import { NightWorld } from './scenes/NightWorld';

/**
 * Muted hero loop for the website: no text, calm, the left third kept dark for the headline.
 * The loop period is LOOP s; scripts/hero.mjs renders LOOP + XF s and crossfades the tail into
 * the head so the seam is invisible. A distant jet crosses the right of the sky once per loop,
 * entering and leaving the frame (and its contrail fading) inside the period.
 */
export const LOOP = 14;
export const XF = 2;

const CLOUDS: CloudSpec[] = [
  { pos: [120, 70, -160], size: [260, 70], seed: 3.3, opacity: 0.55, lit: '#5f6894', shadow: '#0f1430', rim: '#c9a160', light: [0.7, 0.5], coverage: 0.55, scale: 2.4, drift: 0.008 },
];

const jetAt = (t: number) => {
  const u = (t - 1.6) / 9.5; // crosses between 1.6 s and 11.1 s
  return new THREE.Vector3(60 + 520 * u, 150 + 70 * u - 30 * u * u, -620 - 120 * u);
};

export const HeroLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const sway = (k: number) => Math.sin((2 * Math.PI * t) / LOOP + k);
  const trail: THREE.Vector3[] = [];
  const t0 = Math.max(1.6, t - 4.5);
  if (t > 1.6) for (let i = 0; i <= 120; i++) trail.push(jetAt(t0 + ((Math.min(t, 11.1) - t0) * i) / 120));
  const fadeTrail = 1 - smooth(ramp(t, 11.5, 13.6));
  const head = jetAt(Math.min(t, 11.1));
  const on = t > 1.6 && t < 11.1 ? smooth(ramp(t, 1.6, 2.2)) * (1 - smooth(ramp(t, 10.6, 11.1))) : 0;
  const blink = (t * 1.25) % 1 < 0.07 ? 1 : 0;
  return (
    <AbsoluteFill style={{ background: '#0B1020' }}>
      <Stage post={{ bloomStrength: 0.85, bloomRadius: 1, bloomThreshold: 0.6, exposure: 1.45, grain: 0.018, vignette: 0.45, warmth: 0.55, saturation: 0.9 }}>
        <Cam pos={[sway(0) * 0.6, 30 + sway(1) * 0.3, 40]} target={[60, 8, -700]} fov={32} roll={sway(2) * 0.002} />
        <NightWorld
          t={t}
          camZ={40}
          clouds={CLOUDS}
          cloudFade={[1, 2]}
          dust={{ count: 1700, min: [-10, -10, -60], size: [170, 80, 90], particleSize: 0.15, focus: 60, aperture: 0.5, intensity: 1.05, rise: 1.0, wind: [0.6, 0, -0.2], seed: 4, loopPeriod: LOOP }}
        />
        {trail.length > 1 && (
          <Ribbon points={trail} time={t} width={(u) => 0.6 + (1 - u) * 4.5} alpha={(u) => smooth(ramp(u, 0, 0.55)) * 0.75 * fadeTrail * (t > 11.1 ? 1 : 1)} color="#d8a85e" core="#ffeccb" intensity={1.1} />
        )}
        <Glow position={[head.x, head.y, head.z]} color="#fff3e0" intensity={2.2 * on} size={9} />
        <Glow position={[head.x, head.y, head.z]} color="#ffffff" intensity={4 * on * blink} size={7} />
      </Stage>
      {/* left third: dark and calm, for the site's headline */}
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(6,9,20,0.72) 0%, rgba(6,9,20,0.5) 22%, rgba(6,9,20,0.15) 40%, rgba(6,9,20,0) 52%)' }} />
    </AbsoluteFill>
  );
};
