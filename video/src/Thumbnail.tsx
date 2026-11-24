import React from 'react';
import { AbsoluteFill, Freeze, Img, staticFile } from 'remotion';
import './lib/fonts';
import { Headline, parse } from './overlay/Headline';
import { S2Jet } from './scenes/S2Jet';

/** 1280x720 thumbnail: golden-hour lift-off, the opening line, the horizontal logo file. */
export const Thumbnail: React.FC<{ frame?: number }> = ({ frame = 108 }) => (
  <AbsoluteFill style={{ background: '#0B1020' }}>
    <Freeze frame={frame}>
      <S2Jet variant={{ headlines: false, subtitles: false, portrait: false }} />
    </Freeze>
    <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(6,9,20,0.82) 0%, rgba(6,9,20,0.5) 38%, rgba(6,9,20,0) 62%)' }} />
    <Img src={staticFile('logo/vaanika-horizontal-colour-transparent-for-dark-bg.svg')} style={{ position: 'absolute', left: 64, top: 52, height: 64 }} />
    <Freeze frame={200}>
      <Headline lines={[parse('Some arrivals are'), parse('*remembered forever.*')]} inAt={0} outAt={100} size={78} bottom="13%" left={66} />
    </Freeze>
  </AbsoluteFill>
);
