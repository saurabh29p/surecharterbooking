import React from 'react';
import { Cloud, CloudSpec } from '../models/Cloud';
import { GoldDust, DustSpec } from '../models/GoldDust';
import { Ridge, RidgeSpec } from '../models/Ridge';
import { Sky, SkySpec } from '../models/Sky';

export const NIGHT_SKY: SkySpec = {
  zenith: '#03050b',
  mid: '#0a0f22',
  horizon: '#1a2040',
  ground: '#0a0e20',
  glowColor: '#a8834f',
  glowDir: [0.3, 0, -1],
  glowPower: 0.07,
  glowSpread: 4,
  glowHeight: 12,
  moonDir: [0.3, 0.16, -1],
  moonSize: 0.024,
  moonIntensity: 1.25,
  stars: 1.0,
  streaks: 0.5,
  streakColor: '#0f1429',
  streakLit: '#55596a',
};

export const NIGHT_RIDGES: RidgeSpec[] = [
  { z: -1800, width: 6000, bottom: -400, top: 200, base: 22, amp: 55, freq: 0.0026, seed: 1.3, color: '#1c1f36', rim: '#3a3c56', mist: '#262840', mistAmount: 0.55 },
  { z: -1100, width: 4200, bottom: -400, top: 160, base: 2, amp: 46, freq: 0.0038, seed: 2.7, color: '#121428', rim: '#30334e', mist: '#1c1e36', mistAmount: 0.6, lamps: 0.012 },
  { z: -650, width: 2800, bottom: -300, top: 110, base: -16, amp: 34, freq: 0.0058, seed: 4.1, color: '#0a0c1c', rim: '#36385a', mist: '#15172c', mistAmount: 0.6, lamps: 0.025, fortX: 200, fortScale: 1.45 },
  { z: -380, width: 1800, bottom: -300, top: 80, base: -36, amp: 26, freq: 0.009, seed: 6.6, color: '#05060e', rim: '#20223a', mist: '#0d0f20', mistAmount: 0.45, lamps: 0.015 },
];

export const NightWorld: React.FC<{
  t: number;
  camZ: number;
  clouds: CloudSpec[];
  dust: DustSpec;
  sky?: SkySpec;
  ridges?: RidgeSpec[];
  cloudFade?: [number, number];
}> = ({ t, camZ, clouds, dust, sky = NIGHT_SKY, ridges = NIGHT_RIDGES, cloudFade }) => (
  <>
    <Sky spec={sky} time={t} />
    {ridges.map((r, i) => (
      <Ridge key={i} spec={r} time={t} />
    ))}
    {clouds.map((c, i) => (
      <Cloud key={i} spec={c} time={t} camZ={camZ} fadeNear={cloudFade?.[0]} fadeFar={cloudFade?.[1]} />
    ))}
    <GoldDust spec={dust} time={t} />
  </>
);
