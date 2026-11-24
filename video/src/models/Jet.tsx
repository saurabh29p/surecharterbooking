import React, { useMemo } from 'react';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A stylised, generic private jet built from code (no real type, no registration, no logos).
 * Local frame: nose toward +x, up +y, left wing toward +z. Length ~20 m, span ~19 m.
 */

const L = 20;
// fuselage radius profile along x (0 = nose tip)
const radiusAt = (x: number) => {
  if (x < 3.6) {
    const t = x / 3.6;
    return 1.06 * Math.pow(Math.sin((t * Math.PI) / 2), 0.62);
  }
  if (x < 12.6) return 1.06;
  const t = (x - 12.6) / (L - 12.6);
  return 1.06 * (1 - t) + 0.22 * t - 0.12 * Math.sin(t * Math.PI);
};
const upsweep = (x: number) => (x < 12 ? -0.06 * Math.max(0, 2.6 - x) : 0.62 * Math.pow((x - 12) / (L - 12), 1.6));

const fuselageGeometry = () => {
  const N = 140, M = 64;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const x = Math.pow(s, 1.0) * L;
    const r = Math.max(radiusAt(x), 0.0001);
    for (let j = 0; j <= M; j++) {
      const a = (j / M) * Math.PI * 2;
      const y = Math.cos(a) * r * 1.04 + upsweep(x);
      const z = Math.sin(a) * r;
      pos.push(L / 2 - x, y, z);
      uv.push(j / M, s);
    }
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + M + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/** A swept, tapered lifting surface from a planform; thickness tapers toward the tip. */
const surfaceGeometry = (
  rootLE: number, rootTE: number, tipLE: number, tipTE: number, span: number,
  rootT: number, tipT: number, dihedral: number,
) => {
  const shape = new THREE.Shape();
  shape.moveTo(rootLE, 0);
  shape.lineTo(tipLE, span);
  shape.quadraticCurveTo((tipLE + tipTE) / 2 + 0.1, span + 0.25, tipTE, span);
  shape.lineTo(rootTE, 0);
  shape.lineTo(rootLE, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.05, bevelSegments: 4, steps: 1, curveSegments: 12 });
  // shape is in x/y; we want span along z, thickness along y
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), sp = p.getY(i), th = p.getZ(i) - 0.5; // th in [-1, 1]
    const k = Math.min(1, Math.max(0, sp / span));
    const t = rootT * (1 - k) + tipT * k;
    // airfoil: thicker toward the leading edge
    const le = rootLE * (1 - k) + tipLE * k, te = rootTE * (1 - k) + tipTE * k;
    const c = Math.min(1, Math.max(0, (te - x) / Math.max(te - le, 0.01)));
    const camber = Math.sin(Math.min(1, c) * Math.PI) ** 0.6;
    p.setXYZ(i, -x, (th * t * 0.5) * (0.35 + 0.65 * camber) + sp * Math.tan(dihedral), sp);
  }
  g.computeVertexNormals();
  return mergeVertices(g, 1e-4);
};

const PAINT_VERT = /* glsl */ `varying vec3 vLocal;`;

