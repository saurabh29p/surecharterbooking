import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import './lib/fonts';
import { Layer, LayerProvider } from './lib/layer';
import { easeInOutCubic, lerp, TL } from './lib/timing';
import { TimeShift } from './lib/Stage';
import { Subtitles } from './overlay/Subtitles';
import { S1Lake } from './scenes/v2/S1Lake';
import { S2Jet } from './scenes/v2/S2Jet';
import { S3Heli } from './scenes/v2/S3Heli';
import { S4Cards } from './scenes/v2/S4Cards';
import { S5Contrail } from './scenes/v2/S5Contrail';
import { S6Logo } from './scenes/v2/S6Logo';

export type Variant = {
  /** Scene headlines (off in subtitled cuts, where captions carry the words). */
  headlines: boolean;
  subtitles: boolean;
  portrait: boolean;
  layer?: Layer;
};

const S = TL.scenes;

/** Light wipes: the next scene is revealed behind a slanted gold edge crossing the frame on the beat. */
export const WIPE = 0.25; // half-length, s
const TILT = 0.12;
const wipeEdge = (e: number) => {
  const E = lerp(-TILT, 1 + TILT, easeInOutCubic(Math.min(1, Math.max(0, e))));
  return { top: E + TILT, bottom: E - TILT };
};
const WIPE_CUTS = [S.jet[0], S.heli[0], S.cards[0], S.contrail[0]];

const WipeClip: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = frame / fps / (2 * WIPE);
  if (e >= 1) return <>{children}</>;
  const { top, bottom } = wipeEdge(e);
  return <AbsoluteFill style={{ clipPath: `polygon(0% 0%, ${top * 100}% 0%, ${bottom * 100}% 100%, 0% 100%)` }}>{children}</AbsoluteFill>;
};

/** The gold edge of each wipe: a narrow, soft band (never a full-frame flash). Overlay layer. */
const WipeStreaks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const cut = WIPE_CUTS.find((c) => t > c - WIPE && t < c + WIPE);
  if (cut === undefined) return null;
  const e = (t - (cut - WIPE)) / (2 * WIPE);
  const { top, bottom } = wipeEdge(e);
  const a = Math.sin(Math.PI * e) ** 0.6;
  const band = (w: number) => `${top * width - w},0 ${top * width + w},0 ${bottom * width + w},${height} ${bottom * width - w},${height}`;
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <filter id="ws-soft" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation={width * 0.018} /></filter>
        <filter id="ws-core" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation={width * 0.0025} /></filter>
      </defs>
      <polygon points={band(width * 0.03)} fill="#D9BC78" opacity={0.45 * a} filter="url(#ws-soft)" style={{ mixBlendMode: 'screen' }} />
      <polygon points={band(width * 0.004)} fill="#FFF1D2" opacity={0.85 * a} filter="url(#ws-core)" style={{ mixBlendMode: 'screen' }} />
    </svg>
  );
};

/** A scene placed on the timeline at any render frame rate (plates render at 90 fps for motion blur). */
const Scene: React.FC<{ range: number[]; name: string; children: React.ReactNode; wipeIn?: boolean; wipeOut?: boolean }> = ({ range, name, children, wipeIn, wipeOut }) => {
  const { fps } = useVideoConfig();
  const from = Math.round((range[0] - (wipeIn ? WIPE : 0)) * fps);
  const to = Math.round((range[1] + (wipeOut ? WIPE : 0)) * fps);
  return (
    <Sequence from={from} durationInFrames={to - from} name={name}>
      <TimeShift.Provider value={wipeIn ? WIPE : 0}>
        {wipeIn ? <WipeClip>{children}</WipeClip> : children}
      </TimeShift.Provider>
    </Sequence>
  );
};

export const Film: React.FC<{ variant: Variant; only?: string }> = ({ variant }) => (
  <LayerProvider layer={variant.layer ?? 'all'}>
    <AbsoluteFill style={{ background: variant.layer === 'overlay' ? 'transparent' : '#0B1020' }}>
      <Scene range={S.night} name="1 Lake palace" wipeOut><S1Lake variant={variant} /></Scene>
      <Scene range={S.jet} name="2 Jet" wipeIn wipeOut><S2Jet variant={variant} /></Scene>
      <Scene range={S.heli} name="3 Helicopter" wipeIn wipeOut><S3Heli variant={variant} /></Scene>
      <Scene range={S.cards} name="4 Cards" wipeIn wipeOut><S4Cards variant={variant} /></Scene>
      <Scene range={S.contrail} name="5 Contrail" wipeIn><S5Contrail variant={variant} /></Scene>
      <Scene range={S.logo} name="6 Logo"><S6Logo variant={variant} /></Scene>
      {variant.layer !== 'plate' && <WipeStreaks />}
      {variant.subtitles && variant.layer !== 'plate' && <Subtitles />}
    </AbsoluteFill>
  </LayerProvider>
);
