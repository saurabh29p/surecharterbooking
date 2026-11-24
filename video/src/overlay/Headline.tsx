import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SERIF } from '../lib/fonts';
import { easeOutCubic, ramp, smooth } from '../lib/timing';

/** A word or phrase; `gold` renders it as the brand's gold italic accent. */
export type Word = { text: string; gold?: boolean };
export type HeadlineLine = Word[];

const GOLD_TEXT: React.CSSProperties = {
  fontStyle: 'italic',
  backgroundImage:
    'linear-gradient(100deg, #F4E3B5 0%, #D9BC78 30%, #F4E3B5 46%, #B8924A 70%, #8C6A2F 100%)',
  backgroundSize: '220% 100%',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  paddingRight: '0.08em',
};

/**
 * Cinematic headline: a gold hairline draws in, then each word rises out of a soft blur, staggered.
 * Gold accent words carry a slow shimmer. Times are in seconds, relative to the sequence.
 */
export const Headline: React.FC<{
  lines: HeadlineLine[];
  inAt: number;
  outAt: number;
  align?: 'left' | 'center';
  size?: number;
  bottom?: number | string;
  left?: number | string;
  maxWidth?: number | string;
}> = ({ lines, inAt, outAt, align = 'left', size = 78, bottom = '15%', left = '7.5%', maxWidth = '70%' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const out = smooth(ramp(t, outAt - 0.55, outAt));
  if (t < inAt - 0.2 || t > outAt + 0.05) return null;
  let k = 0;
  const rule = easeOutCubic(ramp(t, inAt - 0.15, inAt + 0.6));
  return (
    <>
    {align === 'left' && (
      <div style={{ position: 'absolute', inset: 0, opacity: (1 - out) * easeOutCubic(ramp(t, inAt - 0.2, inAt + 0.8)) * 0.85,
        background: 'radial-gradient(ellipse 55% 45% at 22% 80%, rgba(6,9,20,0.72) 0%, rgba(6,9,20,0.35) 45%, rgba(6,9,20,0) 75%)' }} />
    )}
    <div
      style={{
        position: 'absolute',
        left: align === 'center' ? 0 : left,
        right: align === 'center' ? 0 : undefined,
        bottom,
        maxWidth: align === 'center' ? undefined : maxWidth,
        textAlign: align,
        fontFamily: SERIF,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1.08,
        letterSpacing: '-0.012em',
        color: '#F3EDE2',
        fontVariationSettings: '"opsz" 72',
        textShadow: '0 2px 30px rgba(5,7,15,0.55)',
        opacity: 1 - out,
        filter: `blur(${out * 10}px)`,
        transform: `translateY(${-out * 10}px)`,
      }}
    >
      <div
        style={{
          width: 88 * rule,
          height: 1.5,
          margin: align === 'center' ? '0 auto 30px' : '0 0 30px 2px',
          background: 'linear-gradient(90deg, #F4E3B5, #B8924A)',
          opacity: 0.9 * rule,
        }}
      />
      {lines.map((line, li) => (
        <div key={li} style={{ whiteSpace: 'nowrap' }}>
          {line.map((w, wi) => {
            const start = inAt + 0.09 * k++;
            const p = easeOutCubic(ramp(t, start, start + 0.9));
            const shimmer = ((t - inAt) * 18) % 220;
            return (
              <span
                key={wi}
                style={{
                  display: 'inline-block',
                  marginRight: '0.24em',
                  opacity: p,
                  filter: `blur(${(1 - p) * 12}px)`,
                  transform: `translateY(${(1 - p) * 26}px)`,
                  ...(w.gold ? { ...GOLD_TEXT, backgroundPosition: `${110 - shimmer}% 0` } : {}),
                }}
              >
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

/** Parses "Some arrivals are *remembered forever.*" (asterisks = gold italic) into words. */
export const parse = (s: string): HeadlineLine => {
  const out: Word[] = [];
  let gold = false;
  for (const part of s.split(/(\*)/)) {
    if (part === '*') { gold = !gold; continue; }
    for (const w of part.split(' ').filter(Boolean)) out.push({ text: w, gold });
  }
  return out;
};
