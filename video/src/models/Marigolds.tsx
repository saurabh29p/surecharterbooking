import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Marigold petals as small, curved 3D petals (instanced) that fall, sway and tumble. They go through the
 * film's depth-of-field pass, so petals near the lens blur and those at the subject stay sharp.
 * A rotor-wash term pushes them outward from `center`; `visible(p)` lets a shot keep them off its subject.
 */
export type PetalLayer = { count: number; box: [number, number, number, number, number, number]; size: number; fall?: number };

const petalGeo = () => {
  const g = new THREE.PlaneGeometry(1, 0.55, 6, 3);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    // tapered teardrop outline with a cupped cross-section and a slight curl along its length
    const w = Math.sin(Math.PI * (x + 0.5)) ** 0.6 * (1 - 0.35 * (x + 0.5));
    p.setXYZ(i, x, y * w * 1.6, -0.22 * (y * 2) ** 2 + 0.12 * x * x);
  }
  g.computeVertexNormals();
  return g;
};

export const Marigolds: React.FC<{
  layers: PetalLayer[];
  time: number;
  /** Rotor-wash integral (s) — displacement grows with it — and the wash centre on the ground. */
  washInt?: number;
  center?: [number, number, number];
  visible?: (p: THREE.Vector3) => number;
  seed?: number;
}> = ({ layers, time, washInt = 0, center = [0, 0, 0], visible, seed = 3 }) => {
  const total = layers.reduce((a, l) => a + l.count, 0);
  const { mesh, rnd } = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff', roughness: 0.55, metalness: 0, side: THREE.DoubleSide, vertexColors: false,
      emissive: new THREE.Color('#7a2c00'), emissiveIntensity: 0.35, envMapIntensity: 0.8,
    });
    const mesh = new THREE.InstancedMesh(petalGeo(), mat, total);
    mesh.frustumCulled = false;
    let s = seed * 7919 + 1;
    const r = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
    const rnd = Array.from({ length: total }, () => [r(), r(), r(), r(), r(), r(), r(), r()]);
    const cols = ['#f08a0c', '#f5a313', '#e4700a', '#f6b52a', '#d95a08'];
    rnd.forEach((q, i) => mesh.setColorAt(i, new THREE.Color(cols[Math.floor(q[7] * cols.length)])));
    return { mesh, rnd };
  }, [total, seed]);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  let i = 0;
  for (const L of layers) {
    const [x0, x1, y0, y1, z0, z1] = L.box;
    const fall = L.fall ?? 0.55;
    for (let k = 0; k < L.count; k++, i++) {
      const R = rnd[i];
      const h = y1 - y0;
      const yy = y1 - (((R[1] * h + time * fall * (0.7 + 0.6 * R[2])) % h) + h) % h;
      v.set(x0 + R[0] * (x1 - x0) + 0.5 * Math.sin(time * (0.6 + R[3]) + R[4] * 6.28), yy, z0 + R[5] * (z1 - z0) + 0.4 * Math.cos(time * (0.5 + R[2]) + R[6] * 6.28));
      if (washInt > 0) {
        const dx = v.x - center[0], dz = v.z - center[2];
        const d = Math.hypot(dx, dz) + 0.5;
        const push = (washInt * 9) / (1 + d * 0.25) * Math.exp(-Math.max(0, v.y - center[1]) / 6);
        v.x += (dx / d) * push; v.z += (dz / d) * push; v.y += push * 0.12;
      }
      const tum = time * (1.5 + 2.5 * R[6]) + washInt * 6;
      e.set(R[3] * 6.28 + tum, R[4] * 6.28 + tum * 0.7, R[5] * 6.28);
      q.setFromEuler(e);
      const vis = visible ? visible(v) : 1;
      sc.setScalar(L.size * (0.7 + 0.6 * R[2]) * vis);
      m.compose(v, q, sc);
      mesh.setMatrixAt(i, m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  return <primitive object={mesh} />;
};
