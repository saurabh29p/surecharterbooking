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

export const useHdrEnv = (name: SkyName, rot = 0, intensity = 1, ground?: string) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const tex = useAsyncAsset(`HDRI ${name}`, () => loadHdr(name).then((equi) => {
    equi.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(gl);
    let env: THREE.Texture;
    if (ground) {
      // pure-sky HDRIs have sky below the horizon too; reflections need a dark ground there
      const sc = new THREE.Scene();
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { tEqui: { value: equi }, uGround: { value: new THREE.Color(ground) } },
        vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: `uniform sampler2D tEqui; uniform vec3 uGround; varying vec3 vD;
          void main(){ vec3 d = normalize(vD); vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + .5, asin(clamp(d.y, -1., 1.)) / 3.14159265 + .5);
            vec3 c = texture2D(tEqui, uv).rgb; c = mix(c, uGround, smoothstep(.0, -.06, d.y)); gl_FragColor = vec4(c, 1.); }`,
      });
      sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat));
      env = pm.fromScene(sc, 0).texture;
    } else env = pm.fromEquirectangular(equi).texture;
    pm.dispose();
    return { env, equi };
  }), [name, ground]);
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
}> = ({ name, rot = 0, exposure = 1, tint = '#ffffff', equi, twinkle = 0, time = 0, ground = '#05070d', radius = 5000, elevShift = 0 }) => {
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
          uGround: { value: new THREE.Color() }, uShift: { value: 0 },
        },
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
        fragmentShader: /* glsl */ `
          ${NOISE}
          uniform sampler2D tBand, tEqui; uniform float uRot, uExp, uCrop, uTw, uT, uShift; uniform vec2 uElev; uniform vec3 uTint, uGround;
          varying vec3 vDir;
          const float PI = 3.14159265;
          void main(){
            vec3 d = normalize(vDir);
            float az = atan(d.z, d.x) - uRot;
            float u = fract(az / (2. * PI) + .5);
            float el = degrees(asin(clamp(d.y, -1., 1.))) - uShift;
            float v = (el - uElev.x) / (uElev.y - uElev.x);
            vec3 c = texture2D(tBand, vec2(u, 1. - clamp(v, .002, .998))).rgb;  // Reinhard-compressed, linear
            c = min(c, vec3(.985));
            vec3 hdr = c / (1. - c) / uCrop;
            vec3 top = texture2D(tEqui, vec2(u, clamp(radians(el) / PI + .5, 0., 1.))).rgb;
            hdr = mix(hdr, top, smoothstep(.9, 1., v));
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
  if (!band || !equi) return null;
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[radius, 96, 48]} />
    </mesh>
  );
};
