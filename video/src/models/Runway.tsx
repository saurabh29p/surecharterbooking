import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useTextures } from './PalaceMesh';
import { LightPoints } from './LightPoints';

/**
 * Runway at dusk: CC0 PBR asphalt (Poly Haven asphalt_02) in world space with painted markings
 * (centreline, edges, aiming-point and touchdown-zone blocks), a dry field beyond, and raised edge-light
 * fixtures with warm glows. Runway along x, centred at z = 0, 45 m wide.
 */
export const RUNWAY_HALF = 22.5;

export const Runway: React.FC<{ time: number; extent?: [number, number] }> = ({ time, extent = [-900, 2600] }) => {
  const tex = useTextures([['asphalt_02_diff.jpg', true], ['asphalt_02_rough.jpg', false], ['asphalt_02_nor.jpg', false]]);
  const mat = useMemo(() => {
    if (!tex) return null;
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0, envMapIntensity: 0.8 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tDiff = { value: tex[0] }; sh.uniforms.tRough = { value: tex[1] }; sh.uniforms.tNor = { value: tex[2] };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vW; uniform sampler2D tDiff, tRough, tNor;
          float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
          float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), u.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), u.x), u.y); }
          float paintMask(){
            float z = abs(vW.z), x = vW.x;
            float aa = fwidth(vW.z) + fwidth(vW.x) + .01;
            float m = smoothstep(.45 + aa, .45 - aa, abs(z - 21.4));                                  // edge lines
            m += smoothstep(.45 + aa, .45 - aa, z) * step(fract(x / 50.), .6);                          // centreline
            float ap = step(abs(z - 10.5), 3.) * step(fract((x + 30.) / 300.), 45. / 300.);              // aiming-point blocks
            float tz = step(abs(z - 6.5), 1.) * step(fract(x / 150.), 22. / 150.) + step(abs(z - 11.), 1.) * step(fract(x / 150.), 22. / 150.); // touchdown zone
            m += ap + tz * .9;
            return clamp(m, 0., 1.) * step(z, 22.5);
          }`)
        .replace('#include <map_fragment>', `
          vec2 uv = vW.xz * .22;
          float onR = step(abs(vW.z), 22.5);
          vec3 asph = texture2D(tDiff, uv).rgb * vec3(.62, .62, .66);
          asph *= .85 + .3 * vn(vW.xz * .02);                                     // large-scale patching
          float rubber = smoothstep(.5, .9, vn(vec2(vW.x * .01, vW.z * .5))) * step(abs(vW.z), 9.) * .45;
          asph *= 1. - rubber;
          vec3 field = mix(vec3(.12, .1, .07), vec3(.2, .17, .11), vn(vW.xz * .03)) * (.8 + .4 * texture2D(tDiff, uv * .3).r);
          vec3 base = mix(field, asph, onR);
          float pm = paintMask();
          diffuseColor.rgb = mix(base, vec3(.55, .55, .52) * (.85 + .15 * texture2D(tDiff, uv * 2.).r), pm);`)
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(.95, .62 + .3 * texture2D(tRough, uv).g, onR);
          roughnessFactor = mix(roughnessFactor, .55, pm);`)
        .replace('#include <normal_fragment_maps>', `{
            vec3 tn = texture2D(tNor, uv).xyz * 2. - 1.;
            vec3 wn = normalize(vec3(tn.x * .6, 1., -tn.y * .6));
            normal = normalize((viewMatrix * vec4(wn, 0.)).xyz);
          }`);
    };
    m.customProgramCacheKey = () => 'runway';
    return m;
  }, [tex]);
  const lights = useMemo(() => {
    const p: number[] = [], c: number[] = [];
    for (let x = extent[0]; x <= extent[1]; x += 30) for (const z of [-24, 24]) { p.push(x, 0.32, z); c.push(1, 0.86, 0.62); }
    for (let x = extent[0]; x <= extent[1]; x += 15) { p.push(x, 0.06, 0); c.push(0.85, 0.9, 1); }      // centreline lights
    for (let x = extent[0]; x <= extent[1]; x += 60) { p.push(x, 0.4, -75); c.push(0.25, 0.45, 1); }    // taxiway (blue)
    return { p: new Float32Array(p), c: new Float32Array(c) };
  }, []);
  const fixtures = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.035, 0.05, 0.3, 10);
    const n = lights.p.length / 3;
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: '#5a5d63', metalness: 0.7, roughness: 0.45 }), n);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { mm.makeTranslation(lights.p[i * 3], 0.15, lights.p[i * 3 + 2]); im.setMatrixAt(i, mm); }
    return im;
  }, [lights]);
  if (!mat) return null;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat} position={[(extent[0] + extent[1]) / 2, 0, 0]}>
        <planeGeometry args={[extent[1] - extent[0] + 2000, 4000]} />
      </mesh>
      <primitive object={fixtures} />
      <LightPoints positions={lights.p} colors={lights.c} size={0.16} intensity={1.6} minPx={1.6} time={time} />
    </>
  );
};
