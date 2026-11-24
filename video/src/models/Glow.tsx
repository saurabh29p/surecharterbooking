import React, { useMemo } from 'react';
import * as THREE from 'three';

let tex: THREE.Texture | null = null;
const glowTexture = () => {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.08, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.03)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  // faint horizontal anamorphic streak
  const s = g.createLinearGradient(0, 0, 256, 0);
  s.addColorStop(0, 'rgba(255,255,255,0)');
  s.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  s.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = s;
  g.fillRect(0, 126, 256, 4);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  return tex;
};

/** A camera-facing light glow (sprite), additive and HDR. Size in world units. */
export const Glow: React.FC<{ position: [number, number, number]; color: string; intensity?: number; size?: number }> = ({
  position, color, intensity = 1, size = 1,
}) => {
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    [],
  );
  mat.color.set(color).multiplyScalar(intensity);
  if (intensity <= 0.001) return null;
  return <sprite material={mat} position={position} scale={[size, size, 1]} renderOrder={8} />;
};
