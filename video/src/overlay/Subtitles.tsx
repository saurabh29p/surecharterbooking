import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import captions from '../data/captions.json';
import { SANS } from '../lib/fonts';
import { ramp, smooth } from '../lib/timing';

/** Burnt-in subtitles from src/data/captions.json (timed from the voiceover by scripts/vo_timings.py). */
export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const portrait = height > width;
  const c = captions.find((x) => t >= x.start - 0.12 && t <= x.end + 0.12);
  if (!c) return null;
  const a = smooth(ramp(t, c.start - 0.12, c.start + 0.08)) * (1 - smooth(ramp(t, c.end - 0.05, c.end + 0.12)));
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, ...(portrait ? { top: t > 27 ? '76%' : '70%' } : { bottom: '7.5%' }), display: 'flex', justifyContent: 'center', opacity: a }}>
      <div style={{
        maxWidth: portrait ? '84%' : '70%', textAlign: 'center', textWrap: 'balance', fontFamily: SANS, fontWeight: 600,
        fontSize: portrait ? 54 : 44, lineHeight: 1.28, color: '#F3EDE2', letterSpacing: '0.005em',
        padding: portrait ? '16px 30px 18px' : '10px 26px 12px', borderRadius: 14,
        background: 'rgba(8,11,24,0.55)', boxShadow: '0 0 40px 10px rgba(8,11,24,0.35)',
        textShadow: '0 1px 2px rgba(0,0,0,0.6)', transform: `translateY(${(1 - a) * 6}px)`,
      }}>
        {c.text}
      </div>
    </div>
  );
};
