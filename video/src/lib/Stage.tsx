import { ThreeCanvas } from '@remotion/three';
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BloomPass } from './BloomPass';

export type PostOpts = {
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  exposure?: number;
  grain?: number;
  vignette?: number;
  ca?: number;
  /** Additive warm light flash (0..1), used on beat transitions. */
  flash?: number;
  /** Fade to colour (0..1). */
  fade?: number;
  fadeColor?: string;
  /** Saturation multiplier. */
  saturation?: number;
  /** Warmth of highlights (0..1). */
  warmth?: number;
  /** 1 = filmic ACES tone mapping and grade; 0 = exact colours (UI, logo). */
  toneMap?: number;
};

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uFrame: { value: 0 },
    uExposure: { value: 1 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.55 },
    uCA: { value: 0.0025 },
    uFlash: { value: 0 },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color('#0B1020') },
    uSat: { value: 1 },
    uWarm: { value: 0.5 },
    uTM: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFrame, uExposure, uGrain, uVignette, uCA, uFlash, uFade, uSat, uWarm, uTM;
    uniform vec3 uFadeColor; varying vec2 vUv;
    vec3 aces(vec3 x){ const float a = 2.51, b = .03, c = 2.43, d = .59, e = .14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0., 1.); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 uv = vUv; vec2 d = uv - .5;
      float r2 = dot(d * vec2(uRes.x / uRes.y, 1.), d * vec2(uRes.x / uRes.y, 1.));
      vec2 off = d * uCA * r2;
      vec3 col = vec3(texture2D(tDiffuse, uv - off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + off).b);
      col *= uExposure;
      col += uFlash * vec3(1.0, .78, .46) * (1.2 - r2 * .6);
      vec3 raw = clamp(col, 0., 1.);
      col = aces(col);
      float l = dot(col, vec3(.2126, .7152, .0722));
      col = mix(vec3(l), col, uSat);
      // brand grade: shadows lean midnight blue, highlights lean warm gold
      col = mix(col, col * vec3(.94, .97, 1.05), (1. - smoothstep(0., .5, l)) * .5);
      col = mix(col, col * vec3(1.07, 1.0, .88), smoothstep(.35, 1., l) * uWarm);
      col = mix(raw, col, uTM);
      l = dot(col, vec3(.2126, .7152, .0722));
      col = toSRGB(col);
      // vignette (elliptical, soft)
      float v = 1. - smoothstep(.25, 1.05, length(d * vec2(1.0, .78) * 1.75));
      col *= mix(1., v, uVignette);
      // film grain: two octaves, weighted toward the mid-tones, changes every frame
      vec2 p = gl_FragCoord.xy + vec2(uFrame * 17.31, uFrame * 9.73);
      float g = (h12(p) + h12(p * .5 + 3.1) - 1.);
      col += g * uGrain * (.35 + .65 * (1. - abs(l - .45) * 1.6));
      col = mix(col, uFadeColor, uFade);
      // triangular dither against banding in the dark gradients
      col += (h12(gl_FragCoord.xy + uFrame) - h12(gl_FragCoord.xy * 1.3 + 7.) ) / 255.;
      gl_FragColor = vec4(col, 1.);
    }`,
};

const Post: React.FC<PostOpts> = (o) => {
  const { gl, scene, camera, size } = useThree();
  const frame = useCurrentFrame();
  const { composer, bloom, final } = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(size.width, size.height, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    const composer = new EffectComposer(gl, rt);
    composer.setPixelRatio(1);
    composer.setSize(size.width, size.height);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new BloomPass(size.width, size.height, 6);
    composer.addPass(bloom);
    const final = new ShaderPass(FinalShader);
    final.uniforms.uRes.value.set(size.width, size.height);
    composer.addPass(final);
    return { composer, bloom, final };
  }, [gl, scene, camera, size.width, size.height]);

  useEffect(() => () => composer.dispose(), [composer]);

  bloom.strength = o.bloomStrength ?? 0.7;
  bloom.radius = o.bloomRadius ?? 1.0;
  bloom.threshold = o.bloomThreshold ?? 0.85;
  const u = final.uniforms;
  u.uFrame.value = frame;
  u.uExposure.value = o.exposure ?? 1;
  u.uGrain.value = o.grain ?? 0.03;
  u.uVignette.value = o.vignette ?? 0.55;
  u.uCA.value = o.ca ?? 0.0025;
  u.uFlash.value = o.flash ?? 0;
  u.uFade.value = o.fade ?? 0;
  u.uSat.value = o.saturation ?? 1;
  u.uWarm.value = o.warmth ?? 0.5;
  u.uTM.value = o.toneMap ?? 1;
  (u.uFadeColor.value as THREE.Color).set(o.fadeColor ?? '#0B1020');

  useFrame(() => {
    composer.render();
  }, 1);
  return null;
};

export const Stage: React.FC<{ children: React.ReactNode; post?: PostOpts; style?: React.CSSProperties }> = ({
  children,
  post,
  style,
}) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas
      width={width}
      height={height}
      dpr={1}
      flat
      linear
      style={{ position: 'absolute', inset: 0, ...style }}
      gl={{ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
    >
      {children}
      <Post {...post} />
    </ThreeCanvas>
  );
};

/** Sets the default camera from props every frame (deterministic, no state). */
export const Cam: React.FC<{
  pos: [number, number, number];
  target: [number, number, number];
  /** Vertical field of view for a 16:9 frame; widened automatically for portrait frames. */
  fov: number;
  roll?: number;
  near?: number;
  far?: number;
  /** Use fov as-is for every frame shape (no portrait widening). */
  rawFov?: boolean;
}> = ({ pos, target, fov, roll = 0, near = 0.1, far = 6000, rawFov = false }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const aspect = size.width / size.height;
  // Keep the same horizontal coverage logic as 16:9 for landscape; for portrait keep the
  // 16:9 frame's *vertical* coverage x 1.25 so subjects stay framed.
  let vfov = fov;
  if (aspect < 1 && !rawFov) {
    const hRad = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9) * 0.62);
    vfov = (2 * Math.atan(Math.tan(hRad / 2) / aspect) * 180) / Math.PI;
  }
  camera.position.set(...pos);
  const fwd = new THREE.Vector3(...target).sub(camera.position).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  camera.up.copy(up.multiplyScalar(Math.cos(roll)).add(right.multiplyScalar(Math.sin(roll))));
  camera.lookAt(...target);
  camera.fov = vfov;
  camera.aspect = aspect;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
  return null;
};

export const useIsPortrait = () => {
  const { width, height } = useVideoConfig();
  return height > width;
};
