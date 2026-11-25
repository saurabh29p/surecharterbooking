import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { SANS, SERIF } from '../../lib/fonts';
import { useBg, useOverlay, usePlate } from '../../lib/layer';
import { Cam, Stage, useIsPortrait, useTime } from '../../lib/Stage';
import { easeOutCubic, lerp, ramp, smooth, TL } from '../../lib/timing';
import { Backdrop } from '../../models/Backdrop';
import { GoldDust } from '../../models/GoldDust';
import type { Variant } from '../../Film';

const T0 = TL.scenes.cards[0];
const IN = TL.events.cardsIn.map((t) => t - T0);
const LIT = TL.events.cards.map((t) => t - T0);
const END = TL.scenes.cards[1] - T0;

type Icon = 'shield' | 'doc' | 'receipt' | 'chat';
export const CARDS: { icon: Icon; title: string; body: string }[] = [
  { icon: 'shield', title: 'Licensed operators only', body: 'Every flight by a DGCA-approved NSOP operator' },
  { icon: 'doc', title: 'Checked before we quote', body: 'Permit, aircraft papers, insurance' },
  { icon: 'receipt', title: 'One all-in price', body: 'Written quote and GST invoice' },
  { icon: 'chat', title: 'One coordinator', body: 'On WhatsApp until you land' },
];

const ICONS: Record<Icon, string> = {
  shield: 'M50 6 C66 16 80 18 90 18 C90 62 74 84 50 96 C26 84 10 62 10 18 C20 18 34 16 50 6 Z M32 50 L45 63 L69 37',
  doc: 'M22 6 L62 6 L80 24 L80 94 L22 94 Z M62 6 L62 24 L80 24 M34 40 L66 40 M36 66 L46 76 L66 56',
  receipt: 'M20 6 L80 6 L80 94 L75 86 L70 94 L65 86 L60 94 L55 86 L50 94 L45 86 L40 94 L35 86 L30 94 L25 86 L20 94 Z M34 30 L66 30 M34 48 L66 48 M34 66 L54 66',
  chat: 'M50 10 C76 10 92 28 92 48 C92 70 74 86 50 86 C42 86 34 84 28 81 L10 92 L16 74 C11 66 8 57 8 48 C8 28 24 10 50 10 Z M34 48 L34.5 48 M50 48 L50.5 48 M66 48 L66.5 48',
};

