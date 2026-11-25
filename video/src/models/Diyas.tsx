import React, { useMemo } from 'react';
import * as THREE from 'three';
import { LightPoints } from './LightPoints';

/** Floating clay diyas: instanced bowls with flickering flames, bobbing and drifting on the lake. */
export const Diyas: React.FC<{ count: number; area: [number, number, number, number]; time: number; seed?: number; scale?: number; loop?: number }> = ({
  count, area, time, seed = 3, scale = 1, loop = 0,
}) => {
  const data = useMemo(() => {
    let s = seed * 7919 + 13;
    const r = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
    const pts = Array.from({ length: count }, () => {
      const cl = r() < 0.6;
      const x = area[0] + r() * (area[1] - area[0]);
      const z = area[2] + (cl ? Math.pow(r(), 2.2) : r()) * (area[3] - area[2]);
      return { x, z, ph: r() * 6.28, sp: 0.5 + r() };
    });
    return pts;
  }, [count, seed, area.join()]);
  const { bowl, mat } = useMemo(() => {
    const prof = [[0, 0], [0.09, 0], [0.13, 0.03], [0.14, 0.06], [0.12, 0.065], [0.08, 0.035], [0, 0.035]].map(([x, y]) => new THREE.Vector2(x, y));
    const bowl = new THREE.InstancedMesh(new THREE.LatheGeometry(prof, 14), new THREE.MeshStandardMaterial({ color: '#7a3e1c', roughness: 0.9, emissive: '#ff8a3a', emissiveIntensity: 0.25 }), count);
    return { bowl, mat: bowl.material };
  }, [count]);
  const m = new THREE.Matrix4();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const w = loop > 0 ? (2 * Math.PI) / loop : 0;
  data.forEach((d, i) => {
    const dx = loop > 0 ? Math.sin(w * time + d.ph) * 0.4 : Math.sin(time * 0.12 * d.sp + d.ph) * 0.5 + time * 0.08 * d.sp;
    const bob = Math.sin((loop > 0 ? w * 2 : 1.3 * d.sp) * time + d.ph) * 0.02;
    const x = d.x + dx, z = d.z + (loop > 0 ? 0 : time * 0.03 * d.sp);
    m.compose(new THREE.Vector3(x, bob, z), new THREE.Quaternion(), new THREE.Vector3(scale * 2.2, scale * 2.2, scale * 2.2));
    bowl.setMatrixAt(i, m);
    pos.set([x, 0.16 * scale * 2.2 + bob, z], i * 3);
    const f = 0.85 + 0.15 * Math.sin(time * (7 + d.sp * 5) + d.ph * 3);
    col.set([1.0 * f, 0.62 * f, 0.26 * f], i * 3);
  });
  bowl.instanceMatrix.needsUpdate = true;
  void mat;
  return (
    <>
      <primitive object={bowl} />
      <LightPoints positions={pos} colors={col} size={0.09 * scale * 2.2} intensity={2.2} minPx={1.2} />
    </>
  );
};
