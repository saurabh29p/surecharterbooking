import React, { useMemo } from 'react';
import * as THREE from 'three';
import { LightPoints } from './LightPoints';

/** Moonlit Aravalli-style hills around a lake: displaced terrain, flat lake basin, a few village lights. */
const fbm = (x: number, z: number, seed: number) => {
  const h = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (x: number, z: number) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
  };
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 6; i++) { s += a * vn(x * f, z * f); a *= 0.5; f *= 2.03; }
  return s;
};

export const Hills3D: React.FC<{ lake: (x: number, z: number) => number; size?: number; seg?: number; height?: number; seed?: number; lights?: number; color?: string }> = ({
  lake, size = 5000, seg = 240, height = 110, seed = 2, lights = 160, color = '#1b2236',
}) => {
  const { geo, lp, lc } = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    const base = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const m = lake(x, z); // 0 in the lake, 1 on land
      const n = fbm(x / 420, z / 420, seed);
      const ridge = 1 - Math.abs(fbm(x / 230 + 3, z / 230, seed + 1) * 2 - 1);
      const hgt = m > 0 ? -4 + m * (height * (0.3 + 0.9 * n) + ridge * ridge * height * 0.5) : -6;
      p.setY(i, hgt);
      const v = 0.75 + 0.5 * fbm(x / 40, z / 40, seed + 3);
      colors.set([base.r * v, base.g * v, base.b * v], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    let s = seed * 101;
    const r = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
    const pts: number[] = [], cols: number[] = [];
    for (let i = 0; i < lights * 6 && pts.length < lights * 3; i++) {
      const x = (r() - 0.5) * size * 0.5, z = (r() - 0.5) * size * 0.5;
      const m = lake(x, z);
      if (m > 0.05 && m < 0.6) {
        const n = fbm(x / 420, z / 420, seed);
        pts.push(x, -4 + m * height * (0.3 + 0.9 * n) + 3, z);
        cols.push(1, 0.66 + r() * 0.15, 0.32);
      }
    }
    return { geo: g, lp: new Float32Array(pts), lc: new Float32Array(cols) };
  }, [size, seg, height, seed, lights, color]);
  return (
    <>
      <mesh geometry={geo}>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0} envMapIntensity={0.6} />
      </mesh>
      <LightPoints positions={lp} colors={lc} size={0.9} intensity={1.0} minPx={1.0} />
    </>
  );
};
