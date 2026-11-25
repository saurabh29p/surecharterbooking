import { ThreeCanvas } from '@remotion/three';
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { BloomPass } from './BloomPass';

/**
 * v2 render pipeline, shared by every scene so the film has one look:
 *   scene (HDR, 4x MSAA, depth) -> depth of field -> bloom -> FILM GRADE -> screen.
 * The grade is fixed (ACES filmic, midnight-blue lift, warm gold highlights, gentle grain and
 * vignette); scenes may only nudge exposure, and add flashes/fades for transitions.
 */
export type PostOpts = {
  exposure?: number;
  bloomStrength?: number;
  bloomThreshold?: number;
  bloomRadius?: number;
  /** Depth of field: focus distance (world units) and aperture (blur in px at 2x the focus distance). */
  dof?: { focus: number; aperture: number; maxBlur?: number } | null;
  flash?: number;
  fade?: number;
  fadeColor?: string;
  /** 1 = film grade (default); 0 = exact colours (logo). */
  toneMap?: number;
  vignette?: number;
  grain?: number;
  /** Heat haze: up to two plume segments in screen UV ([x0,y0,x1,y1], strength) and a band near the horizon. */
  haze?: { plumes?: [number, number, number, number, number][]; band?: [number, number, number] } | null;
  time?: number;
};

export const FILM_GRADE = { bloomStrength: 0.55, bloomThreshold: 1.05, bloomRadius: 1.0, vignette: 0.42, grain: 0.022 };

const VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const DOF_FS = /* glsl */ `
  uniform sampler2D tColor, tDepth; uniform vec2 uTexel; uniform float uNear, uFar, uFocus, uAperture, uMaxBlur;
  varying vec2 vUv;
  float linDepth(vec2 uv){ float z = texture2D(tDepth, uv).x * 2. - 1.; return 2. * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
  float coc(float d){ return clamp(uAperture * abs(d - uFocus) / max(d, 1e-3) * 2., 0., uMaxBlur); }
  void main(){
    float d = linDepth(vUv);
    float c = coc(d);
    vec3 acc = texture2D(tColor, vUv).rgb; float wsum = 1.;
    if (c > .6) {
      const float GA = 2.39996323;
      for (int i = 1; i < 40; i++) {
        float fi = float(i);
        float r = sqrt(fi / 40.) * c;
        vec2 o = vec2(cos(fi * GA), sin(fi * GA)) * r * uTexel;
        vec2 uv = vUv + o;
        float ds = linDepth(uv);
        float cs = coc(ds);
        // background samples only count if their own blur reaches us; foreground always may spill
        float w = ds < d ? smoothstep(r - 1., r + 1., cs) : smoothstep(r - 1., r + 1., max(cs, c) );
        acc += texture2D(tColor, uv).rgb * w; wsum += w;
      }
    }
    gl_FragColor = vec4(acc / wsum, 1.);
  }`;

