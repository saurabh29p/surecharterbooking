import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';
import { HeroLoop, LOOP, XF } from './HeroLoop';
import { Thumbnail } from './Thumbnail';
import { FPS, sec, TL } from './lib/timing';

const D = sec(TL.duration);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={D} fps={FPS} width={1920} height={1080}
      defaultProps={{ variant: { headlines: true, subtitles: false, portrait: false } }} />
    <Composition id="FilmSubtitled" component={Film} durationInFrames={D} fps={FPS} width={1920} height={1080}
      defaultProps={{ variant: { headlines: false, subtitles: true, portrait: false } }} />
    <Composition id="Reels" component={Film} durationInFrames={D} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: { headlines: false, subtitles: true, portrait: true } }} />
    <Composition id="FilmPlate" component={Film} durationInFrames={D} fps={FPS} width={1920} height={1080}
      defaultProps={{ variant: { headlines: false, subtitles: false, portrait: false, layer: 'plate' } }} />
    <Composition id="ReelsPlate" component={Film} durationInFrames={D} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: { headlines: false, subtitles: false, portrait: true, layer: 'plate' } }} />
    <Composition id="FilmOverlay" component={Film} durationInFrames={D} fps={FPS} width={1920} height={1080}
      defaultProps={{ variant: { headlines: true, subtitles: false, portrait: false, layer: 'overlay' } }} />
    <Composition id="FilmSubOverlay" component={Film} durationInFrames={D} fps={FPS} width={1920} height={1080}
      defaultProps={{ variant: { headlines: false, subtitles: true, portrait: false, layer: 'overlay' } }} />
    <Composition id="ReelsOverlay" component={Film} durationInFrames={D} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: { headlines: false, subtitles: true, portrait: true, layer: 'overlay' } }} />
    <Composition id="HeroLoop" component={HeroLoop} durationInFrames={(LOOP + XF) * FPS} fps={FPS} width={1920} height={1080} />
    <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={FPS} width={1280} height={720} />
  </>
);
