import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import './lib/fonts';
import { Layer, LayerProvider } from './lib/layer';
import { TL } from './lib/timing';
import { Subtitles } from './overlay/Subtitles';
import { S1Lake } from './scenes/v2/S1Lake';
import { S2Jet } from './scenes/v2/S2Jet';

export type Variant = {
  /** Scene headlines (off in subtitled cuts, where captions carry the words). */
  headlines: boolean;
  subtitles: boolean;
  portrait: boolean;
  layer?: Layer;
};

const S = TL.scenes;

/** A scene placed on the timeline at any render frame rate (plates render at 90 fps for motion blur). */
const Scene: React.FC<{ range: number[]; name: string; children: React.ReactNode }> = ({ range, name, children }) => {
  const { fps } = useVideoConfig();
  const from = Math.round(range[0] * fps);
  return (
    <Sequence from={from} durationInFrames={Math.round(range[1] * fps) - from} name={name}>
      {children}
    </Sequence>
  );
};

export const Film: React.FC<{ variant: Variant; only?: string }> = ({ variant }) => (
  <LayerProvider layer={variant.layer ?? 'all'}>
    <AbsoluteFill style={{ background: variant.layer === 'overlay' ? 'transparent' : '#0B1020' }}>
      <Scene range={S.night} name="1 Lake palace"><S1Lake variant={variant} /></Scene>
      <Scene range={S.jet} name="2 Jet"><S2Jet variant={variant} /></Scene>
      {variant.subtitles && variant.layer !== 'plate' && <Subtitles />}
    </AbsoluteFill>
  </LayerProvider>
);
