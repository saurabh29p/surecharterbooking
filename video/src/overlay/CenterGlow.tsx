import React from 'react';

/**
 * A soft gold glow where the logo blooms: the contrail's light gathers here at the end of the
 * transition and the first petal opens out of it, so no frame between them is empty. A small
 * radial glow (about a fifth of the frame), never a full-frame flash.
 */
export const CenterGlow: React.FC<{ x: number; y: number; opacity: number; size: number }> = ({ x, y, opacity, size }) =>
  opacity <= 0.001 ? null : (
    <div style={{
      position: 'absolute', left: x - size, top: y - size, width: size * 2, height: size * 2, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,228,170,0.85) 0%, rgba(232,196,120,0.42) 14%, rgba(217,170,90,0.14) 38%, rgba(184,146,74,0) 70%)',
      opacity, mixBlendMode: 'screen',
    }} />
  );