const FINAL_FS = /* glsl */ `
  uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFrame, uExposure, uGrain, uVignette, uFlash, uFade, uTM, uTime;
  uniform vec3 uFadeColor; uniform vec4 uP0, uP1; uniform vec2 uPS; uniform vec3 uBand; varying vec2 vUv;
  float hn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
    float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
    float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
  float plume(vec2 uv, vec4 s){ vec2 a = s.xy, b = s.zw; vec2 ab = b - a; float t = clamp(dot(uv - a, ab) / max(dot(ab, ab), 1e-6), 0., 1.);
    float d = length((uv - a - ab * t) * vec2(uRes.x / uRes.y, 1.)); float w = .012 + .05 * t; return smoothstep(w, 0., d) * smoothstep(0., .08, t) * (1. - t); }
  vec3 aces(vec3 x){ const float a = 2.51, b = .03, c = 2.43, d = .59, e = .14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0., 1.); }
  vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main(){
    vec2 uv = vUv;
    float hz = uPS.x * plume(uv, uP0) + uPS.y * plume(uv, uP1) + uBand.z * smoothstep(uBand.x, uBand.y, uv.y) * smoothstep(uBand.y + .06, uBand.y, uv.y);
    if (hz > 0.) uv += (vec2(hn(uv * vec2(60., 40.) + vec2(0., uTime * 5.)), hn(uv * vec2(50., 70.) - vec2(uTime * 4., 0.))) - .5) * .006 * hz;
    vec2 d = uv - .5;
    float r2 = dot(d * vec2(uRes.x / uRes.y, 1.), d * vec2(uRes.x / uRes.y, 1.));
    vec2 off = d * .0018 * r2 * uTM;
    vec3 col = vec3(texture2D(tDiffuse, uv - off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + off).b);
    col *= uExposure;
    col += uFlash * vec3(1.0, .74, .42) * (1.1 - r2 * .6);
    vec3 raw = clamp(col, 0., 1.);
    vec3 g = aces(col);
    float l = dot(g, vec3(.2126, .7152, .0722));
    // FILM GRADE: midnight-blue lift in the shadows, warm gold in the highlights, gentle saturation
    g = mix(vec3(l), g, .94);
    g += vec3(-.004, .0, .016) * (1. - smoothstep(.0, .35, l));
    g = mix(g, g * vec3(1.06, 1.0, .86), smoothstep(.45, 1., l) * .55);
    g = mix(g, g * vec3(.93, .98, 1.08), (1. - smoothstep(.05, .45, l)) * .45);
    // filmic S-curve (slight)
    g = mix(g, g * g * (3. - 2. * g), .18);
    col = mix(raw, g, uTM);
    col = toSRGB(clamp(col, 0., 1.));
    float v = 1. - smoothstep(.3, 1.1, length(d * vec2(1.0, .8) * 1.7));
    col *= mix(1., v, uVignette);
    vec2 p = gl_FragCoord.xy + vec2(uFrame * 17.31, uFrame * 9.73);
    float lum = dot(col, vec3(.2126, .7152, .0722));
    col += (h12(p) + h12(p * .5 + 3.1) - 1.) * uGrain * (.4 + .6 * (1. - abs(lum - .45) * 1.6));
    col = mix(col, uFadeColor, uFade);
    col += (h12(gl_FragCoord.xy + uFrame) - h12(gl_FragCoord.xy * 1.3 + 7.)) / 255.;
    gl_FragColor = vec4(col, 1.);
  }`;

