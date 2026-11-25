import React, { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Detailed procedural business jet (generic type; no registration, no airline or operator marks).
 * Local frame: nose +x, up +y, left wing +z; fuselage axis at y = 0. Wheels touch y = -GEAR_H.
 * PBR: clear-coated white paint with panel lines and a gold/navy cheatline, glass with chrome rims,
 * polished leading edges and intake lips, dark exhaust metal, rubber tyres. Reflections come from
 * the scene's HDRI environment.
 */
export const JET_L = 21;
export const GEAR_H = 2.25;
const R = 1.16;

const noseToX = (d: number) => JET_L / 2 - d;
const radius = (d: number) => {
  if (d < 4.2) { const t = d / 4.2; return R * Math.pow(1 - Math.pow(1 - t, 2.3), 0.5); }
  if (d < 13.8) return R;
  const t = (d - 13.8) / (JET_L - 13.8);
  return R * (1 - t) + 0.26 * t - 0.16 * Math.sin(t * Math.PI);
};
const centerY = (d: number) => (d < 4.2 ? -0.16 * Math.pow(1 - d / 4.2, 2) : 0) + (d > 12.5 ? 0.78 * Math.pow((d - 12.5) / (JET_L - 12.5), 1.6) : 0);
/** Point on the fuselage surface at distance d from the nose and angle a (0 = top, +pi/2 = left side). */
export const hull = (d: number, a: number, off = 0) => {
  const r = Math.max(radius(d), 1e-4) + off;
  return new THREE.Vector3(noseToX(d), centerY(d) + Math.cos(a) * r * 1.035, Math.sin(a) * r);
};

const fuselageGeo = () => {
  const N = 220, M = 96;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const d = Math.pow(s, 1.08) * JET_L;
    for (let j = 0; j <= M; j++) {
      const p = hull(d, (j / M) * Math.PI * 2);
      pos.push(p.x, p.y, p.z);
      uv.push(d, j / M);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/** A patch of the hull surface (d0..d1, a0..a1), raised by off, for glass and frames. */
const hullPatch = (d0: number, d1: number, a0: number, a1: number, off: number, nd = 16, na = 16, mask?: (u: number, v: number) => boolean) => {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= nd; i++) for (let j = 0; j <= na; j++) {
    const p = hull(d0 + ((d1 - d0) * i) / nd, a0 + ((a1 - a0) * j) / na, off);
    pos.push(p.x, p.y, p.z);
  }
  for (let i = 0; i < nd; i++) for (let j = 0; j < na; j++) {
    if (mask && !mask((i + 0.5) / nd, (j + 0.5) / na)) continue;
    const a = i * (na + 1) + j, b = a + na + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/** Lifting surface with an airfoil section; aChord attribute (0 = leading edge) for the metal strip. */
const surface = (rootLE: number, rootTE: number, tipLE: number, tipTE: number, span: number, rootT: number, tipT: number, dihedral: number) => {
  const NS = 24, NC = 28;
  const pos: number[] = [], chord: number[] = [], spanA: number[] = [], sideA: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const k = i / NS;
    const le = rootLE + (tipLE - rootLE) * k, te = rootTE + (tipTE - rootTE) * k;
    const t = rootT + (tipT - rootT) * k;
    for (let side = 0; side < 2; side++)
      for (let j = 0; j <= NC; j++) {
        const c = j / NC;
        const cc = side === 0 ? c : 1 - c;
        const x = le + (te - le) * cc;
        const thick = t * 5 * (0.2969 * Math.sqrt(cc) - 0.126 * cc - 0.3516 * cc * cc + 0.2843 * cc ** 3 - 0.1036 * cc ** 4);
        const camber = t * 0.25 * Math.sin(Math.PI * cc);
        const y = (side === 0 ? thick : -thick) + camber + span * k * Math.tan(dihedral);
        pos.push(-x, y, span * k);
        chord.push(cc); spanA.push(k); sideA.push(side);
      }
  }
  const row = (NC + 1) * 2;
  for (let i = 0; i < NS; i++) for (let j = 0; j < row - 1; j++) { const a = i * row + j, b = a + row; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aChord', new THREE.Float32BufferAttribute(chord, 1));
  g.setAttribute('aSpan', new THREE.Float32BufferAttribute(spanA, 1));
  g.setAttribute('aLower', new THREE.Float32BufferAttribute(sideA, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

const lathe = (pts: number[][], seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

const paintChunk = /* glsl */ `
  {
    float d = vHullUv.x;  // metres from the nose
    float a = vHullUv.y;  // around the hull, 0..1 (0 = top)
    float side = abs(sin(a * 6.2831853));
    float y = cos(a * 6.2831853);
    // cheatline: gold band with a thin navy line under it, along the cabin
    float band = smoothstep(.022, .006, abs(y + .14 + (d - 9.) * .003)) * step(2.6, d) * step(d, 17.5) * step(.4, side);
    float navy = smoothstep(.012, .0, abs(y + .2 + (d - 9.) * .003)) * step(3.2, d) * step(d, 16.8) * step(.4, side);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .44, .17), band);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.03, .05, .14), navy);
    // panel lines: frames every 0.56 m and a couple of stringers, very fine
    float fl = smoothstep(.012, .0, abs(fract(d / .56) - .5) - .488) * step(3.8, d) * step(d, 18.);
    float st = smoothstep(.0025, .0, abs(fract(a * 8.) - .5) - .497);
    // main door outline, left side
    vec2 dp = vec2(d - 4.7, y - .05);
    float door = smoothstep(.02, .0, abs(max(abs(dp.x) - .42, abs(dp.y) - .62) )) * step(.0, sin(a * 6.2831853));
    float lines = clamp(fl * .5 + st * .25 + door, 0., 1.);
    diffuseColor.rgb *= 1. - lines * .45;
    roughnessFactor = mix(roughnessFactor, .5, lines);
    metalnessFactor = mix(metalnessFactor, 1., band);
  }`;

export const JetV2: React.FC<{ gear?: number; strobe?: number; beacon?: number; exhaust?: number; landingLight?: number }> = ({
  gear = 1, strobe = 0, beacon = 0, exhaust = 0.4, landingLight = 1,
}) => {
  const m = useMemo(() => {
    const paint = new THREE.MeshPhysicalMaterial({ color: '#f3f1ec', roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.0, specularIntensity: 0.6 });
    paint.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHullUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHullUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vHullUv;').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + paintChunk);
    };
    paint.customProgramCacheKey = () => 'jetpaint';
    const plain = new THREE.MeshPhysicalMaterial({ color: '#f3f1ec', roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.0 });
    const wing = new THREE.MeshPhysicalMaterial({ color: '#e6e5e1', roughness: 0.28, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.06, envMapIntensity: 1.0 });
    wing.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aChord, aSpan, aLower; varying float vChord, vSpan, vLower;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvChord = aChord; vSpan = aSpan; vLower = aLower;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vChord, vSpan, vLower;').replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        {
          // panels: span-wise skin joints, the spar lines, flap-track fairings under the trailing edge,
          // and a soft occlusion toward the wing root (all stronger on the underside)
          float joints = smoothstep(.006, .0, abs(fract(vSpan * 9.) - .5) - .494);
          float spars = smoothstep(.004, .0, abs(vChord - .18)) + smoothstep(.004, .0, abs(vChord - .62));
          float tracks = 0.;
          for (int i = 0; i < 3; i++) { float sp = .28 + float(i) * .2; tracks += smoothstep(.035, .022, abs(vSpan - sp)) * smoothstep(.6, .68, vChord); }
          diffuseColor.rgb *= 1. - .05 * vLower * step(.5, fract(vSpan * 4.5));
          float lines = clamp(joints * .7 + spars * .5, 0., 1.) * (.35 + .65 * vLower);
          diffuseColor.rgb *= 1. - .35 * lines;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.42, .43, .46), clamp(tracks, 0., 1.) * vLower);
          diffuseColor.rgb *= mix(1., mix(.5, 1., smoothstep(.0, .22, vSpan)), vLower);
          diffuseColor.rgb *= mix(1., .82 + .18 * smoothstep(1., .3, vChord), vLower);
          roughnessFactor = mix(roughnessFactor, .45, vLower * .6);
        }
        float le = smoothstep(.075, .055, vChord);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.82, .83, .86), le); metalnessFactor = mix(metalnessFactor, 1., le); roughnessFactor = mix(roughnessFactor, .14, le);
        float flap = smoothstep(.005, .0, abs(vChord - .78)) * .6; diffuseColor.rgb *= 1. - flap * .5;`);
    };
    wing.customProgramCacheKey = () => 'jetwing';
    const chrome = new THREE.MeshStandardMaterial({ color: '#e4e6ea', metalness: 1, roughness: 0.1, envMapIntensity: 1.3 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: '#34373e', metalness: 0.85, roughness: 0.38, envMapIntensity: 0.9 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#06080d', metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: 1.8, specularIntensity: 1 });
    const frame = new THREE.MeshStandardMaterial({ color: '#1c1e22', metalness: 0.3, roughness: 0.4 });
    const tyre = new THREE.MeshStandardMaterial({ color: '#0c0c0d', roughness: 0.82, metalness: 0 });
    const fan = new THREE.MeshStandardMaterial({ color: '#2a2c31', metalness: 0.9, roughness: 0.3, envMapIntensity: 0.8 });
    fan.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPL;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPL = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPL;').replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float ang = atan(vPL.y, vPL.z); float rr = length(vPL.yz);
        float blades = smoothstep(.35, .5, fract(ang * 22. / 6.2831 + rr * 1.3));
        diffuseColor.rgb *= mix(.35, 1., blades) * smoothstep(.06, .12, rr);`);
    };
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.25, 0.15) });
    const green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 5, 1) });
    const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 6.8, 6.4) });
    const exhaustM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.45), side: THREE.DoubleSide });
    return { paint, plain, wing, chrome, darkMetal, glass, frame, tyre, fan, red, green, white, exhaustM };
  }, []);

  const g = useMemo(() => {
    const fus = fuselageGeo();
    // windshield: four panes either side of a centre post, plus frames
    const wsMask = (u: number, v: number) => Math.abs(v - 0.5) > 0.06 && !(Math.abs(v - 0.25) < 0.025 || Math.abs(v - 0.75) < 0.025);
    const windshield = hullPatch(2.35, 3.55, -1.05, 1.05, 0.006, 14, 40, wsMask);
    const wsFrame = hullPatch(2.28, 3.62, -1.12, 1.12, 0.003, 14, 40);
    // cabin windows: inset dark glass ovals with chrome rims, both sides
    const winGlass: THREE.BufferGeometry[] = [], winRim: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const d = 5.2 + i * 0.95;
      for (const s of [1, -1]) {
        const a = s * 1.12;
        const p = hull(d, a, 0.004);
        const n = new THREE.Vector3(0, Math.cos(a) * 1.035, Math.sin(a)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const gg = new THREE.CircleGeometry(0.2, 28).scale(1, 1.32, 1).applyQuaternion(q).translate(p.x, p.y, p.z);
        const rr = new THREE.TorusGeometry(0.2, 0.025, 6, 28).scale(1, 1.32, 0.4).applyQuaternion(q).translate(p.x, p.y, p.z);
        winGlass.push(gg); winRim.push(rr);
      }
    }
    const wingG = surface(-1.4, 3.0, 2.6, 3.9, 9.4, 0.13, 0.09, THREE.MathUtils.degToRad(3.2));
    const hstab = surface(-0.1, 1.5, 1.35, 2.2, 3.4, 0.1, 0.08, THREE.MathUtils.degToRad(1));
    const fin = surface(-0.3, 2.7, 2.2, 3.3, 3.8, 0.11, 0.09, 0);
    const winglet = surface(0, 0.95, 0.7, 1.3, 1.35, 0.08, 0.06, 0);
    const nacelle = lathe([[0.001, -0.05], [0.42, 0], [0.56, 0.18], [0.6, 0.6], [0.6, 1.9], [0.55, 2.7], [0.44, 3.25], [0.4, 3.3]]).rotateZ(Math.PI / 2);
    const lip = new THREE.TorusGeometry(0.5, 0.075, 12, 48).rotateY(Math.PI / 2);
    const fanG = new THREE.CircleGeometry(0.46, 48).rotateY(Math.PI / 2);
    const cone = lathe([[0.36, 0], [0.3, 0.25], [0.12, 0.55], [0.001, 0.62]], 32).rotateZ(-Math.PI / 2);
    const pylon = surface(0, 1.6, 0.3, 1.4, 0.85, 0.16, 0.14, 0);
    const fairing = new THREE.SphereGeometry(1, 32, 16).scale(2.8, 0.42, 0.95);
    const flapPod = new THREE.SphereGeometry(1, 16, 8).scale(0.8, 0.13, 0.11);
    const bullet = new THREE.SphereGeometry(1, 20, 10).scale(1.1, 0.22, 0.2);
    // landing gear parts
    const strut = new THREE.CylinderGeometry(0.09, 0.09, 1.25, 14);
    const oleo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 12);
    const wheel = mergeGeometries([new THREE.TorusGeometry(0.3, 0.12, 12, 28), new THREE.CylinderGeometry(0.22, 0.22, 0.2, 24).rotateX(Math.PI / 2)].map((x) => { const y = x.toNonIndexed(); y.deleteAttribute('uv'); return y; }))!;
    const hub = new THREE.CylinderGeometry(0.15, 0.15, 0.24, 20).rotateX(Math.PI / 2);
    const door = new THREE.BoxGeometry(1.1, 0.04, 0.55);
    const light = new THREE.SphereGeometry(0.065, 12, 8);
    return { fus, windshield, wsFrame, winGlass: mergeGeometries(winGlass)!, winRim: mergeGeometries(winRim)!, wingG, hstab, fin, winglet, nacelle, lip, fanG, cone, pylon, fairing, flapPod, bullet, strut, oleo, wheel, hub, door, light };
  }, []);

  const retract = 1 - gear;
  const mainRot = retract * 1.52;
  const wingSide = (s: number) => (
    <group position={[1.9, -0.72, s * 0.72]} scale={[1, 1, s]}>
      <mesh geometry={g.wingG} material={m.wing} />
      <group position={[-2.6, 9.4 * Math.tan(THREE.MathUtils.degToRad(3.2)) + 0.02, 9.35]} rotation={[0.32, 0, 0]}>
        <mesh geometry={g.winglet} material={m.wing} rotation={[-Math.PI / 2, 0, 0]} />
      </group>
      <mesh geometry={g.light} material={s > 0 ? m.red : m.green} position={[-2.75, 0.58, 9.55]} />
      <mesh geometry={g.light} material={m.white} position={[-3.55, 0.56, 9.5]} scale={0.5 + strobe * 1.4} />
    </group>
  );
  const engine = (s: number) => (
    <group key={s} position={[-4.7, 0.82, s * 1.82]}>
      <mesh geometry={g.nacelle} material={m.plain} position={[1.65, 0, 0]} />
      <mesh geometry={g.lip} material={m.chrome} position={[1.68, 0, 0]} />
      <mesh geometry={g.fanG} material={m.fan} position={[1.45, 0, 0]} />
      <mesh geometry={g.cone} material={m.darkMetal} position={[-1.6, 0, 0]} />
      <mesh geometry={g.fanG} material={m.exhaustM} position={[-1.62, 0, 0]} scale={0.8 + exhaust * 0.0} rotation={[0, Math.PI, 0]} />
      <group position={[0.75, -0.02, -s * 0.55]} rotation={[s > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0]}>
        <mesh geometry={g.pylon} material={m.plain} />
      </group>
    </group>
  );
  const mainGear = (s: number) => (
    <group key={s} position={[-0.2, -0.95, s * 1.95]} rotation={[s * mainRot, 0, 0]}>
      <mesh geometry={g.strut} material={m.darkMetal} position={[0, -0.55, 0]} />
      <mesh geometry={g.oleo} material={m.chrome} position={[0, -1.0, 0]} />
      {[-0.22, 0.22].map((dz) => (
        <group key={dz} position={[0, -1.3, dz]}>
          <mesh geometry={g.wheel} material={m.tyre} />
          <mesh geometry={g.hub} material={m.chrome} scale={[1, 1, 1.02]} />
        </group>
      ))}
    </group>
  );
  return (
    <group>
      <mesh geometry={g.fus} material={m.paint} />
      <mesh geometry={g.wsFrame} material={m.frame} />
      <mesh geometry={g.windshield} material={m.glass} />
      <mesh geometry={g.winGlass} material={m.glass} />
      <mesh geometry={g.winRim} material={m.chrome} />
      <mesh geometry={g.fairing} material={m.plain} position={[0.9, -0.86, 0]} />
      {wingSide(1)}
      {wingSide(-1)}
      <group position={[-6.7, 0.55, 0]}>
        <mesh geometry={g.fin} material={m.wing} rotation={[-Math.PI / 2, 0, 0]} />
        <group position={[-2.3, 3.7, 0]}>
          <mesh geometry={g.hstab} material={m.wing} />
          <mesh geometry={g.hstab} material={m.wing} scale={[1, 1, -1]} />
          <mesh geometry={g.bullet} material={m.plain} position={[-0.9, 0.05, 0]} />
          <mesh geometry={g.light} material={m.white} position={[-2.0, 0.08, 0]} scale={0.6 + strobe} />
        </group>
      </group>
      {engine(1)}
      {engine(-1)}
      <mesh geometry={g.light} material={m.red} position={[1.5, 1.22, 0]} scale={0.8 + beacon * 1.4} />
      <mesh geometry={g.light} material={m.red} position={[0.5, -1.21, 0]} scale={0.8 + beacon * 1.4} />
      {/* nose gear */}
      <group position={[7.6, -0.95, 0]} rotation={[0, 0, -retract * 1.5]}>
        <mesh geometry={g.strut} material={m.darkMetal} position={[0, -0.5, 0]} scale={[0.8, 0.9, 0.8]} />
        <mesh geometry={g.oleo} material={m.chrome} position={[0, -0.95, 0]} scale={[0.8, 0.6, 0.8]} />
        {[-0.16, 0.16].map((dz) => (
          <group key={dz} position={[0, -1.12, dz]} scale={0.72}>
            <mesh geometry={g.wheel} material={m.tyre} />
            <mesh geometry={g.hub} material={m.chrome} />
          </group>
        ))}
        <mesh geometry={g.light} material={m.white} position={[0.12, -0.35, 0]} scale={0.6 + landingLight * 0.6} />
      </group>
      {mainGear(1)}
      {mainGear(-1)}
    </group>
  );
};
