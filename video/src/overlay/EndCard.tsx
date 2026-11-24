import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import logo from '../data/logo.json';
import { SANS, SERIF } from '../lib/fonts';
import { easeOutCubic, ramp, smooth } from '../lib/timing';

/** Where the stacked logo (900 x 640 viewBox) sits on the end card, per frame shape. */
export const endCardLayout = (w: number, h: number) =>
  h > w ? { s: 1.0, left: (w - 900) / 2, top: 470 } : { s: 0.9, left: (w - 900 * 0.9) / 2, top: 104 };

const defsInner = logo.stacked.defs.replace(/^<defs>|<\/defs>$/g, '');

/**
 * End card: the stacked logo file drawn verbatim (mark, wordmark, PRIVATE AVIATION), then
 * "Fly Vaanika." and flyvaanika.com. Times are seconds relative to the logo sequence.
 */
export const EndCard: React.FC<{ markOpacity: number; wordAt: number; tagAt: number; flyAt: number; urlAt: number }> = ({
  markOpacity, wordAt, tagAt, flyAt, urlAt,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const L = endCardLayout(width, height);
  const portrait = height > width;
  const tag = easeOutCubic(ramp(t, tagAt, tagAt + 1.1));
  const rule = easeOutCubic(ramp(t, tagAt + 0.25, tagAt + 1.6));
  const fly = easeOutCubic(ramp(t, flyAt, flyAt + 1.0));
  const url = easeOutCubic(ramp(t, urlAt, urlAt + 1.0));
  const below = L.top + 640 * L.s;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg viewBox={logo.stacked.viewBox} style={{ position: 'absolute', left: L.left, top: L.top, width: 900 * L.s, height: 640 * L.s, overflow: 'visible' }}>
        <defs dangerouslySetInnerHTML={{ __html: defsInner }} />
        <g opacity={markOpacity} dangerouslySetInnerHTML={{ __html: logo.stacked.markGroup }} />
        {logo.stacked.wordmark.map((p: Record<string, string>, i: number) => {
          const k = easeOutCubic(ramp(t, wordAt + i * 0.085, wordAt + i * 0.085 + 0.8));
          return (
            <path key={i} d={p.d} fill={p.fill}
              style={{ opacity: k, transform: `translateY(${(1 - k) * 18}px)`, filter: `blur(${(1 - k) * 5}px)` }} />
          );
        })}
        <g opacity={tag} style={{ transform: `translateY(${(1 - tag) * 8}px)` }} dangerouslySetInnerHTML={{ __html: logo.stacked.tagline }} />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: below + (portrait ? 40 : 18), display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: (portrait ? 520 : 460) * rule, height: 1.5, opacity: 0.85 * rule, background: 'linear-gradient(90deg, rgba(184,146,74,0), #F4E3B5 50%, rgba(184,146,74,0))' }} />
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: below + (portrait ? 92 : 52), textAlign: 'center',
        fontFamily: SERIF, fontStyle: 'italic', fontWeight: 500, fontSize: portrait ? 84 : 66, lineHeight: 1.1,
        fontVariationSettings: '"opsz" 72', opacity: fly, transform: `translateY(${(1 - fly) * 16}px)`, filter: `blur(${(1 - fly) * 6}px)`,
      }}>
        <span style={{
          backgroundImage: 'linear-gradient(100deg, #F4E3B5 0%, #D9BC78 40%, #B8924A 75%, #8C6A2F 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', padding: '0 0.1em',
        }}>Fly Vaanika.</span>
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: below + (portrait ? 212 : 148), textAlign: 'center',
        fontFamily: SANS, fontWeight: 600, fontSize: portrait ? 34 : 26, letterSpacing: '0.36em', color: '#F3EDE2',
        opacity: url * 0.95, transform: `translateY(${(1 - url) * 10}px)`, paddingLeft: '0.36em',
      }}>
        FLYVAANIKA.COM
      </div>
    </div>
  );
};
