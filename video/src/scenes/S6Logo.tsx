import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { useBg, useOverlay, usePlate } from '../lib/layer';
import { Cam, Stage } from '../lib/Stage';
import { easeInOutCubic, easeOutCubic, FPS, lerp, ramp, smooth, TL } from '../lib/timing';
import { Backdrop } from '../models/Backdrop';
import { GoldDust } from '../models/GoldDust';
import { ElState, LogoMark3D, MarkName, useMark } from '../models/LogoMark3D';
import { Sparkle } from '../models/Sparkle';
import { EndCard, endCardLayout } from '../overlay/EndCard';
import type { Variant } from '../Film';

const T0 = TL.scenes.logo[0];
const E = TL.events;
const at = (s: number) => s - T0;
const CAM_D = 40, FOV = 30;

const easeOutBack = (x: number) => { const c1 = 1.3, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export const S6Logo: React.FC<{ variant: Variant }> = () => {
  const frame = useCurrentFrame();
  const bg = useBg(); const plate = usePlate(); const overlay = useOverlay();
  const { width, height } = useVideoConfig();
  const tau = frame / FPS;
  const built = plate ? useMark() : null;
  const portrait = height > width;

  // petal choreography on the bells
  const petal = (start: number, side: number): ElState => {
    const k = ramp(tau, start, start + 1.0);
    const e = easeOutBack(k), f = easeOutCubic(k);
    return {
      pos: [0, (1 - f) * -6, (1 - f) * -10],
      rot: [(1 - f) * -1.25, 0, side * (1 - e) * 0.6],
      scale: [lerp(0.35, 1, e), lerp(0.35, 1, e), 1],
      opacity: smooth(ramp(tau, start, start + 0.35)),
    };
  };
  const cK = ramp(tau, at(E.crescent), at(E.crescent) + 0.75);
  const cE = easeOutCubic(cK);
  const aK = easeInOutCubic(ramp(tau, at(E.arc), at(E.arc) + 0.6));
  const states: Record<MarkName, ElState> = {
    saraswati: petal(at(E.petalIvory), -1),
    lakshmi: petal(at(E.petalGold), 0),
    kali: petal(at(E.petalBlue), 1),
    chandra: { pos: [0, (1 - cE) * 34, 0], rot: [0, (1 - cE) * Math.PI * 2, 0], scale: [lerp(0.5, 1, cE), lerp(0.5, 1, cE), 1], opacity: smooth(ramp(tau, at(E.crescent), at(E.crescent) + 0.3)) },
    base: { pos: [0, 0, 0], rot: [0, 0, 0], scale: [Math.max(aK, 0.001), 1, 1], opacity: smooth(ramp(tau, at(E.arc), at(E.arc) + 0.2)) },
  };

  // placement: large and centred during the bloom, then it settles exactly where the stacked logo sits
  const L = endCardLayout(width, height);
  const endCx = L.left + L.s * 450, endCy = L.top + L.s * 213.061;
  const endUnitPx = 1.53061 * L.s;
  const move = easeInOutCubic(ramp(tau, at(E.markMove), at(E.markMove) + 0.9));
  const cx = lerp(width / 2, endCx, move);
  const cy = lerp(height * (portrait ? 0.45 : 0.47), endCy, move);
  const unitPx = lerp(endUnitPx * (portrait ? 1.45 : 1.7), endUnitPx, move);
  const wpp = (2 * CAM_D * Math.tan((FOV * Math.PI) / 360)) / height;
  const settle = 1 - easeInOutCubic(ramp(tau, 0, at(E.markMove) + 0.8));
  const light = 1 - smooth(ramp(tau, at(E.markMove) + 0.3, at(E.markMove) + 1.0));
  const sheen = lerp(-60, 330, ramp(tau, at(E.arc) - 0.2, at(E.arc) + 1.0));
  const crossfade = smooth(ramp(tau, at(E.markMove) + 1.25, at(E.markMove) + 1.7));
  // sparkle on the crescent as it lands
  const spK = ramp(tau, at(E.crescent) + 0.35, at(E.crescent) + 1.15);
  const spark = spK > 0 && spK < 1 ? Math.sin(spK * Math.PI) ** 2 * 6 : 0;
  const crescentWorld: [number, number, number] = [(cx - width / 2) * wpp, -(cy + (17 - 100) * unitPx - height / 2) * wpp, 2];
  const fadeIn = 0;
  return (
    <AbsoluteFill style={{ background: bg }}>
      {plate && <Stage post={{ bloomStrength: 0.7, bloomThreshold: 1.0, exposure: 1, grain: 0.016, vignette: 0.35, toneMap: 0, ca: 0, flash: fadeIn * 0.35 }}>
        <Cam pos={[0, 0, CAM_D]} target={[0, 0, 0]} fov={FOV} rawFov />
        <Backdrop z={-30} size={[120, 70]} time={tau} center="#1a2048" edge="#090c18" rays={0.05 * smooth(ramp(tau, 0.2, 1.5)) * (1 - 0.7 * move)} raysCenter={[cx / width, 1 - cy / height]} />
        <GoldDust spec={{ count: 900, min: [-28, -16, -20], size: [56, 32, 40], particleSize: 0.05, focus: 40, aperture: 1.4, intensity: 0.9, rise: 0.35, wind: [0.1, 0, 0], seed: 21 }} time={tau + 40} />
        {built && (
          <group position={[(cx - width / 2) * wpp, -(cy - height / 2) * wpp, 0]} scale={[unitPx * wpp, unitPx * wpp, unitPx * wpp]}
            rotation={[0.18 * settle, 0.62 * settle + Math.sin(tau * 0.9) * 0.02 * settle, 0]}>
            <LogoMark3D built={built} states={states} light={light} sheen={sheen} sheenAmt={0.55 * (1 - light * 0) * smooth(ramp(tau, at(E.arc) - 0.3, at(E.arc))) * (1 - smooth(ramp(tau, at(E.arc) + 0.8, at(E.arc) + 1.1)))} />
          </group>
        )}
        <group visible={built != null}>
          <Sparkle position={crescentWorld} size={unitPx * wpp * 70} intensity={spark} rotation={tau * 0.4} />
        </group>
      </Stage>}
      {overlay && <AbsoluteFill>
        <EndCard markOpacity={crossfade} wordAt={at(E.wordmark)} tagAt={at(E.privateAviation)} flyAt={at(E.flyVaanika)} urlAt={at(E.url)} />
      </AbsoluteFill>}
    </AbsoluteFill>
  );
};
