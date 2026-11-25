import React from 'react';
import { useVideoConfig } from 'remotion';
import { useTime } from '../lib/Stage';
import { SERIF } from '../lib/fonts';
import { easeOutCubic, ramp, smooth } from '../lib/timing';
import type { HeadlineLine } from './Headline';

const GOLD: React.CSSProperties = {
  fontStyle: 'italic',
  backgroundImage: 'linear-gradient(100deg, #F4E3B5 0%, #D9BC78 30%, #F4E3B5 46%, #B8924A 70%, #D9BC78 100%)',
  backgroundSize: '220% 100%',
  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', padding: '0 0.08em',
};

/**
 * v2 headline: centred on the lower third over a soft dark gradient, large enough to read at 360 px
 * wide. Words rise out of a soft blur; gold italic accents shimmer slowly.
 */
export const Title: React.FC<{ lines: HeadlineLine[]; inAt: number; outAt: number; size?: number }> = ({ lines, inAt, outAt, size }) => {
  const t = useTime();
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const fs = size ?? (portrait ? 92 : 96);
  if (t < inAt - 0.3 || t > outAt + 0.05) return null;
  const out = smooth(ramp(t, outAt - 0.5, outAt));
  const band = easeOutCubic(ramp(t, inAt - 0.3, inAt + 0.6)) * (1 - out);
  let k = 0;
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: portrait ? '46%' : '52%', opacity: band,
        background: 'linear-gradient(to top, rgba(5,8,18,0.82) 0%, rgba(5,8,18,0.55) 38%, rgba(5,8,18,0) 100%)' }} />
      <div style={{
        position: 'absolute', left: '5%', right: '5%', bottom: portrait ? '17%' : '10.5%', textAlign: 'center',
        fontFamily: SERIF, fontWeight: 500, fontSize: fs, lineHeight: 1.08, letterSpacing: '-0.01em', color: '#F3EDE2',
        fontVariationSettings: '"opsz" 60', textShadow: '0 2px 24px rgba(4,6,14,0.7)',
        opacity: 1 - out, filter: `blur(${out * 8}px)`, transform: `translateY(${-out * 8}px)`,
      }}>
        {lines.map((line, li) => (
          <div key={li} style={{ whiteSpace: 'nowrap' }}>
            {line.map((w, wi) => {
              const st = inAt + 0.08 * k++;
              const p = easeOutCubic(ramp(t, st, st + 0.85));
              const sh = ((t - inAt) * 16) % 220;
              return (
                <span key={wi} style={{ display: 'inline-block', marginRight: '0.24em', opacity: p, filter: `blur(${(1 - p) * 10}px)`,
                  transform: `translateY(${(1 - p) * 22}px)`, ...(w.gold ? { ...GOLD, backgroundPosition: `${110 - sh}% 0` } : {}) }}>
                  {w.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
};
