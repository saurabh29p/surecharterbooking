import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { NOISE } from '../lib/glsl';

/** Still lake with true planar reflections: wind ripples distort the mirror, fresnel, moon glitter, distance haze. */
const WaterShader = {
  name: 'LakeWater',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uTime: { value: 0 }, uDeep: { value: new THREE.Color('#03060e') }, uLight: { value: new THREE.Vector3(0, 0.3, -1) },
    uLightCol: { value: new THREE.Color(1, 1, 1) }, uFog: { value: new THREE.Color('#0b1224') }, uFogD: { value: 0.002 },
    uRipple: { value: 1 }, uDistort: { value: 0.03 }, uRefl: { value: 1 },
  },
  vertexShader: /* glsl */ `uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vW;
    void main(){ vUvR = textureMatrix * vec4(position, 1.); vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: /* glsl */ `
    ${NOISE}
    uniform sampler2D tDiffuse; uniform float uTime, uFogD, uRipple, uDistort, uRefl; uniform vec3 uDeep, uLight, uLightCol, uFog;
    varying vec4 vUvR; varying vec3 vW;
    float h(vec2 p){
      float t = uTime;
      return vnoise(p * .35 + vec2(t * .12, t * .05)) * .55 + vnoise(p * 1.1 - vec2(t * .2, -t * .14)) * .3 + vnoise(p * 3.3 + vec2(-t * .4, t * .3)) * .15;
    }
    void main(){
      vec2 p = vW.xz;
      float e = .08;
      float h0 = h(p), hx = h(p + vec2(e, 0.)), hz = h(p + vec2(0., e));
      vec3 n = normalize(vec3(-(hx - h0) / e * .35 * uRipple, 1., -(hz - h0) / e * .35 * uRipple));
      vec3 V = normalize(cameraPosition - vW);
      float fres = .02 + .98 * pow(1. - max(dot(n, V), 0.), 5.);
      vec4 uv = vUvR; uv.xy += n.xz * uDistort * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 col = mix(uDeep, refl, clamp(fres * 1.1 + .3, 0., 1.) * uRefl);
      vec3 R = reflect(-normalize(uLight), n);
      float spec = pow(max(dot(R, V), 0.), 600.) * 6. + pow(max(dot(R, V), 0.), 60.) * .08;
      col += uLightCol * spec;
      float dist = length(vW - cameraPosition);
      col = mix(col, uFog, 1. - exp(-dist * uFogD));
      gl_FragColor = vec4(col, 1.);
    }`,
};

export const Lake: React.FC<{
  size?: number; y?: number; time: number; res?: [number, number]; deep?: string; lightDir: THREE.Vector3; lightColor?: THREE.Color;
  fog?: string; fogDensity?: number; ripple?: number; distort?: number;
}> = ({ size = 4000, y = 0, time, res = [960, 540], deep = '#03060e', lightDir, lightColor = new THREE.Color(1.4, 1.35, 1.25), fog = '#0b1224', fogDensity = 0.0015, ripple = 1, distort = 0.03 }) => {
  const refl = useMemo(() => {
    const r = new Reflector(new THREE.PlaneGeometry(size, size), { textureWidth: res[0], textureHeight: res[1], clipBias: 0.002, multisample: 0, shader: WaterShader });
    r.rotation.x = -Math.PI / 2;
    // Rendering the reflection inside the main draw (nested render) corrupts it under SwiftShader;
    // the Stage renders registered reflections first, before the main pass.
    r.userData.renderReflection = r.onBeforeRender;
    r.onBeforeRender = () => {};
    return r;
  }, [size, res[0], res[1]]);
  const u = (refl.material as THREE.ShaderMaterial).uniforms;
  u.uTime.value = time;
  (u.uDeep.value as THREE.Color).set(deep);
  (u.uLight.value as THREE.Vector3).copy(lightDir);
  (u.uLightCol.value as THREE.Color).copy(lightColor);
  (u.uFog.value as THREE.Color).set(fog);
  u.uFogD.value = fogDensity;
  u.uRipple.value = ripple;
  u.uDistort.value = distort;
  refl.position.y = y;
  return <primitive object={refl} onUpdate={(o: THREE.Object3D) => { o.userData.isReflector = true; }} />;
};
