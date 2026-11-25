import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import { staticFile } from 'remotion';
import { useAsyncAsset } from './asyncAsset';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import assets from '../data/assets.json';
import { NOISE } from './glsl';

/**
 * Real skies from Poly Haven CC0 HDRIs (see scripts/fetch_assets.py):
 * - HdriSky draws the 8k panorama band (decoded back to HDR so the sun/moon bloom) with the 1k HDR
 *   above it, rotated so the sun or moon sits where a shot needs it.
 * - useHdrEnv returns a prefiltered environment map of the same sky for reflections and lighting.
 */
export type SkyName = keyof typeof assets.skies;

const envCache = new Map<string, Promise<THREE.DataTexture>>();
const loadHdr = (name: SkyName) => {
  const path = staticFile(`assets/${assets.skies[name].env}`);
  if (!envCache.has(path)) envCache.set(path, new RGBELoader().loadAsync(path));
  return envCache.get(path)!;
};

/** World direction of the sky's brightest point (sun/moon) after rotating the sky by `rot` radians. */
export const skyBrightDir = (name: SkyName, rot = 0, elevShift = 0) => {
  const s = assets.skies[name];
  const az = (s.brightU - 0.5) * Math.PI * 2 + rot;
  const el = ((s.brightElev + elevShift) * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
};
/** Rotation that puts the sky's bright point at the given world azimuth (radians, atan2(z, x)). */
export const rotForAzimuth = (name: SkyName, az: number) => az - (assets.skies[name].brightU - 0.5) * Math.PI * 2;

/**
 * Optional sky grade shared by the visible sky and its lighting: split-tone by luminance (cool shadows,
 * warm highlights) plus a warm glow around the sun. Luminance thresholds are in the sky's HDR units.
 */
export type SkyGrade = { cool: string; warm: string; lo: number; hi: number; amount: number; glow?: string; glowStrength?: number; glowPower?: number; zenith?: number };
const GRADE_GLSL = /* glsl */ `
  uniform vec3 gCool, gWarm, gGlow, gSun; uniform float gLo, gHi, gAmt, gGlowS, gGlowP, gZen;
  vec3 gradeSky(vec3 c, vec3 d0){
    if (gAmt <= 0. && gGlowS <= 0.) return c;
    vec3 W = vec3(.2126, .7152, .0722);
    float l = dot(c, W);
    vec3 cool = gCool / dot(gCool, W), warm = gWarm / dot(gWarm, W);
    // the whole sun side of the sky turns gold near the horizon (sunset), the far side stays blue;
    // blue -> peach -> gold so the blend never passes through a grey pink
    vec2 sh = normalize(gSun.xz), dh = normalize(d0.xz + 1e-5);
    float horiz = pow(max(dot(sh, dh), 0.), 1.5) * exp(-max(d0.y, 0.) * 1.8);
    float t = clamp(max(smoothstep(gLo, gHi, l), horiz * 1.25), 0., 1.);
    vec3 peach = vec3(1.25, .95, .72);
    vec3 g = l * (t < .5 ? mix(cool, peach, t * 2.) : mix(peach, warm, t * 2. - 1.));
    c = mix(c, g, gAmt);
    float s = max(dot(d0, gSun), 0.);
    c += gGlow * gGlowS * (pow(s, gGlowP) * .6 + pow(s, gGlowP * 8.) + horiz * .12);
    return c * mix(1., gZen, smoothstep(.05, .7, d0.y));
  }`;
const gradeUniforms = () => ({
  gCool: { value: new THREE.Color(1, 1, 1) }, gWarm: { value: new THREE.Color(1, 1, 1) }, gGlow: { value: new THREE.Color(1, 1, 1) },
  gSun: { value: new THREE.Vector3(1, 0, 0) }, gLo: { value: 0 }, gHi: { value: 1 }, gAmt: { value: 0 }, gGlowS: { value: 0 }, gGlowP: { value: 8 }, gZen: { value: 1 },
});
const setGrade = (u: Record<string, THREE.IUniform>, name: SkyName, g?: SkyGrade) => {
  (u.gSun.value as THREE.Vector3).copy(skyBrightDir(name, 0));
  if (!g) { u.gAmt.value = 0; u.gGlowS.value = 0; u.gZen.value = 1; return; }
  (u.gCool.value as THREE.Color).set(g.cool); (u.gWarm.value as THREE.Color).set(g.warm); (u.gGlow.value as THREE.Color).set(g.glow ?? g.warm);
  u.gLo.value = g.lo; u.gHi.value = g.hi; u.gAmt.value = g.amount; u.gGlowS.value = g.glowStrength ?? 0; u.gGlowP.value = g.glowPower ?? 8; u.gZen.value = g.zenith ?? 1;
};

export const useHdrEnv = (name: SkyName, rot = 0, intensity = 1, ground?: string, grade?: SkyGrade) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const tex = useAsyncAsset(`HDRI ${name}`, () => loadHdr(name).then((equi) => {
    equi.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(gl);
    let env: THREE.Texture;
    if (ground || grade) {
      // pure-sky HDRIs have sky below the horizon too; reflections need a dark ground there
      const sc = new THREE.Scene();
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { tEqui: { value: equi }, uGround: { value: new THREE.Color(ground ?? '#000') }, uHasGround: { value: ground ? 1 : 0 }, ...gradeUniforms() },
        vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: `uniform sampler2D tEqui; uniform vec3 uGround; uniform float uHasGround; varying vec3 vD;
          ${GRADE_GLSL}
          void main(){ vec3 d = normalize(vD); vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + .5, asin(clamp(d.y, -1., 1.)) / 3.14159265 + .5);
            vec3 c = gradeSky(texture2D(tEqui, uv).rgb, d); c = mix(c, uGround, uHasGround * smoothstep(.0, -.06, d.y)); gl_FragColor = vec4(c, 1.); }`,
      });
      setGrade(mat.uniforms, name, grade);
      sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat));
      env = pm.fromScene(sc, 0).texture;
    } else env = pm.fromEquirectangular(equi).texture;
    pm.dispose();
    return { env, equi };
  }), [name, ground, JSON.stringify(grade ?? null)]);
  if (tex) {
    scene.environment = tex.env;
    scene.environmentRotation.set(0, -rot, 0);
    scene.environmentIntensity = intensity;
  }
  return tex;
};

