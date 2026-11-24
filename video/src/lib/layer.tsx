import React, { createContext, useContext } from 'react';

/**
 * Render layers: 'plate' = the 3D/WebGL picture only (expensive, rendered once per aspect),
 * 'overlay' = HTML text and logo only, on a transparent background (cheap), 'all' = both.
 * scripts/build.mjs composites plate + overlay with ffmpeg and muxes the audio mix.
 */
export type Layer = 'all' | 'plate' | 'overlay';
const Ctx = createContext<Layer>('all');
export const LayerProvider: React.FC<{ layer: Layer; children: React.ReactNode }> = ({ layer, children }) => (
  <Ctx.Provider value={layer}>{children}</Ctx.Provider>
);
export const useLayer = () => useContext(Ctx);
export const usePlate = () => useContext(Ctx) !== 'overlay';
export const useOverlay = () => useContext(Ctx) !== 'plate';
export const useBg = (c = '#0B1020') => (useContext(Ctx) === 'overlay' ? 'transparent' : c);
