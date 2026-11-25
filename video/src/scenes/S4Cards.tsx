import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { useBg, useOverlay, usePlate } from '../lib/layer';
import { Cam, Stage, useIsPortrait } from '../lib/Stage';
import { easeInOutSine, easeOutCubic, FPS, lerp, ramp, smooth, TL } from '../lib/timing';
import { Backdrop } from '../models/Backdrop';
import { CardContent, GlassCard, useCardTextures } from '../models/GlassCard';
import { Glow } from '../models/Glow';
import { GoldDust } from '../models/GoldDust';
import { Ribbon } from '../models/Ribbon';
import type { Variant } from '../Film';

const T0 = TL.scenes.cards[0];
const APPEAR = TL.events.cards.map((t) => t - T0); // card beats
const SWEEP = TL.events.contrailSweep - T0; // 7.5 s: gold contrail transition
const END = TL.scenes.contrail[1] - T0; // 9.0 s

export const CARDS: CardContent[] = [
  { icon: 'shield', title: 'Licensed operators only', body: 'Every flight by a DGCA-approved NSOP operator' },
  { icon: 'doc', title: 'Checked before we quote', body: 'Permit, aircraft papers, insurance' },
  { icon: 'receipt', title: 'One all-in price', body: 'Written quote and GST invoice' },
  { icon: 'chat', title: 'One coordinator', body: 'On WhatsApp until you land' },
];

const CW = 3.3, CH = 4.25;

const bez = (u: number, P: THREE.Vector3[]) => {
  const k = Math.min(Math.max(u, 0), 1);
  const a = P[0].clone().multiplyScalar((1 - k) ** 3);
  a.add(P[1].clone().multiplyScalar(3 * (1 - k) ** 2 * k));
  a.add(P[2].clone().multiplyScalar(3 * (1 - k) * k * k));
  a.add(P[3].clone().multiplyScalar(k ** 3));
  if (u > 1) a.add(P[3].clone().sub(P[2]).multiplyScalar((u - 1) * 3));
  if (u < 0) a.add(P[1].clone().sub(P[0]).multiplyScalar(u * 3));
  return a;
};

export const S4Cards: React.FC<{ variant: Variant }> = () => {
  const frame = useCurrentFrame();
  const bg = useBg(); const plate = usePlate(); const overlay = useOverlay();
  const tau = frame / FPS;
  const portrait = useIsPortrait();
  const tex = plate ? useCardTextures(CARDS) : null;
  const layout = CARDS.map((_, i) =>
    portrait
      ? { x: (i % 2 === 0 ? -1 : 1) * (CW / 2 + 0.15), y: (i < 2 ? 1 : -1) * (CH / 2 + 0.15) + 1.6, z: 0, ry: 0 }
      : { x: (i - 1.5) * (CW + 0.26), y: 0.1, z: -Math.abs(i - 1.5) * 0.3, ry: -(i - 1.5) * 0.06 },
  );
  const path = portrait
    ? [new THREE.Vector3(-6, -9, 3), new THREE.Vector3(-3, -1, 5), new THREE.Vector3(3, 1, 5), new THREE.Vector3(6, 10, 2)]
    : [new THREE.Vector3(-13, -3.4, 1.6), new THREE.Vector3(-4.5, 3.2, 2.4), new THREE.Vector3(3.5, -2.2, 2.4), new THREE.Vector3(13.5, 3.2, 1.2)];
  const head = lerp(-0.05, 1.2, smooth(ramp(tau, SWEEP - 0.05, SWEEP + 1.4)) * 0.75 + ramp(tau, SWEEP - 0.05, SWEEP + 1.4) * 0.25);
  const trailPts: THREE.Vector3[] = [];
  if (tau > SWEEP - 0.05) for (let i = 0; i <= 140; i++) trailPts.push(bez(head - 0.6 + (0.6 * i) / 140, path));
  const headP = bez(head, path);
  const p = smooth(ramp(tau, 0, END));
  const camZ = portrait ? lerp(14.2, 13.2, p) : lerp(14.6, 13.3, p);
  const camX = lerp(-0.4, 0.4, p);
  // the wipe follows where the comet head *appears* on screen (it flies close to the lens)
  const screen = (x: number, y: number, z: number) => (portrait ? y - 0.1 : x - camX) / Math.max(camZ - z, 0.5);
  const progress = screen(headP.x, headP.y, headP.z);
  const fadeOut = smooth(ramp(tau, END - 0.55, END));
  return (
    <AbsoluteFill style={{ background: bg }}>
      {plate && <Stage post={{ bloomStrength: 0.55, bloomThreshold: 1.0, exposure: 1, grain: 0.022, vignette: 0.5, toneMap: 0, ca: 0.0015, fade: fadeOut * 0.0, flash: smooth(ramp(tau, END - 0.35, END)) * 0.25 }}>
        <Cam pos={[camX, 0.3, camZ]} target={[0, 0.1, 0]} fov={34} roll={Math.sin(tau * 0.4) * 0.004} />
        <Backdrop z={-14} size={[70, 40]} time={tau} center="#121834" edge="#070a15" jaali={1 - smooth(ramp(tau, SWEEP, END))} sweep={-0.4 + tau * 0.22} />
        <GoldDust spec={{ count: 1400, min: [-16, -10, -10], size: [32, 20, 26], particleSize: 0.035, focus: 15, aperture: 1.2, intensity: 1.2 + 2 * smooth(ramp(tau, SWEEP, SWEEP + 0.8)), rise: 0.4, wind: [0.15, 0, 0], seed: 9 }} time={tau + 20} />
        {tex && layout.map((l, i) => {
          const a = APPEAR[i];
          const e = easeOutCubic(ramp(tau, a - 0.15, a + 1.0));
          const op = smooth(ramp(tau, a - 0.15, a + 0.45));
          const idle = Math.sin(tau * 0.9 + i * 1.7) * 0.05;
          const sweep1 = lerp(-0.5, 1.8, ramp(tau, a + 0.05, a + 1.25));
          const sweep2 = lerp(-0.5, 1.8, ramp(tau, 6.6 + i * 0.12, 7.6 + i * 0.12));
          const sweep = tau < 6.6 ? sweep1 : sweep2;
          const pos = screen(l.x, l.y, l.z);
          const half = (portrait ? CH : CW) / 2 / (camZ - l.z);
          const dis = tau < SWEEP - 0.1 ? 0 : smooth(ramp(progress, pos - half * 0.9, pos + half * 1.1));
          return (
            <group key={i} position={[l.x, l.y + (1 - e) * -1.3 + idle, l.z + (1 - e) * -1.5]} rotation={[(1 - e) * 0.55 + idle * 0.3, l.ry + (1 - e) * (i % 2 ? -0.5 : 0.5), 0]}>
              <GlassCard map={tex[i]} size={[CW, CH]} opacity={op} sweep={sweep} dissolve={dis} seed={i * 3.7} time={tau} />
            </group>
          );
        })}
        <Ribbon points={trailPts} time={tau} width={(u) => 0.04 + (1 - u) * 0.38} alpha={(u) => smooth(ramp(u, 0, 0.7)) * (0.35 + 0.65 * u)} color="#d9a85a" core="#fff1d2" intensity={1.4} />
        <Glow position={[headP.x, headP.y, headP.z]} color="#ffe6b8" intensity={tau > SWEEP && head < 1.25 ? 2.5 : 0} size={3} />
      </Stage>}
    </AbsoluteFill>
  );
};