export const HdriSky: React.FC<{
  name: SkyName;
  rot?: number;
  exposure?: number;
  tint?: string;
  equi: THREE.DataTexture | null;
  /** Extra twinkle on bright points (stars), 0..1. */
  twinkle?: number;
  time?: number;
  ground?: string;
  radius?: number;
  /** Degrees added to elevation (negative lowers the sky, e.g. to bring the moon into frame). */
  elevShift?: number;
  grade?: SkyGrade;
}> = ({ name, rot = 0, exposure = 1, tint = '#ffffff', equi, twinkle = 0, time = 0, ground = '#05070d', radius = 5000, elevShift = 0, grade }) => {
  const s = assets.skies[name];
  const band = useAsyncAsset(`sky ${name}`, () => new THREE.TextureLoader().loadAsync(staticFile(`assets/${s.file}`)).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    return t;
  }), [name]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          tBand: { value: null }, tEqui: { value: null }, uRot: { value: 0 }, uExp: { value: 1 }, uCrop: { value: 1 },
          uElev: { value: new THREE.Vector2() }, uTint: { value: new THREE.Color() }, uTw: { value: 0 }, uT: { value: 0 },
          uGround: { value: new THREE.Color() }, uShift: { value: 0 }, ...gradeUniforms(),
        },
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
        fragmentShader: /* glsl */ `
          ${NOISE}
          uniform sampler2D tBand, tEqui; uniform float uRot, uExp, uCrop, uTw, uT, uShift; uniform vec2 uElev; uniform vec3 uTint, uGround;
          varying vec3 vDir;
          const float PI = 3.14159265;
          ${GRADE_GLSL}
          void main(){
            vec3 d = normalize(vDir);
            float az = atan(d.z, d.x) - uRot;
            float u = fract(az / (2. * PI) + .5);
            float el = degrees(asin(clamp(d.y, -1., 1.))) - uShift;
            float v = (el - uElev.x) / (uElev.y - uElev.x);
            // seamless mip selection across the panorama's wrap (u jumps 1 -> 0 there)
            float u2 = fract(u + .5);
            float dux = abs(dFdx(u)) < abs(dFdx(u2)) ? dFdx(u) : dFdx(u2);
            float duy = abs(dFdy(u)) < abs(dFdy(u2)) ? dFdy(u) : dFdy(u2);
            vec2 bv = vec2(u, 1. - clamp(v, .002, .998));
            vec3 c = textureGrad(tBand, bv, vec2(dux, dFdx(bv.y)), vec2(duy, dFdy(bv.y))).rgb;  // Reinhard-compressed, linear
            c = min(c, vec3(.985));
            vec3 hdr = c / (1. - c) / uCrop;
            vec2 tv = vec2(u, clamp(radians(el) / PI + .5, 0., 1.));
            vec3 top = textureGrad(tEqui, tv, vec2(dux, dFdx(tv.y)), vec2(duy, dFdy(tv.y))).rgb;
            hdr = mix(hdr, top, smoothstep(.9, 1., v));
            float elr = radians(el);
            hdr = gradeSky(hdr, vec3(cos(az) * cos(elr), sin(elr), sin(az) * cos(elr)));
            // below the band: fade into a dark ground haze
            hdr = mix(hdr, uGround, smoothstep(0., -.1, v));
            if (uTw > 0.) {
              float l = dot(hdr, vec3(.3, .6, .1));
              float sparkle = smoothstep(.1, .4, l) * (1. - smoothstep(1., 3., l));
              float n = vnoise(vec2(u * 900., v * 300.) + uT * 2.5);
              hdr *= 1. + uTw * sparkle * (n - .5) * 1.4;
            }
            gl_FragColor = vec4(hdr * uTint * uExp, 1.);
          }`,
      }),
    [],
  );
  const u = mat.uniforms;
  u.tBand.value = band;
  u.tEqui.value = equi;
  u.uRot.value = rot;
  u.uExp.value = exposure;
  u.uCrop.value = s.exposure;
  (u.uElev.value as THREE.Vector2).set(s.elevMin, s.elevMax);
  (u.uTint.value as THREE.Color).set(tint);
  (u.uGround.value as THREE.Color).set(ground);
  u.uTw.value = twinkle;
  u.uShift.value = elevShift;
  u.uT.value = time;
  setGrade(u, name, grade);
  if (!band || !equi) return null;
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[radius, 96, 48]} />
    </mesh>
  );
};