const Post: React.FC<PostOpts> = (o) => {
  const { gl, scene, camera, size } = useThree();
  const frame = useCurrentFrame();
  const P = useMemo(() => {
    const w = size.width, h = size.height;
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    const rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth });
    const rtA = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    const rtB = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    const bloom = new BloomPass(w, h, 6);
    const dofMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: DOF_FS, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2(1 / w, 1 / h) }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uFocus: { value: 10 }, uAperture: { value: 4 }, uMaxBlur: { value: 18 } },
    });
    const finalMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FINAL_FS, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(w, h) }, uFrame: { value: 0 }, uExposure: { value: 1 }, uGrain: { value: 0.02 }, uVignette: { value: 0.4 }, uFlash: { value: 0 }, uFade: { value: 0 }, uTM: { value: 1 }, uFadeColor: { value: new THREE.Color('#0B1020') }, uTime: { value: 0 }, uP0: { value: new THREE.Vector4() }, uP1: { value: new THREE.Vector4() }, uPS: { value: new THREE.Vector2() }, uBand: { value: new THREE.Vector3() } },
    });
    return { rtScene, rtA, rtB, bloom, dofMat, finalMat, quad: new FullScreenQuad() };
  }, [gl, size.width, size.height]);
  useEffect(() => () => { P.rtScene.dispose(); P.rtA.dispose(); P.rtB.dispose(); P.bloom.dispose(); }, [P]);

  const { fps } = useVideoConfig();
  P.bloom.strength = o.bloomStrength ?? FILM_GRADE.bloomStrength;
  P.bloom.threshold = o.bloomThreshold ?? FILM_GRADE.bloomThreshold;
  P.bloom.radius = o.bloomRadius ?? FILM_GRADE.bloomRadius;
  const fu = P.finalMat.uniforms;
  fu.uFrame.value = Math.floor((frame * 30) / fps); // grain changes at 30 fps whatever the render rate
  fu.uExposure.value = o.exposure ?? 1;
  fu.uGrain.value = o.grain ?? FILM_GRADE.grain;
  fu.uVignette.value = o.vignette ?? FILM_GRADE.vignette;
  fu.uFlash.value = o.flash ?? 0;
  fu.uFade.value = o.fade ?? 0;
  fu.uTM.value = o.toneMap ?? 1;
  (fu.uFadeColor.value as THREE.Color).set(o.fadeColor ?? '#0B1020');
  fu.uTime.value = o.time ?? frame / fps;
  const pl = o.haze?.plumes ?? [];
  (fu.uP0.value as THREE.Vector4).set(...((pl[0]?.slice(0, 4) ?? [0, 0, 0, 0]) as [number, number, number, number]));
  (fu.uP1.value as THREE.Vector4).set(...((pl[1]?.slice(0, 4) ?? [0, 0, 0, 0]) as [number, number, number, number]));
  (fu.uPS.value as THREE.Vector2).set(pl[0]?.[4] ?? 0, pl[1]?.[4] ?? 0);
  (fu.uBand.value as THREE.Vector3).set(...(o.haze?.band ?? [0, 0, 0]));

  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    scene.updateMatrixWorld();
    cam.updateMatrixWorld();
    scene.traverse((obj) => {
      if (obj.userData.renderReflection && obj.visible) obj.userData.renderReflection.call(obj, gl, scene, cam);
    });
    gl.setRenderTarget(P.rtScene);
    gl.clear();
    gl.render(scene, camera);
    let src: THREE.WebGLRenderTarget = P.rtScene;
    if (o.dof && o.dof.aperture > 0.01) {
      const du = P.dofMat.uniforms;
      du.tColor.value = P.rtScene.texture; du.tDepth.value = P.rtScene.depthTexture;
      du.uNear.value = cam.near; du.uFar.value = cam.far;
      du.uFocus.value = o.dof.focus; du.uAperture.value = o.dof.aperture; du.uMaxBlur.value = o.dof.maxBlur ?? 18;
      gl.setRenderTarget(P.rtA); P.quad.material = P.dofMat; P.quad.render(gl);
      src = P.rtA;
    }
    const dst = src === P.rtA ? P.rtB : P.rtA;
    P.bloom.renderToScreen = false;
    P.bloom.render(gl, dst, src);
    fu.tDiffuse.value = dst.texture;
    gl.setRenderTarget(null);
    P.quad.material = P.finalMat;
    P.quad.render(gl);
  }, 1);
  return null;
};

export const Stage: React.FC<{ children: React.ReactNode; post?: PostOpts; style?: React.CSSProperties }> = ({ children, post, style }) => {
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

/** Sets the default camera every frame (deterministic). fov is vertical for 16:9; portrait frames widen it unless rawFov. */
export const Cam: React.FC<{
  pos: [number, number, number] | THREE.Vector3;
  target: [number, number, number] | THREE.Vector3;
  fov: number;
  roll?: number;
  near?: number;
  far?: number;
  rawFov?: boolean;
}> = ({ pos, target, fov, roll = 0, near = 0.1, far = 8000, rawFov = false }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const aspect = size.width / size.height;
  let vfov = fov;
  if (aspect < 1 && !rawFov) {
    const hRad = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9) * 0.62);
    vfov = (2 * Math.atan(Math.tan(hRad / 2) / aspect) * 180) / Math.PI;
  }
  const P = Array.isArray(pos) ? new THREE.Vector3(...pos) : pos;
  const T = Array.isArray(target) ? new THREE.Vector3(...target) : target;
  camera.position.copy(P);
  const fwd = T.clone().sub(P).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  camera.up.copy(up.multiplyScalar(Math.cos(roll)).add(right.multiplyScalar(Math.sin(roll))));
  camera.lookAt(T);
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

/** Seconds since the start of the current sequence, at any render frame rate. */
export const useTime = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};
