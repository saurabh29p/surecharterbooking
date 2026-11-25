import React from 'react';
import { AbsoluteFill, Img, Sequence, staticFile } from 'remotion';
import './lib/fonts';
import { Headline, parse } from './overlay/Headline';
import { LayerProvider } from './lib/layer';
import { S3Heli } from './scenes/v2/S3Heli';

/** 1280x720 thumbnail: the helicopter settling at the palace, the opening line, the horizontal logo file. */
export const Thumbnail: React.FC<{ frame?: number }> = ({ frame = 128 }) => (
  <AbsoluteFill style={{ background: '#0B1020' }}>
    <LayerProvider layer="plate">
      {/* a negative `from` shows the scene at that frame */}
      {/* shifted right so the headline on the left stays clear of the helicopter */}
      <AbsoluteFill style={{ transform: 'translateX(250px) scale(1.12)', transformOrigin: '100% 50%' }}>
        <Sequence from={-frame} layout="none">
          <S3Heli variant={{ headlines: false, subtitles: false, portrait: false }} />
        </Sequence>
      </AbsoluteFill>
    </LayerProvider>
    <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(6,9,20,0.88) 0%, rgba(6,9,20,0.6) 34%, rgba(6,9,20,0) 58%)' }} />
    <Img src={staticFile('logo/vaanika-horizontal-colour-transparent-for-dark-bg.svg')} style={{ position: 'absolute', left: 60, top: 48, height: 70 }} />
    <Sequence from={-150} layout="none">
      <Headline lines={[parse('Some arrivals are'), parse('*remembered forever.*')]} inAt={0} outAt={100} size={68} bottom="12%" left={64} />
    </Sequence>
  </AbsoluteFill>
);
