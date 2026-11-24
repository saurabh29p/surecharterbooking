import React, { useMemo } from 'react';
import * as THREE from 'three';
import { NOISE } from '../lib/glsl';

/**
 * A soft billowy cloud on a camera-facing plane: domain-warped fbm density, self-shadowing
 * toward a light direction, bright thin edges (silver/gold lining), fading as the camera
 * approaches so flying through it never pops.
 */
export type CloudSpec = {
  pos: [number, number, number];
  size: [number, number];
  seed: number;
  opacity?: number;
  lit?: string;
  shadow?: string;
  rim?: string;
  light?: [number, number];
  coverage?: number;
  scale?: number;
  drift?: number;
  /** Clearing in the sheet, in plane UV units: [centreU, centreV, radius]. */
  hole?: [number, number, number];
};

export const Cloud: React.FC<{ spec: CloudSpec; time: number; camZ: number; fadeNear?: number; fadeFar?: number }> = ({
  spec,
  time,
  camZ,
  fadeNear = 4,
  fadeFar = 26,
}) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 }, uSeed: { value: 0 }, uOpacity: { value: 1 }, uAspect: { value: 1 },
          uLit: { value: new THREE.Color() }, uShadow: { value: new THREE.Color() }, uRim: { value: new THREE.Color() },
          uLight: { value: new THREE.Vector2(0.5, 0.5) }, uHole: { value: new THREE.Vector3(0.5, 0.5, 0) }, uCover: { value: 0.5 }, uScale: { value: 2.2 }, uDrift: { value: 0.02 },
        },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: /* glsl */ `
          ${NOISE}
          uniform float uTime, uSeed, uOpacity, uAspect, uCover, uScale, uDrift;
          uniform vec3 uLit, uShadow, uRim, uHole; uniform vec2 uLight; varying vec2 vUv;
          float dens(vec2 p){
            vec2 q = vec2(fbm4(p * .7 + vec2(uSeed, 1.7)), fbm4(p * .7 + vec2(5.2, uSeed * 1.3)));
            vec2 pp = p + .75 * q + vec2(uTime * uDrift, 0.);
            return fbm4(pp) * .78 + vnoise(pp * 6.) * .08 + vnoise(pp * .5) * .14;
          }
          void main(){
            vec2 c = (vUv - .5) * vec2(uAspect, 1.);
            vec2 p = c * uScale + vec2(uSeed * 13.1, uSeed * 7.7);
            float n = dens(p);
            float mask = 1. - smoothstep(.18, .5, length(c / vec2(uAspect, 1.) * vec2(1., 1.25)));
            if (uHole.z > 0.) mask = (1. - smoothstep(.3, .5, abs(vUv.x - .5))) * (1. - smoothstep(.25, .5, abs(vUv.y - .5)));
            if (uHole.z > 0.) {
              float hd = length((vUv - uHole.xy) * vec2(uAspect, 1.)) / uHole.z;
              mask *= smoothstep(.75, 1.35, hd + (n - .5) * .9);
            }
            float d = smoothstep(1. - uCover, 1. - uCover + .38, n * (.55 + .6 * mask)) * mask;
            d = d * d * (3. - 2. * d);
            if (d < .003) discard;
            float n2 = dens(p + uLight * .22);
            float lit = clamp(.45 + (n - n2) * 2.6, 0., 1.);
            vec3 col = mix(uShadow, uLit, lit * lit);
            col += uRim * pow(1. - d, 3.) * smoothstep(.02, .25, d) * lit * .9;
            gl_FragColor = vec4(col, d * uOpacity);
          }`,
      }),
    [],
  );
  const u = mat.uniforms;
  const dist = spec.pos[2] - camZ;
  // dist is negative when the cloud is in front of a camera looking down -z
  const ahead = -dist;
  const fade = ahead <= 0 ? 0 : Math.min(1, Math.max(0, (ahead - fadeNear) / (fadeFar - fadeNear)));
  u.uTime.value = time;
  u.uSeed.value = spec.seed;
  u.uOpacity.value = (spec.opacity ?? 1) * (fade * fade * (3 - 2 * fade));
  u.uAspect.value = spec.size[0] / spec.size[1];
  (u.uLit.value as THREE.Color).set(spec.lit ?? '#6f7aa8');
  (u.uShadow.value as THREE.Color).set(spec.shadow ?? '#141a36');
  (u.uRim.value as THREE.Color).set(spec.rim ?? '#c9a35a');
  (u.uLight.value as THREE.Vector2).set(...(spec.light ?? [0.6, 0.5]));
  u.uCover.value = spec.coverage ?? 0.5;
  u.uScale.value = spec.scale ?? 2.2;
  u.uDrift.value = spec.drift ?? 0.02;
  (u.uHole.value as THREE.Vector3).set(...(spec.hole ?? [0.5, 0.5, 0]));
  if (u.uOpacity.value <= 0.001) return null;
  return (
    <mesh material={mat} position={spec.pos}>
      <planeGeometry args={spec.size} />
    </mesh>
  );
};