const GoldIcon: React.FC<{ kind: Icon; size: number; glow: number }> = ({ kind, size, glow }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible', filter: `drop-shadow(0 0 ${6 + 10 * glow}px rgba(244,227,181,${0.15 + 0.45 * glow}))` }}>
    <defs>
      <linearGradient id={`ig-${kind}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#F4E3B5" /><stop offset="0.45" stopColor="#D9BC78" /><stop offset="1" stopColor="#B8924A" />
      </linearGradient>
    </defs>
    <path d={ICONS[kind]} fill="none" stroke={`url(#ig-${kind})`} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Solid dark-glass card. The glare sweep is masked to the border ring, so it never crosses the text. */
const Card: React.FC<{ i: number; t: number; w: number; h: number; portrait: boolean }> = ({ i, t, w, h, portrait }) => {
  const c = CARDS[i];
  const arrive = easeOutCubic(ramp(t, IN[i], IN[i] + 0.7));
  const op = smooth(ramp(t, IN[i], IN[i] + 0.35));
  const lit = smooth(ramp(t, LIT[i] - 0.1, LIT[i] + 0.35)) * (i < 3 ? 1 - 0.75 * smooth(ramp(t, LIT[i + 1] - 0.1, LIT[i + 1] + 0.4)) : 1);
  const sweep = lerp(-25, 125, ramp(t, LIT[i] - 0.05, LIT[i] + 1.1));
  const exit = 0;
  const title = portrait ? 60 : 56, body = portrait ? 33 : 30, pad = portrait ? 40 : 36, icon = portrait ? 70 : 64;
  return (
    <div style={{
      position: 'relative', width: w, height: h, borderRadius: 22, boxSizing: 'border-box', padding: pad,
      background: 'linear-gradient(175deg, rgba(24,31,64,0.96) 0%, rgba(14,19,40,0.97) 55%, rgba(10,14,31,0.97) 100%)',
      border: `1.5px solid rgba(217,188,120,${0.32 + 0.5 * lit})`,
      boxShadow: `0 28px 70px rgba(0,0,0,0.55), 0 0 ${50 * lit}px rgba(217,188,120,${0.28 * lit}), inset 0 1px 0 rgba(244,227,181,${0.12 + 0.25 * lit})`,
      opacity: op * (1 - exit),
      transform: `translateY(${(1 - arrive) * 46 - 10 * exit}px) scale(${(1 + 0.03 * lit) * (1 - 0.04 * exit)})`,
      filter: `blur(${(1 - arrive) * 8 + exit * 6}px)`,
      display: 'flex', flexDirection: 'column', gap: portrait ? 22 : 20,
    }}>
      {/* glare: a light band that runs only around the border ring */}
      <div style={{
        position: 'absolute', inset: -1.5, borderRadius: 22, padding: 2.5, pointerEvents: 'none',
        background: `linear-gradient(115deg, rgba(255,240,205,0) ${sweep - 14}%, rgba(255,244,215,0.95) ${sweep}%, rgba(255,240,205,0) ${sweep + 14}%)`,
        WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude',
        opacity: lit > 0.05 ? 1 : 0,
      }} />
      <div style={{ position: 'absolute', left: pad, right: pad, top: 0, height: 2, background: `linear-gradient(90deg, rgba(217,188,120,0), rgba(244,227,181,${0.9 * lit}), rgba(217,188,120,0))` }} />
      <GoldIcon kind={c.icon} size={icon} glow={lit} />
      <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: title, lineHeight: 1.06, color: '#F6F1E7', letterSpacing: '-0.005em', fontVariationSettings: '"opsz" 72' }}>{c.title}</div>
      <div style={{ width: 54, height: 2, background: 'linear-gradient(90deg, #D9BC78, rgba(184,146,74,0))', opacity: 0.85 }} />
      <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: body, lineHeight: 1.36, color: '#E9E2D4' }}>{c.body}</div>
    </div>
  );
};

export const S4Cards: React.FC<{ variant: Variant }> = () => {
  const t = useTime();
  const bg = useBg(); const plate = usePlate(); const overlay = useOverlay();
  const portrait = useIsPortrait();
  const { width, height } = useVideoConfig();
  const p = smooth(ramp(t, -0.5, END + 0.5));
  const w = portrait ? 474 : 408, h = portrait ? 560 : 520, gap = portrait ? 28 : 30;
  return (
    <AbsoluteFill style={{ background: bg }}>
      {plate && (
        <Stage post={{ exposure: 1, bloomStrength: 0.5, vignette: 0.55, time: t }}>
          <Cam pos={[lerp(-0.8, 0.8, p), lerp(0.25, -0.1, p), lerp(15.5, 13.8, p)]} target={[0, 0, 0]} fov={34} />
          <Backdrop z={-14} size={[70, 40]} time={t} center="#121a38" edge="#05070e" jaali={0.22} />
          <GoldDust spec={{ count: 700, min: [-16, -10, -10], size: [32, 20, 26], particleSize: 0.03, focus: 15, aperture: 1.4, intensity: 0.7, rise: 0.25, wind: [0.12, 0, 0], seed: 9 }} time={t + 20} />
        </Stage>
      )}
      {overlay && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            display: 'grid', gap,
            gridTemplateColumns: portrait ? `repeat(2, ${w}px)` : `repeat(4, ${w}px)`,
            transform: `translateY(${portrait ? -200 : -12}px) scale(${width / (portrait ? 1080 : 1920)})`,
          }}>
            {CARDS.map((_, i) => <Card key={i} i={i} t={t} w={w} h={h} portrait={portrait} />)}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
