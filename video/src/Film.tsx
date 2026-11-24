import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import './lib/fonts';
import { Layer, LayerProvider } from './lib/layer';
import { sec, TL } from './lib/timing';
import { S1Night } from './scenes/S1Night';
import { S2Jet } from './scenes/S2Jet';
import { S3Heli } from './scenes/S3Heli';
import { S4Cards } from './scenes/S4Cards';
import { S6Logo } from './scenes/S6Logo';
import { Subtitles } from './overlay/Subtitles';

export type Variant = {
  /** Scene headlines (off in subtitled cuts, where captions carry the words). */
  headlines: boolean;
  subtitles: boolean;
  portrait: boolean;
  layer?: Layer;
};

const S = TL.scenes;

export const Film: React.FC<{ variant: Variant; only?: string }> = ({ variant }) => (
  <LayerProvider layer={variant.layer ?? 'all'}>
  <AbsoluteFill style={{ background: variant.layer === 'overlay' ? 'transparent' : '#0B1020' }}>
    <Sequence from={sec(S.night[0])} durationInFrames={sec(S.night[1] - S.night[0])} name="1 Night">
      <S1Night variant={variant} />
    </Sequence>
    <Sequence from={sec(S.jet[0])} durationInFrames={sec(S.jet[1] - S.jet[0])} name="2 Jet">
      <S2Jet variant={variant} />
    </Sequence>
    <Sequence from={sec(S.heli[0])} durationInFrames={sec(S.heli[1] - S.heli[0])} name="3 Helicopter">
      <S3Heli variant={variant} />
    </Sequence>
    <Sequence from={sec(S.cards[0])} durationInFrames={sec(S.contrail[1] - S.cards[0])} name="4-5 Cards + contrail">
      <S4Cards variant={variant} />
    </Sequence>
    <Sequence from={sec(S.logo[0])} durationInFrames={sec(S.logo[1] - S.logo[0])} name="6 Logo">
      <S6Logo variant={variant} />
    </Sequence>
    {variant.subtitles && variant.layer !== 'plate' && <Subtitles />}
  </AbsoluteFill>
  </LayerProvider>
);
