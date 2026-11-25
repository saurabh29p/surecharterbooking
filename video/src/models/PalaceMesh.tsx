import React, { useMemo } from 'react';
import { staticFile } from 'remotion';
import { useAsyncAsset } from '../lib/asyncAsset';
import * as THREE from 'three';
import { buildPalace, PalaceGeo, PLINTH } from './palace3d';

let palaceGeo: PalaceGeo | null = null;
export const getPalace = () => (palaceGeo ??= buildPalace(7));

const texCache = new Map<string, Promise<THREE.Texture>>();
export const loadTex = (file: string, srgb: boolean) => {
  const key = file + srgb;
  if (!texCache.has(key))
    texCache.set(key, new THREE.TextureLoader().loadAsync(staticFile(`assets/tex/${file}`)).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    }));
  return texCache.get(key)!;
};
export const useTextures = (files: [string, boolean][]) =>
  useAsyncAsset('textures ' + files.map((f) => f[0]).join(','), () => Promise.all(files.map(([f, s]) => loadTex(f, s))), []);

/**
 * Triplanar PBR (world-space projection, no UVs needed) with a warm floodlight term: façades lit
 * from below in pools, as palaces are at night. Applied to MeshStandardMaterial via onBeforeCompile.
 */
export const triplanar = (m: THREE.MeshStandardMaterial, diff: THREE.Texture, rough: THREE.Texture, scale: number, tint: THREE.Color, flood: { on: number; color: THREE.Color; base: number; falloff: number; spacing: number }) => {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tDiff = { value: diff };
    sh.uniforms.tRough = { value: rough };
    sh.uniforms.uScale = { value: scale };
    sh.uniforms.uTint = { value: tint };
    sh.uniforms.uFlood = { value: flood.on };
    sh.uniforms.uFloodCol = { value: flood.color };
    sh.uniforms.uFloodBase = { value: flood.base };
    sh.uniforms.uFloodFall = { value: flood.falloff };
    sh.uniforms.uFloodSpacing = { value: flood.spacing };
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN; uniform sampler2D tDiff, tRough; uniform float uScale, uFlood, uFloodBase, uFloodFall, uFloodSpacing; uniform vec3 uTint, uFloodCol;
        vec3 tri(sampler2D t){ vec3 w = pow(abs(vWN), vec3(4.)); w /= (w.x + w.y + w.z);
          return texture2D(t, vWP.zy * uScale).rgb * w.x + texture2D(t, vWP.xz * uScale).rgb * w.y + texture2D(t, vWP.xy * uScale).rgb * w.z; }`)
      .replace('#include <map_fragment>', `diffuseColor.rgb *= tri(tDiff) * uTint;
        // grime: darker near the water line and under cornices
        diffuseColor.rgb *= mix(.72, 1., smoothstep(${PLINTH.toFixed(1)} - 3., ${PLINTH.toFixed(1)} + 4., vWP.y));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= mix(.75, 1.15, tri(tRough).g);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float h = max(vWP.y - ${PLINTH.toFixed(1)}, 0.);
          float pool = pow(.5 + .5 * cos(vWP.x * 6.2831 / uFloodSpacing), 3.5);
          float facing = max(dot(normalize(vWN), normalize(vec3(0., -.15, 1.))), 0.) * .85 + max(vWN.y, 0.) * .1;
          float up = (uFloodBase + exp(-h / uFloodFall) * (.45 + .55 * pool)) * facing;
          totalEmissiveRadiance += diffuseColor.rgb * uFloodCol * up * uFlood;
        }`);
  };
  m.customProgramCacheKey = () => 'tri' + scale;
};

export const PalaceMesh: React.FC<{ flood?: number; glow?: number; position?: [number, number, number]; scale?: number; rotationY?: number }> = ({
  flood = 1, glow = 1, position = [0, 0, 0], scale = 1, rotationY = 0,
}) => {
  const geo = getPalace();
  const tex = useTextures([
    ['painted_plaster_wall_diff.jpg', true], ['painted_plaster_wall_rough.jpg', false],
    ['old_sandstone_02_diff.jpg', true], ['old_sandstone_02_rough.jpg', false],
  ]);
  const mats = useMemo(() => {
    if (!tex) return null;
    const floodCol = new THREE.Color(1.0, 0.62, 0.32);
    const plaster = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0, envMapIntensity: 0.55 });
    triplanar(plaster, tex[0], tex[1], 0.22, new THREE.Color('#ecd6b4'), { on: 1, color: floodCol, base: 0.015, falloff: 5.5, spacing: 6.7 });
    const stone = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, metalness: 0, envMapIntensity: 0.55 });
    triplanar(stone, tex[2], tex[3], 0.3, new THREE.Color('#d9b78a'), { on: 1, color: floodCol, base: 0.02, falloff: 5.5, spacing: 6.7 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d9bc78', metalness: 1, roughness: 0.28, envMapIntensity: 1.4, emissive: new THREE.Color('#5a3a12'), emissiveIntensity: 0.6 });
    const glowM = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
    return { plaster, stone, gold, glowM };
  }, [tex]);
  if (!mats) return null;
  for (const m of [mats.plaster, mats.stone]) {
    const sh = m.userData.shader;
    if (sh) sh.uniforms.uFlood.value = flood;
  }
  mats.glowM.color.setScalar(3.2 * glow);
  return (
    <group position={position} scale={scale} rotation={[0, rotationY, 0]}>
      <mesh geometry={geo.plaster} material={mats.plaster} />
      <mesh geometry={geo.stone} material={mats.stone} />
      <mesh geometry={geo.gold} material={mats.gold} />
      <mesh geometry={geo.glow} material={mats.glowM} />
    </group>
  );
};
