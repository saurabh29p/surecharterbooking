import React, { useMemo } from 'react';
import * as THREE from 'three';
import { NOISE } from '../lib/glsl';

/** A crisp crescent moon (horns up, like the logo's chandra) billboarded far away, with soft maria and earthshine. */
export const Moon: React.FC<{ dir: THREE.Vector3; angle: number; intensity?: number; distance?: number }> = ({ dir, angle, intensity = 4, distance = 4500 }) => {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uI: { value: 4 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv * 2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `${NOISE} uniform float uI; varying vec2 vUv;
      void main(){
        vec2 p = vUv * vec2(1., -1.) * 1.6; float r = length(p);   // plane faces the origin upside down: flip so the horns point up
        float aa = .02;
        float disc = smoothstep(1. + aa, 1. - aa, r);
        float cut = smoothstep(.93 - aa, .93 + aa, length(p - vec2(0., .48)));
        float maria = .78 + .22 * fbm(p * 2.3 + 4.);
        vec3 c = vec3(1., .93, .8) * maria;
        vec3 col = c * disc * cut * uI + c * disc * (1. - cut) * .02 * uI;
        // the glow hugs the lit crescent only (a halo round the whole disc reads as an eclipse)
        float lit = smoothstep(.9, 1.35, length(p - vec2(0., .48)));
        float halo = exp(-max(r - 1., 0.) * 4.) * .06 * uI * (1. - disc) * smoothstep(1.58, 1.15, r) * lit;
        gl_FragColor = vec4(col + vec3(.8, .85, 1.) * halo, 1.);
      }`,
  }), []);
  mat.uniforms.uI.value = intensity;
  const p = dir.clone().normalize().multiplyScalar(distance);
  const size = Math.tan(angle) * distance * 2 * 1.6;
  return (
    <mesh position={p} material={mat} renderOrder={-9} onUpdate={(m) => m.lookAt(0, 0, 0)}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
};
