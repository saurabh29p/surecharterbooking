import React, { useMemo } from 'react';
import * as THREE from 'three';

/** A four-point star flare with a soft halo (HDR, additive), billboarded. */
export const Sparkle: React.FC<{ position: [number, number, number]; size: number; intensity: number; rotation?: number }> = ({ position, size, intensity, rotation = 0 }) => {
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uI: { value: 1 }, uR: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv - .5; vec4 mv = modelViewMatrix * vec4(0., 0., 0., 1.); mv.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uI, uR; varying vec2 vUv;
        void main(){ float c = cos(uR), s = sin(uR); vec2 p = mat2(c, -s, s, c) * vUv * 2.;
          float r = length(p);
          float star = exp(-abs(p.x) * 60.) * exp(-abs(p.y) * 2.2) + exp(-abs(p.y) * 60.) * exp(-abs(p.x) * 2.2);
          vec2 q = mat2(.7071, -.7071, .7071, .7071) * p;
          star += .35 * (exp(-abs(q.x) * 90.) * exp(-abs(q.y) * 5.) + exp(-abs(q.y) * 90.) * exp(-abs(q.x) * 5.));
          float halo = exp(-r * r * 30.) * 1.4 + exp(-r * 6.) * .15;
          vec3 col = vec3(1., .9, .68) * (star + halo) * uI;
          gl_FragColor = vec4(col, 1.); }`,
    }),
    [],
  );
  mat.uniforms.uI.value = intensity;
  mat.uniforms.uR.value = rotation;
  if (intensity <= 0.001) return null;
  return <mesh material={mat} position={position} scale={[size, size, 1]} renderOrder={20}><planeGeometry args={[1, 1]} /></mesh>;
};
