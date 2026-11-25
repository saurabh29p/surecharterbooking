import React from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AbsoluteFill } from 'remotion';
import { Cam, Stage } from './lib/Stage';
import { LakeWorld } from './scenes/v2/S1Lake';

const Inspect: React.FC = () => {
  const scene = useThree((st) => st.scene);
  useFrame(() => {
    scene.traverse((o: any) => {
      if (o.isMesh || o.isPoints) {
        const g = o.geometry; const pos = g.attributes.position; const nrm = g.attributes.normal;
        let nan = 0; if (nrm) for (let i = 0; i < nrm.array.length; i++) if (!Number.isFinite(nrm.array[i])) nan++;
        let pnan = 0; for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) pnan++;
        g.computeBoundingSphere();
        console.error('INSPECT', o.type, o.material?.type, 'vis', o.visible, 'verts', pos.count, 'nanN', nan, 'nanP', pnan, 'sphere', g.boundingSphere ? g.boundingSphere.radius.toFixed(1) : 'none', 'parentVis', o.parent?.visible);
      }
    });
  }, -5);
  return null;
};

export const DebugView: React.FC<{ pos: [number, number, number]; target: [number, number, number]; fov: number }> = ({ pos, target, fov }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Stage post={{ exposure: 1.3 }}>
      <Cam pos={pos} target={target} fov={fov} far={20000} />
      <ambientLight intensity={3} />
      <LakeWorld t={1} />
    </Stage>
  </AbsoluteFill>
);
