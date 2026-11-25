import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';
import { HeroLoop, LOOP, XF } from './HeroLoop';
import { Thumbnail } from './Thumbnail';
import { FPS, TL } from './lib/timing';

/** Plates (the WebGL picture) render at 90 fps; scripts/build.sh blends each 3 frames into one
 * 30 fps frame (a 240-degree shutter) for real motion blur. Overlays and previews run at 30 fps. */
export const PLATE_FPS = 90;
const D = Math.round(TL.duration * FPS);
const DP = Math.round(TL.duration * PLATE_FPS);
const v = (headlines: boolean, subtitles: boolean, portrait: boolean, layer?: 'plate' | 'overlay') => ({ variant: { headlines, subtitles, portrait, layer } });

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={D} fps={FPS} width={1920} height={1080} defaultProps={v(true, false, false)} />
    <Composition id="FilmSubtitled" component={Film} durationInFrames={D} fps={FPS} width={1920} height={1080} defaultProps={v(false, true, false)} />
    <Composition id="Reels" component={Film} durationInFrames={D} fps={FPS} width={1080} height={1920} defaultProps={v(false, true, true)} />
    <Composition id="FilmPlate" component={Film} durationInFrames={DP} fps={PLATE_FPS} width={1920} height={1080} defaultProps={v(false, false, false, 'plate')} />
    <Composition id="ReelsPlate" component={Film} durationInFrames={DP} fps={PLATE_FPS} width={1080} height={1920} defaultProps={v(false, false, true, 'plate')} />
    <Composition id="FilmOverlay" component={Film} durationInFrames={D} fps={FPS} width={1920} height={1080} defaultProps={v(true, false, false, 'overlay')} />
    <Composition id="FilmSubOverlay" component={Film} durationInFrames={D} fps={FPS} width={1920} height={1080} defaultProps={v(false, true, false, 'overlay')} />
    <Composition id="ReelsOverlay" component={Film} durationInFrames={D} fps={FPS} width={1080} height={1920} defaultProps={v(false, true, true, 'overlay')} />
    <Composition id="HeroLoop" component={HeroLoop} durationInFrames={(LOOP + XF) * FPS} fps={FPS} width={1920} height={1080} />
    <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={FPS} width={1280} height={720} />
  </>
);
