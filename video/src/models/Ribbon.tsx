import React, { useMemo } from 'react';
import * as THREE from 'three';
import { NOISE } from '../lib/glsl';

/**
 * A glowing, camera-facing ribbon through a list of points (oldest first): contrails and light
 * sweeps. Width and brightness are given per point; the shader adds a hot core, soft falloff and
 * a slow turbulent breakup toward the old end.
 */
export const Ribbon: React.FC<{
  points: THREE.Vector3[];
  width: (s: number) => number;
  alpha: (s: number) => number;
  color?: string;
  core?: string;
  intensity?: number;
  time?: number;
  maxPoints?: number;
}> = ({ points, width, alpha, color = '#e2b867', core = '#fff1cf', intensity = 1, time = 0, maxPoints = 400 }) => {
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const n = maxPoints;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geo.setAttribute('aTan', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3)); // side, width, alpha
    geo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(n * 2), 1));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color() }, uCore: { value: new THREE.Color() }, uI: { value: 1 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aTan; attribute vec3 aSide; attribute float aS; varying float vV; varying float vS; varying float vA; varying float vW;
        void main(){
          vec3 wp = (modelMatrix * vec4(position, 1.)).xyz;
          vec3 view = normalize(cameraPosition - wp);
          vec3 t = normalize((modelMatrix * vec4(aTan, 0.)).xyz);
          vec3 side = normalize(cross(t, view));
          wp += side * aSide.x * aSide.y;
          vV = aSide.x; vS = aS; vW = aSide.y;
          // seen end-on a camera-facing ribbon fans out into a wedge: fade those parts
          vA = aSide.z * smoothstep(.985, .9, abs(dot(t, view)));
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
        }`,
      fragmentShader: /* glsl */ `
        ${NOISE}
        uniform vec3 uCol, uCore; uniform float uI, uTime; varying float vV; varying float vS; varying float vA; varying float vW;
        void main(){
          float v = vV;
          float turb = fbm4(vec2(vS * 18. - uTime * .4, v * 2.5 + uTime * .2));
          float breakup = mix(1., smoothstep(.2, .7, turb), smoothstep(.6, .0, vS) * .8);
          float soft = exp(-v * v * 4.5);
          float coreM = exp(-v * v * 60.) * smoothstep(.15, 1., vS);
          vec3 c = uCol * soft * breakup + uCore * coreM * 2.;
          float a = vA * uI;
          gl_FragColor = vec4(c * a, 1.);
        }`,
    });
    return { geo, mat };
  }, [maxPoints]);
  const n = Math.min(points.length, maxPoints);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const tan = geo.attributes.aTan as THREE.BufferAttribute;
  const sd = geo.attributes.aSide as THREE.BufferAttribute;
  const sa = geo.attributes.aS as THREE.BufferAttribute;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a);
    if (t.lengthSq() < 1e-10) t.set(1, 0, 0);
    const s = n > 1 ? i / (n - 1) : 1;
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      pos.setXYZ(j, p.x, p.y, p.z);
      tan.setXYZ(j, t.x, t.y, t.z);
      sd.setXYZ(j, k === 0 ? -1 : 1, width(s), alpha(s));
      sa.setX(j, s);
    }
  }
  geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  pos.needsUpdate = tan.needsUpdate = sd.needsUpdate = sa.needsUpdate = true;
  mat.uniforms.uCol.value.set(color);
  mat.uniforms.uCore.value.set(core);
  mat.uniforms.uI.value = intensity;
  mat.uniforms.uTime.value = time;
  if (n < 2) return null;
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={7} />;
};
