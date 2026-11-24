import React, { useMemo } from 'react';
import * as THREE from 'three';
import { NOISE } from '../lib/glsl';

export type SkySpec = {
  zenith: string;
  mid: string;
  horizon: string;
  ground?: string;
  glowColor?: string;
  glowDir?: [number, number, number];
  glowPower?: number;
  glowSpread?: number;
  glowHeight?: number;
  moonDir?: [number, number, number] | null;
  moonSize?: number;
  moonIntensity?: number;
  stars?: number;
  streaks?: number;
  streakColor?: string;
  streakLit?: string;
};

export const Sky: React.FC<{ spec: SkySpec; time: number; radius?: number }> = ({ spec, time, radius = 4000 }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uZen: { value: new THREE.Color() },
          uMid: { value: new THREE.Color() },
          uHor: { value: new THREE.Color() },
          uGround: { value: new THREE.Color() },
          uGlow: { value: new THREE.Color() },
          uGlowDir: { value: new THREE.Vector3() },
          uGlowSpread: { value: 6 },
          uGlowHeight: { value: 14 },
          uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
          uMoonOn: { value: 0 },
          uMoonSize: { value: 0.02 },
          uMoonI: { value: 6 },
          uStars: { value: 1 },
          uStreaks: { value: 0 },
          uStreakCol: { value: new THREE.Color() },
          uStreakLit: { value: new THREE.Color() },
        },
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
        fragmentShader: /* glsl */ `
          ${NOISE}
          uniform float uTime, uGlowSpread, uGlowHeight, uMoonOn, uMoonSize, uMoonI, uStars, uStreaks;
          uniform vec3 uZen, uMid, uHor, uGround, uGlow, uGlowDir, uMoonDir, uStreakCol, uStreakLit;
          varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir); float h = d.y;
            vec3 col = mix(uHor, uMid, smoothstep(-0.01, 0.16, h));
            col = mix(col, uZen, smoothstep(0.10, 0.75, h));
            col = mix(col, uGround, smoothstep(0.0, -0.06, h));
            vec3 gd = normalize(vec3(uGlowDir.x, 0., uGlowDir.z));
            float az = max(dot(normalize(vec3(d.x, 0., d.z)), gd), 0.);
            col += uGlow * pow(az, uGlowSpread) * exp(-max(h, 0.) * uGlowHeight);
            // long horizontal cloud streaks, under-lit by the glow
            if (uStreaks > 0.) {
              vec2 sp = vec2(atan(d.x, -d.z) * 2.2, h * 26.);
              float s = fbm(sp * vec2(1.4, .55) + vec2(uTime * .01, 0.));
              s = smoothstep(.52, .8, s) * smoothstep(.0, .06, h) * smoothstep(.42, .1, h);
              vec3 sc = mix(uStreakCol, uStreakLit, pow(az, 2.) * smoothstep(.3, .02, h));
              col = mix(col, sc, s * uStreaks);
            }
            // stars
            if (uStars > 0.) {
              vec3 sd = d * 260.; vec3 cell = floor(sd); vec3 rnd = hash33(cell);
              vec3 c = cell + .2 + .6 * rnd; float dist = length(sd - c);
              float on = step(.86, hash13(cell + 7.1));
              float tw = .65 + .35 * sin(uTime * (1.5 + rnd.y * 3.) + rnd.z * 40.);
              float b = on * smoothstep(.16 + rnd.x * .12, 0., dist) * tw * (.4 + 1.6 * pow(rnd.y, 4.));
              vec3 sc = mix(vec3(.75, .82, 1.), vec3(1., .86, .62), rnd.z);
              col += sc * b * uStars * smoothstep(.02, .25, h);
            }
            // crescent moon, horns up like the logo's chandra
            if (uMoonOn > 0.) {
              vec3 md = normalize(uMoonDir);
              vec3 rt = normalize(cross(md, vec3(0., 1., 0.))); vec3 up = cross(rt, md);
              float fw = dot(d, md);
              vec2 p = vec2(dot(d, rt), dot(d, up)) / uMoonSize;
              float e = 2.5 / (uMoonSize * 1800.);
              float disc = smoothstep(1. + e, 1. - e, length(p));
              float cut = smoothstep(.92 - e, .92 + e, length(p - vec2(0., .42)));
              float cres = disc * cut * step(0., fw);
              vec3 mc = vec3(1.0, .74, .40);
              col = mix(col, mc * uMoonI, cres);
              col += mc * disc * (1. - cut) * .012; // earthshine
              float g = max(fw, 0.);
              col += mc * (pow(g, 4000.) * .35 + pow(g, 700.) * .08 + pow(g, 90.) * .012) * uMoonOn;
            }
            gl_FragColor = vec4(col, 1.);
          }`,
      }),
    [],
  );
  const u = mat.uniforms;
  u.uTime.value = time;
  (u.uZen.value as THREE.Color).set(spec.zenith);
  (u.uMid.value as THREE.Color).set(spec.mid);
  (u.uHor.value as THREE.Color).set(spec.horizon);
  (u.uGround.value as THREE.Color).set(spec.ground ?? spec.horizon);
  (u.uGlow.value as THREE.Color).set(spec.glowColor ?? '#000000').multiplyScalar(spec.glowPower ?? 1);
  (u.uGlowDir.value as THREE.Vector3).set(...(spec.glowDir ?? [0, 0, -1]));
  u.uGlowSpread.value = spec.glowSpread ?? 6;
  u.uGlowHeight.value = spec.glowHeight ?? 14;
  u.uMoonOn.value = spec.moonDir ? 1 : 0;
  if (spec.moonDir) (u.uMoonDir.value as THREE.Vector3).set(...spec.moonDir);
  u.uMoonSize.value = spec.moonSize ?? 0.022;
  u.uMoonI.value = spec.moonIntensity ?? 5;
  u.uStars.value = spec.stars ?? 1;
  u.uStreaks.value = spec.streaks ?? 0;
  (u.uStreakCol.value as THREE.Color).set(spec.streakColor ?? '#1a2040');
  (u.uStreakLit.value as THREE.Color).set(spec.streakLit ?? '#d9a060');
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[radius, 64, 32]} />
    </mesh>
  );
};