export const Jet: React.FC<{
  env: THREE.Texture | null;
  gear?: number; // 1 = down, 0 = retracted
  strobe?: number; // 0..1 strobe flash
  beacon?: number;
  landingLights?: number;
  exhaust?: number;
}> = ({ env, gear = 1, strobe = 0, beacon = 0, landingLights = 1, exhaust = 0 }) => {
  const m = useMemo(() => {
    const body = new THREE.MeshPhysicalMaterial({
      color: '#f3efe6', roughness: 0.3, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.85,
    });
    body.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${PAINT_VERT}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLocal = position;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${PAINT_VERT}`)
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          {
            float x = 10. - vLocal.x; // distance from nose
            float side = abs(vLocal.z);
            // gold cheatline pair along the cabin
            float y = vLocal.y;
            float band = smoothstep(.06, .03, abs(y + .16 + x * .004)) + .7 * smoothstep(.022, .0, abs(y + .29 + x * .004));
            band *= smoothstep(2.4, 3.6, x) * smoothstep(17.2, 15.4, x) * step(.35, side);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .42, .16), clamp(band, 0., 1.));
            roughnessFactor = mix(roughnessFactor, .22, clamp(band, 0., 1.));
            // cabin windows: a row of rounded ovals on both sides
            vec2 wp = vec2(mod(x - 4.15, .92) - .46, y - .3);
            float win = step(4.1, x) * step(x, 11.9) * step(.5, side);
            float w = smoothstep(.02, -.02, length(wp / vec2(.2, .27)) - 1.);
            // cockpit windshield: two curved panes either side of a centre post, slanted ends
            float ang = atan(vLocal.z, vLocal.y - .05);
            float aa = abs(ang);
            float x0 = 1.75 + aa * .55, x1 = 2.95 - aa * .2;
            float ws = smoothstep(x0 - .03, x0 + .03, x) * smoothstep(x1 + .03, x1 - .03, x)
                     * smoothstep(.09, .13, aa) * smoothstep(1.2, 1.12, aa);
            float dark = clamp(w * win + ws, 0., 1.);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.012, .016, .03), dark);
            roughnessFactor = mix(roughnessFactor, .04, dark);
          }`,
        );
    };
    const plain = new THREE.MeshPhysicalMaterial({ color: '#f3efe6', roughness: 0.3, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.85 });
    const wing = new THREE.MeshPhysicalMaterial({ color: '#dedbd4', roughness: 0.3, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.08, envMapIntensity: 0.9 });
    const metal = new THREE.MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.25, metalness: 1, envMapIntensity: 1.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#0b0d12', roughness: 0.55, metalness: 0.2 });
    const tire = new THREE.MeshStandardMaterial({ color: '#08090c', roughness: 0.8, metalness: 0 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d9bc78', roughness: 0.22, metalness: 1, envMapIntensity: 1.4 });
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.3, 0.2), toneMapped: false });
    const green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 6, 1.2), toneMapped: false });
    const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.5, 8), toneMapped: false });
    const exhaustM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.6), toneMapped: false });
    return { body, plain, wing, metal, dark, tire, gold, red, green, white, exhaustM };
  }, []);
  [m.body, m.plain, m.wing, m.metal, m.gold].forEach((mat) => (mat.envMap = env));
  const g = useMemo(() => {
    const fus = fuselageGeometry();
    const wing = surfaceGeometry(-1.0, 2.9, 2.9, 4.0, 9.2, 0.42, 0.12, THREE.MathUtils.degToRad(3.5));
    const hstab = surfaceGeometry(-0.1, 1.45, 1.4, 2.15, 3.3, 0.16, 0.06, THREE.MathUtils.degToRad(1));
    const fin = surfaceGeometry(-0.2, 2.6, 2.3, 3.25, 3.7, 0.26, 0.12, 0);
    const winglet = surfaceGeometry(0, 0.9, 0.75, 1.3, 1.25, 0.08, 0.04, 0);
    const nacProfile: THREE.Vector2[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const r = 0.5 + 0.08 * Math.sin(Math.min(1, t * 1.4) * Math.PI) - (t > 0.75 ? (t - 0.75) * 0.9 : 0);
      nacProfile.push(new THREE.Vector2(Math.max(r, 0.2), t * 3.3));
    }
    const nacelle = new THREE.LatheGeometry(nacProfile, 48);
    nacelle.rotateZ(Math.PI / 2);
    const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 28).rotateX(Math.PI / 2);
    const strut = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 12);
    const light = new THREE.SphereGeometry(0.07, 12, 8);
    const disc = new THREE.CircleGeometry(0.42, 32).rotateY(Math.PI / 2);
    return { fus, wing, hstab, fin, winglet, nacelle, wheel, strut, light, disc };
  }, []);

  const gearRot = (1 - gear) * (Math.PI / 2) * 0.98;
  const nacelles = [1, -1].map((s) => (
    <group key={s} position={[-4.1, 0.78, s * 1.72]}>
      <mesh geometry={g.nacelle} material={m.plain} position={[1.65, 0, 0]} />
      <mesh geometry={g.disc} material={m.dark} position={[1.62, 0, 0]} />
      <mesh geometry={g.disc} material={m.metal} position={[1.6, 0, 0]} scale={0.45} />
      <mesh geometry={g.disc} material={m.exhaustM} position={[-1.62, 0, 0]} scale={0.55 * exhaust + 0.001} rotation={[0, Math.PI, 0]} />
      <mesh position={[0.2, -0.05, -s * 0.48]} material={m.plain}>
        <boxGeometry args={[1.4, 0.18, 0.7]} />
      </mesh>
    </group>
  ));
  return (
    <group>
      <mesh geometry={g.fus} material={m.body} castShadow />
      {/* wings, low and swept; left (+z) and mirrored right */}
      <group position={[1.6, -0.62, 0.7]}>
        <mesh geometry={g.wing} material={m.wing} />
        <group position={[-3.1, 0.62, 9.15]} rotation={[0.3, 0, 0]}>
          <mesh geometry={g.winglet} material={m.wing} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
        <mesh geometry={g.light} material={m.red} position={[-3.1, 0.6, 9.35]} />
        <mesh geometry={g.light} material={m.white} position={[-3.9, 0.6, 9.3]} scale={0.5 + strobe * 1.2} />
      </group>
      <group position={[1.6, -0.62, -0.7]} scale={[1, 1, -1]}>
        <mesh geometry={g.wing} material={m.wing} />
        <group position={[-3.1, 0.62, 9.15]} rotation={[0.3, 0, 0]}>
          <mesh geometry={g.winglet} material={m.wing} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
        <mesh geometry={g.light} material={m.green} position={[-3.1, 0.6, 9.35]} />
        <mesh geometry={g.light} material={m.white} position={[-3.9, 0.6, 9.3]} scale={0.5 + strobe * 1.2} />
      </group>
      {/* T-tail */}
      <group position={[-6.4, 0.6, 0]}>
        <mesh geometry={g.fin} material={m.plain} rotation={[-Math.PI / 2, 0, 0]} />
        <group position={[-2.35, 3.55, 0.04]}>
          <mesh geometry={g.hstab} material={m.wing} />
          <mesh geometry={g.hstab} material={m.wing} scale={[1, 1, -1]} />
          <mesh geometry={g.light} material={m.gold} position={[-1.6, 0.05, 0]} scale={2} />
        </group>
      </group>
      {nacelles}
      {/* beacon on top, landing lights at the wing roots */}
      <mesh geometry={g.light} material={m.red} position={[1, 1.12, 0]} scale={0.7 + beacon * 1.6} />
      {[1, -1].map((s) => (
        <mesh key={s} geometry={g.light} material={m.white} position={[2.9, -0.62, s * 1.6]} scale={0.6 + landingLights * 1.6} />
      ))}
      {/* landing gear: nose + mains, retracting */}
      <group position={[7.4, -0.92, 0]} rotation={[0, 0, -gearRot]}>
        <mesh geometry={g.strut} material={m.metal} position={[0, -0.55, 0]} />
        <mesh geometry={g.wheel} material={m.tire} position={[0, -1.15, 0]} scale={0.8} />
      </group>
      {[1, -1].map((s) => (
        <group key={s} position={[0.4, -0.95, s * 2.0]} rotation={[s * gearRot, 0, 0]}>
          <mesh geometry={g.strut} material={m.metal} position={[0, -0.5, 0]} />
          <mesh geometry={g.wheel} material={m.tire} position={[0, -1.05, 0]} />
        </group>
      ))}
    </group>
  );
};
