import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import './lib/fonts';
import { Cam, Stage, useTime } from './lib/Stage';
import { LakeWorld } from './scenes/v2/S1Lake';

/**
 * Muted hero loop for the website: the moonlit lake palace from the opening, no text, calm, with the
 * palace on the right and the left third kept dark for the site's headline. Every motion has period
 * LOOP; scripts/build.sh renders LOOP + XF s and crossfades the tail into the head so the seam is invisible.
 */
export const LOOP = 14;
export const XF = 2;

export const HeroLoop: React.FC = () => {
  const t = useTime();
  const w = (k: number) => Math.sin((2 * Math.PI * t) / LOOP + k);
  const cam = new THREE.Vector3(-18 + w(0) * 3.5, 19 + w(1.2) * 0.9, 128 + w(2.1) * 4);
  const target = new THREE.Vector3(-28 + w(0.4) * 1.2, 13, 0);
  return (
    <AbsoluteFill style={{ background: '#0B1020' }}>
      <Stage post={{ exposure: 1.25, time: t }}>
        <Cam pos={cam} target={target} fov={36} roll={w(2.6) * 0.003} />
        <LakeWorld t={t} loop={LOOP} />
      </Stage>
      {/* left third: dark and calm, for the site's headline */}
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(6,9,20,0.78) 0%, rgba(6,9,20,0.55) 24%, rgba(6,9,20,0.15) 42%, rgba(6,9,20,0) 54%)' }} />
    </AbsoluteFill>
  );
};
