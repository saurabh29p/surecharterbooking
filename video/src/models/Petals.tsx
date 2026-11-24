import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Marigold petals as tumbling, petal-shaped sprites with depth of field. Positions are pure
 * functions of time: a shower falling from above, and a carpet on the lawn that the rotor wash
 * lifts into an expanding, rolling vortex ring around the landing point.
 */
export const Petals: React.FC<{
  count: number;
  time: number;
  /** Rotor-wash strength now (0..1) and its running integral (s), both from the heli height. */
  wash: number;
  washInt: number;
  center: [number, number, number];
  beamPos: [number, number, number];
  beamOn: number;
  focus: number;
  aperture?: number;
  size?: number;
}> = ({ count, time, wash, washInt, center, beamPos, beamOn, focus, aperture = 1, size = 0.06 }) => {
  const { size: vp } = useThree();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const a = new Float32Array(count * 4), b = new Float32Array(count * 4), pos = new Float32Array(count * 3);
    let s = 12345;
    const r = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
    for (let i = 0; i < count; i++) {
      a.set([r(), r(), r(), r()], i * 4);
      b.set([r(), r(), r(), r()], i * 4);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.BufferAttribute(a, 4));
    g.setAttribute('aB', new THREE.BufferAttribute(b, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: {
          uT: { value: 0 }, uWash: { value: 0 }, uWI: { value: 0 }, uC: { value: new THREE.Vector3() }, uBeam: { value: new THREE.Vector3() },
          uBeamOn: { value: 0 }, uFocal: { value: 1000 }, uFocus: { value: 20 }, uAp: { value: 1 }, uSize: { value: 0.06 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 aA; attribute vec4 aB;
          uniform float uT, uWash, uWI, uBeamOn, uFocal, uFocus, uAp, uSize; uniform vec3 uC, uBeam;
          varying vec3 vCol; varying float vAlpha; varying float vRot; varying float vSquash; varying float vSoft;
          void main(){
            float t = uT;
            vec3 p;
            float kind = aA.x; // < .42 shower, else lawn carpet / vortex
            if (kind < .42) {
              float r = sqrt(aA.y) * 34.; float th = aA.z * 6.2831;
              float fall = .55 + aA.w * .7;
              float y = mod(aB.x * 26. - t * fall, 26.);
              p = uC + vec3(cos(th) * r, y, sin(th) * r);
              p.x += sin(t * (1. + aB.y) + aB.z * 9.) * .5; p.z += cos(t * (.8 + aB.y) + aB.w * 9.) * .5;
              // wash pushes the shower outward near the ground
              vec2 d = p.xz - uC.xz; float rr = length(d) + 1e-3;
              float k = uWash * (1. - smoothstep(4., 22., rr)) * (1. - smoothstep(2., 12., y));
              p.xz += d / rr * k * 5. * (1. + aB.y);
              p.y += k * 2.5;
            } else {
              float r0 = 5.5 + pow(aA.y, .7) * 16.; float th0 = aA.z * 6.2831;
              float lift = smoothstep(0., 1., uWash * (1.3 - (r0 - 5.5) / 18.));
              float a = (.8 + 2.6 * aB.x) * lift;                 // vortex tube radius
              float R = r0 + uWI * (1.2 + 1.5 * aB.y) * lift;      // ring expands outward
              float phi = aB.z * 6.2831 + uWI * (2.4 + 2. * aB.w); // rolling
              float th = th0 + uWI * (.12 + .18 * aB.y) * lift;    // swirl
              float rr = R + a * cos(phi);
              p = uC + vec3(cos(th) * rr, .03 + (a * (1. + sin(phi)) + aB.w * 2.5 * lift * lift), sin(th) * rr);
            }
            vec4 mv = modelViewMatrix * vec4(p, 1.);
            float dist = max(-mv.z, .1);
            float px = uSize * (.7 + .6 * aB.y) * uFocal / dist;
            float coc = uAp * abs(dist - uFocus) / dist * uFocal * .012;
            float s = clamp(sqrt(px * px + coc * coc), 1.2, 70.);
            gl_PointSize = s * 1.6;
            vSoft = clamp(coc / max(px, .5) * .5, 0., 1.);
            vAlpha = clamp((px * px) / (s * s) * 1.6, .03, 1.) * step(.2, -mv.z);
            vRot = aA.w * 6.28 + t * (1. + 3. * aB.x) * (kind < .42 ? 1. : .2 + 2. * uWash);
            vSquash = .35 + .65 * abs(cos(t * (1.5 + 3. * aB.z) + aA.y * 20.));
            // marigold palette: saffron to deep orange, a few golden-yellow
            vec3 c = mix(vec3(1., .42, .04), vec3(1., .66, .12), aB.w);
            c = mix(c, vec3(.95, .25, .03), step(.85, aA.y));
            // lighting: warm ambient from the palace, the heli's landing light cone
            vec3 toB = normalize(p - uBeam);
            float inBeam = smoothstep(.86, .97, dot(toB, vec3(0., -1., 0.))) * uBeamOn * 3.5 / (1. + .02 * length(p - uBeam));
            float lamp = .35 + .3 * exp(-p.y * .2);
            vCol = c * (lamp + inBeam) * (.75 + .5 * vSquash);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vCol; varying float vAlpha; varying float vRot; varying float vSquash; varying float vSoft;
          void main(){
            vec2 q = gl_PointCoord - .5;
            float c = cos(vRot), s = sin(vRot);
            q = mat2(c, -s, s, c) * q;
            q.x /= vSquash * .62;
            // petal: teardrop with a soft ruffled tip
            float r = length(q * vec2(1., 1.35) + vec2(0., .12));
            float ruffle = .04 * sin(atan(q.y, q.x) * 7.) * step(0., q.y) * (1. - vSoft);
            float shape = smoothstep(.5, .5 - mix(.06, .45, vSoft), mix(r + ruffle, length(gl_PointCoord - .5) * 1.1, vSoft));
            float a = shape * vAlpha;
            if (a < .01) discard;
            float vein = 1. - .25 * smoothstep(.04, 0., abs(q.x)) * (1. - vSoft);
            gl_FragColor = vec4(vCol * vein, a);
          }`,
      }),
    [],
  );
  const u = mat.uniforms;
  u.uT.value = time; u.uWash.value = wash; u.uWI.value = washInt;
  u.uC.value.set(...center); u.uBeam.value.set(...beamPos); u.uBeamOn.value = beamOn;
  u.uFocal.value = vp.height / 2 / Math.tan(((camera.fov ?? 35) * Math.PI) / 360);
  u.uFocus.value = focus; u.uAp.value = aperture; u.uSize.value = size;
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={9} />;
};
