import React, { useEffect, useMemo, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import { buildMarkGeometry, ELS, elementSvg, PIVOTS, type MarkName } from './logoGeometry';

export type { MarkName } from './logoGeometry';
export { PIVOTS } from './logoGeometry';

/**
 * The Vaanika mark in 3D, built from the exact path data in design/logo/svg (via
 * scripts/sync-logo.mjs; geometry in logoGeometry.ts). Each element is extruded from its own
 * outline; its front face is a raster of the original SVG element drawn by the browser (same
 * gradients, same stroke), so colours and shapes are the logo's own, never redrawn.
 */
const rasterize = async (svg: string) => {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

type Built = { name: MarkName; geo: THREE.ExtrudeGeometry; box: THREE.Vector4; tex: THREE.Texture };

export const useMark = () => {
  const [built, setBuilt] = useState<Built[] | null>(null);
  const [handle] = useState(() => delayRender('Building the 3D mark from the logo file'));
  useEffect(() => {
    (async () => {
      const out: Built[] = [];
      for (const el of ELS) {
        const { geo, box } = buildMarkGeometry(el);
        const tex = await rasterize(elementSvg(el, box, 14));
        out.push({ name: el.name, geo, box: new THREE.Vector4(box.x, box.y, box.w, box.h), tex });
      }
      setBuilt(out);
      continueRender(handle);
    })();
  }, []);
  return built;
};

const makeMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { map: { value: null }, uBox: { value: new THREE.Vector4() }, uOp: { value: 1 }, uLight: { value: 1 }, uSheen: { value: -100 }, uSheenAmt: { value: 0 } },
    vertexShader: /* glsl */ `attribute vec2 aSvg; varying vec2 vSvg; varying vec3 vN; varying vec3 vV;
      void main(){ vSvg = aSvg; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform vec4 uBox; uniform float uOp, uLight, uSheen, uSheenAmt; varying vec2 vSvg; varying vec3 vN; varying vec3 vV;
      void main(){
        vec2 uv = vec2((vSvg.x - uBox.x) / uBox.z, 1. - (vSvg.y - uBox.y) / uBox.w);
        vec3 base = texture2D(map, uv).rgb;
        float ndv = clamp(dot(normalize(vN), normalize(vV)), 0., 1.);
        vec3 col = base * mix(1., .42 + .58 * ndv, uLight);
        col += vec3(1., .86, .62) * pow(1. - ndv, 3.) * .35 * uLight;
        float band = exp(-pow((vSvg.x * .8 + vSvg.y * .6 - uSheen) / 9., 2.));
        col += vec3(1., .94, .8) * band * uSheenAmt * (.35 + .65 * ndv);
        gl_FragColor = vec4(col, uOp);
      }`,
  });

export type ElState = { pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number]; opacity: number };

export const LogoMark3D: React.FC<{
  built: Built[];
  states: Record<MarkName, ElState>;
  light: number;
  sheen: number;
  sheenAmt: number;
}> = ({ built, states, light, sheen, sheenAmt }) => {
  const mats = useMemo(() => Object.fromEntries(built.map((b) => [b.name, makeMat()])) as Record<MarkName, THREE.ShaderMaterial>, [built]);
  return (
    <>
      {built.map((b) => {
        const s = states[b.name];
        const m = mats[b.name];
        m.uniforms.map.value = b.tex;
        m.uniforms.uBox.value = b.box;
        m.uniforms.uOp.value = s.opacity;
        m.uniforms.uLight.value = light;
        m.uniforms.uSheen.value = sheen;
        m.uniforms.uSheenAmt.value = sheenAmt;
        const [px, py] = PIVOTS[b.name];
        if (s.opacity <= 0.001) return null;
        return (
          <group key={b.name} position={[px - 100 + s.pos[0], -(py - 100) + s.pos[1], s.pos[2]]} rotation={s.rot} scale={s.scale}>
            <mesh geometry={b.geo} material={m} />
          </group>
        );
      })}
    </>
  );
};
