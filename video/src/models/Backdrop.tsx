import React, { useMemo } from 'react';
import * as THREE from 'three';
import { NOISE } from '../lib/glsl';

/** Deep midnight backdrop with a radial glow, an optional jaali lattice and soft light rays. */
export const Backdrop: React.FC<{
  z: number; size: [number, number]; time: number;
  center?: string; edge?: string; jaali?: number; rays?: number; raysCenter?: [number, number]; sweep?: number;
}> = ({ z, size, time, center = '#1a2050', edge = '#0B1020', jaali = 0, rays = 0, raysCenter = [0.5, 0.62], sweep = -1 }) => {
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: { uC: { value: new THREE.Color() }, uE: { value: new THREE.Color() }, uJ: { value: 0 }, uR: { value: 0 }, uRC: { value: new THREE.Vector2() }, uT: { value: 0 }, uA: { value: 1 }, uSw: { value: -1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: /* glsl */ `
        ${NOISE}
        uniform vec3 uC, uE; uniform float uJ, uR, uT, uA, uSw; uniform vec2 uRC; varying vec2 vUv;
        float sq(vec2 p, float r){ return max(abs(p.x), abs(p.y)) - r; }
        void main(){
          vec2 p = (vUv - .5) * vec2(uA, 1.);
          vec2 c = (uRC - .5) * vec2(uA, 1.);
          float r = length(p - c);
          vec3 col = mix(uC, uE, smoothstep(0., .75, r));
          if (uJ > 0.) {
            // jaali: eight-pointed stars in a square lattice, drawn as thin gold lines
            vec2 g = p * 9.; vec2 f = fract(g) - .5;
            float s1 = abs(sq(f, .3)); float s2 = abs(sq(mat2(.7071, -.7071, .7071, .7071) * f, .3));
            float ci = abs(length(f) - .12);
            float ln = min(min(s1, s2), ci);
            float w = fwidth(ln) * 1.2 + .004;
            float line = smoothstep(w, 0., ln);
            float mask = smoothstep(.75, .15, r) * uJ;
            float lit = 1. + 3. * exp(-pow((vUv.x * .9 + vUv.y * .3 - uSw) / .08, 2.));
            col += vec3(.85, .66, .34) * line * mask * .018 * lit;
          }
          if (uR > 0.) {
            vec2 d = p - c; float a = atan(d.y, d.x);
            float rays = fbm4(vec2(a * 6., uT * .08)) * fbm4(vec2(a * 13. + 4., uT * .05 + 2.));
            col += vec3(.95, .76, .42) * pow(rays, 1.6) * uR * smoothstep(.9, .05, length(d)) * smoothstep(0., .08, length(d));
          }
          gl_FragColor = vec4(col, 1.);
        }`,
    }),
    [],
  );
  const u = mat.uniforms;
  (u.uC.value as THREE.Color).set(center);
  (u.uE.value as THREE.Color).set(edge);
  u.uJ.value = jaali; u.uR.value = rays; u.uT.value = time; u.uA.value = size[0] / size[1]; u.uSw.value = sweep;
  (u.uRC.value as THREE.Vector2).set(...raysCenter);
  return (
    <mesh material={mat} position={[0, 0, z]} renderOrder={-20}>
      <planeGeometry args={size} />
    </mesh>
  );
};
