import React from 'react';
import { AbsoluteFill, Img, Sequence, staticFile } from 'remotion';
import './lib/fonts';
import { Headline, parse } from './overlay/Headline';
import { S2Jet } from './scenes/S2Jet';

/** 1280x720 thumbnail: golden-hour lift-off, the opening line, the horizontal logo file. */
export const Thumbnail: React.FC<{ frame?: number }> = ({ frame = 114 }) => (
  <AbsoluteFill style={{ background: '#0B1020' }}>
    {/* a negative `from` shows the scene at that frame */}
    <Sequence from={-frame} layout="none">
      <S2Jet variant={{ headlines: false, subtitles: false, portrait: false }} />
    </Sequence>
    <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(6,9,20,0.85) 0%, rgba(6,9,20,0.55) 36%, rgba(6,9,20,0) 60%)' }} />
    <Img src={staticFile('logo/vaanika-horizontal-colour-transparent-for-dark-bg.svg')} style={{ position: 'absolute', left: 60, top: 48, height: 70 }} />
    <Sequence from={-150} layout="none">
      <Headline lines={[parse('Some arrivals are'), parse('*remembered forever.*')]} inAt={0} outAt={100} size={74} bottom="12%" left={64} />
    </Sequence>
  </AbsoluteFill>
);
