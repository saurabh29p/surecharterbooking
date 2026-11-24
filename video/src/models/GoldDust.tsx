import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Drifting gold dust as GPU points. Position is a pure function of time (wrapping inside a box,
 * faded near the wrap so nothing pops), with a thin-lens depth of field: out-of-focus motes
 * grow into soft bokeh discs while keeping their energy.
 */
export type DustSpec = {
  count: number;
  min: [number, number, number];
  size: [number, number, number];
  particleSize?: number;
  focus?: number;
  aperture?: number;
  intensity?: number;
  rise?: number;
  wind?: [number, number, number];
  seed?: number;
  /** For seamless loops: drift is scaled so positions repeat exactly after this many seconds. */
  loopPeriod?: number;
};

export const GoldDust: React.FC<{ spec: DustSpec; time: number }> = ({ spec, time }) => {
  const { size } = useThree();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = spec.count;
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 4);
    let s = (spec.seed ?? 1) * 9301 + 49297;
    const r = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = r(); pos[i * 3 + 1] = r(); pos[i * 3 + 2] = r();
      rnd[i * 4] = r(); rnd[i * 4 + 1] = r(); rnd[i * 4 + 2] = r(); rnd[i * 4 + 3] = r();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, [spec.count, spec.seed]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 }, uMin: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector3() },
          uPSize: { value: 0.15 }, uFocal: { value: 1000 }, uFocus: { value: 30 }, uAperture: { value: 0.6 },
          uIntensity: { value: 1 }, uRise: { value: 0.02 }, uWind: { value: new THREE.Vector3() }, uLoop: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 aRnd; uniform float uTime, uPSize, uFocal, uFocus, uAperture, uRise, uLoop; uniform vec3 uMin, uSize, uWind;
          varying float vA; varying vec3 vC; varying float vSoft;
          void main(){
            vec3 p = position;
            float t = uTime;
            vec3 v = vec3(uWind.x, uRise * (.4 + aRnd.x), uWind.z) * (.6 + .8 * aRnd.y);
            if (uLoop > 0.) { v = floor(v * uLoop + .5) / uLoop; }   // whole wraps per loop period
            p += v * t;
            float ph = aRnd.z * 6.2831; float w = .5 + aRnd.w;
            float fx = uLoop > 0. ? 6.2831 / uLoop * floor(1. + aRnd.w * 3.) : w * .35;
            float fz = uLoop > 0. ? 6.2831 / uLoop * floor(1. + aRnd.y * 3.) : w * .27;
            p.x += sin(t * fx + ph) * .006; p.z += cos(t * fz + ph) * .006;
            p = fract(p);
            vec3 e = smoothstep(0., .06, p) * smoothstep(1., .94, p);
            float edge = e.x * e.y * e.z;
            vec3 wp = uMin + p * uSize;
            vec4 mv = modelViewMatrix * vec4(wp, 1.);
            float dist = max(-mv.z, .1);
            float px = uPSize * (.35 + 1.3 * pow(aRnd.w, 2.)) * uFocal / dist;
            float coc = uAperture * abs(dist - uFocus) / dist * uFocal * .02;
            float s = clamp(sqrt(px * px + coc * coc), 1.6, 90.);
            gl_PointSize = s;
            float tw = .55 + .45 * sin(t * (1.2 + aRnd.y * 2.6) + aRnd.x * 40.);
            if (uLoop > 0.) tw = .55 + .45 * sin(6.2831 * floor(1. + aRnd.y * 4.) * t / uLoop + aRnd.x * 40.);
            vA = edge * tw * clamp((max(px, 1.6) * max(px, 1.6)) / (s * s) * 2.2, .015, 1.) * step(.1, -mv.z);
            vSoft = clamp(coc / 12., 0., 1.);
            vC = mix(vec3(1., .86, .55), vec3(.85, .6, .28), aRnd.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uIntensity; varying float vA; varying vec3 vC; varying float vSoft;
          void main(){
            vec2 c = gl_PointCoord - .5; float r = length(c) * 2.;
            float core = exp(-r * r * 6.);
            float disc = smoothstep(1., .82, r) * (.75 + .25 * smoothstep(.55, .95, r));
            float a = mix(core, disc * .55, vSoft) * vA * uIntensity;
            if (a < .002) discard;
            gl_FragColor = vec4(vC * a, 1.);
          }`,
      }),
    [],
  );
  const u = mat.uniforms;
  u.uTime.value = time;
  (u.uMin.value as THREE.Vector3).set(...spec.min);
  (u.uSize.value as THREE.Vector3).set(...spec.size);
  u.uPSize.value = spec.particleSize ?? 0.12;
  u.uFocal.value = size.height / 2 / Math.tan(((camera.fov ?? 35) * Math.PI) / 360);
  u.uFocus.value = spec.focus ?? 30;
  u.uAperture.value = spec.aperture ?? 0.6;
  u.uIntensity.value = spec.intensity ?? 1;
  u.uRise.value = (spec.rise ?? 0.6) / spec.size[1];
  (u.uWind.value as THREE.Vector3).set(...(spec.wind ?? [0.3, 0, 0]).map((w, i) => w / spec.size[i]) as [number, number, number]);
  u.uLoop.value = spec.loopPeriod ?? 0;
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
};
