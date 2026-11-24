import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import * as THREE from 'three';

/** Many small lights as perspective-sized glowing points (runway lights, diyas, fairy lights). */
export const LightPoints: React.FC<{
  positions: Float32Array;
  colors: Float32Array;
  size: number;
  intensity?: number;
  time?: number;
  flicker?: number;
  minPx?: number;
}> = ({ positions, colors, size, intensity = 1, time = 0, flicker = 0, minPx = 1.5 }) => {
  const { size: vp } = useThree();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const r = new Float32Array(positions.length / 3).map((_, i) => ((i * 7919) % 1000) / 1000);
    g.setAttribute('aR', new THREE.BufferAttribute(r, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, [positions, colors]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
        uniforms: { uSize: { value: 1 }, uFocal: { value: 1000 }, uI: { value: 1 }, uTime: { value: 0 }, uFlicker: { value: 0 }, uMin: { value: 1.5 } },
        vertexShader: /* glsl */ `
          attribute float aR; uniform float uSize, uFocal, uI, uTime, uFlicker, uMin; varying vec3 vC; varying float vA;
          void main(){
            vec4 mv = modelViewMatrix * vec4(position, 1.);
            float d = max(-mv.z, .1);
            float px = uSize * uFocal / d;
            float s = max(px, uMin) * 6.;
            gl_PointSize = min(s, 160.);
            float f = 1. - uFlicker * (.5 + .5 * sin(uTime * (9. + aR * 7.) + aR * 60.)) * (.5 + .5 * sin(uTime * 3.1 + aR * 13.));
            vA = uI * f * clamp(px / uMin, .25, 1.);
            vC = color;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vC; varying float vA;
          void main(){
            float r = length(gl_PointCoord - .5) * 2.;
            float core = exp(-r * r * 60.) * 3.;
            float halo = exp(-r * r * 7.) * .35;
            float a = (core + halo) * vA;
            if (a < .003) discard;
            gl_FragColor = vec4(vC * a, 1.);
          }`,
      }),
    [],
  );
  mat.uniforms.uSize.value = size;
  mat.uniforms.uFocal.value = vp.height / 2 / Math.tan(((camera.fov ?? 35) * Math.PI) / 360);
  mat.uniforms.uI.value = intensity;
  mat.uniforms.uTime.value = time;
  mat.uniforms.uFlicker.value = flicker;
  mat.uniforms.uMin.value = minPx;
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />;
};
