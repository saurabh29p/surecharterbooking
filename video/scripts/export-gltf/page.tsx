/**
 * Runs in headless Chromium (see ../export-gltf.mjs): builds the film's procedural models from
 * src/models, bakes each into a few meshes per material (one draw call per material), and returns
 * them as GLB files for the website. Names, the livery shaders and the logo's own SVG elements travel
 * in the glTF (mesh names, material names, extras), so the site draws the same aircraft and the same
 * mark as the film.
 */
import React from 'react';
import * as THREE from 'three';
import { createRoot, extend } from '@react-three/fiber';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { JetV2, hull } from '../../src/models/JetV2';
import { HeliV2 } from '../../src/models/HeliV2';
import { buildPalace, PLINTH } from '../../src/models/palace3d';
import { buildMarkGeometry, ELS, elementSvg, PIVOTS } from '../../src/models/logoGeometry';

extend(THREE as unknown as Record<string, unknown>);

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material; mesh: THREE.Mesh };

/** Render a model component once with r3f and return its root object. */
const mount = (el: React.ReactElement) =>
  new Promise<THREE.Object3D>((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const root = createRoot(canvas);
    void Promise.resolve(root.configure({ frameloop: 'never', events: undefined })).then(() =>
      root.render(<group ref={(g) => g && setTimeout(() => resolve(g), 0)}>{el}</group>),
    );
  });

/** Every mesh with its world matrix baked into a non-indexed copy of its geometry. */
const parts = (root: THREE.Object3D, skip: (m: THREE.Mesh) => boolean, rel?: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  const inv = rel ? rel.matrixWorld.clone().invert() : new THREE.Matrix4();
  const out: Part[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skip(m)) return;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    // flip winding where the transform mirrors (e.g. scale z = -1 for the left wing)
    if (new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld).determinant() < 0) {
      for (const a of Object.values(g.attributes)) {
        const arr = a.array as Float32Array, s = a.itemSize;
        for (let i = 0; i < arr.length; i += s * 3) for (let k = 0; k < s; k++) { const t = arr[i + s + k]; arr[i + s + k] = arr[i + 2 * s + k]; arr[i + 2 * s + k] = t; }
      }
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    out.push({ geo: g, mat, mesh: m });
  });
  return out;
};

/** Keep only what the site's materials read: position, normal; uv for the livery; colour for glows. */
const slim = (g: THREE.BufferGeometry, keepUv: boolean, uvLength = 1) => {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', ...(keepUv ? ['uv'] : []), 'color'].includes(k)) g.deleteAttribute(k);
  if (keepUv && g.attributes.uv && uvLength !== 1) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) / uvLength);
  }
  return g;
};

/** Plain glTF-safe copy of a material: PBR values only, HDR colours folded into emissive. */
const cleanMat = (m: THREE.Material) => {
  const src = m as THREE.MeshPhysicalMaterial;
  const c = src.color ?? new THREE.Color(1, 1, 1);
  const peak = Math.max(c.r, c.g, c.b);
  const basic = (m as THREE.MeshBasicMaterial).isMeshBasicMaterial;
  const out = new THREE.MeshPhysicalMaterial({
    name: m.name,
    color: peak > 1 ? c.clone().multiplyScalar(1 / peak) : c.clone(),
    roughness: basic ? 1 : src.roughness ?? 0.5,
    metalness: basic ? 0 : src.metalness ?? 0,
    clearcoat: src.clearcoat ?? 0,
    clearcoatRoughness: src.clearcoatRoughness ?? 0,
    transparent: m.transparent,
    opacity: m.opacity,
    side: m.side,
  });
  if (basic || peak > 1) { out.emissive = out.color.clone(); out.emissiveIntensity = Math.max(1, peak); }
  out.userData = { ...m.userData, ...(basic ? { unlit: true } : {}) };
  return out;
};

/** One mesh per material name, merged. */
const byMaterial = (ps: Part[], uvFor: (name: string) => number | null) => {
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  for (const p of ps) {
    const key = p.mat.name || 'unnamed';
    if (!groups.has(key)) groups.set(key, { mat: p.mat, geos: [] });
    const uv = uvFor(key);
    groups.get(key)!.geos.push(slim(p.geo, uv !== null, uv ?? 1));
  }
  const meshes: THREE.Mesh[] = [];
  for (const [name, { mat, geos }] of groups) {
    const g = mergeGeometries(geos, false);
    if (!g) throw new Error(`could not merge ${name}`);
    const mesh = new THREE.Mesh(g, cleanMat(mat));
    mesh.name = name;
    meshes.push(mesh);
  }
  return meshes;
};

const toGlb = (scene: THREE.Object3D) =>
  new Promise<string>((resolve, reject) =>
    new GLTFExporter().parse(
      scene,
      (r) => {
        const b = new Uint8Array(r as ArrayBuffer);
        let s = '';
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
        resolve(btoa(s));
      },
      reject,
      { binary: true, onlyVisible: true },
    ),
  );

const uvForLivery = (uvLength: number) => (name: string) => (name === 'paint' ? uvLength : null);

/** Jet (gear down) for the showroom, and a stretched regional-airliner variant for group charter. */
async function jets() {
  const root = await mount(<JetV2 gear={1} strobe={0} beacon={0} exhaust={0.1} landingLight={0} />);
  const ps = parts(root, () => false);
  const L = 21;
  const scene = new THREE.Group();
  scene.name = 'jet';
  for (const m of byMaterial(ps, uvForLivery(L))) scene.add(m);

  // Airliner: the same airframe stretched (a rear-engined regional jet shape), with a denser row of
  // smaller windows in place of the business jet's nine large ovals.
  const S = new THREE.Vector3(1.72, 1.32, 1.32);
  const isCabinWindow = (p: Part) => {
    p.geo.computeBoundingBox();
    const b = p.geo.boundingBox!;
    return (p.mat.name === 'glass' || p.mat.name === 'chrome') && b.max.x - b.min.x > 5;
  };
  const ps2 = parts(root, () => false).filter((p) => !isCabinWindow(p));
  const sm = new THREE.Matrix4().makeScale(S.x, S.y, S.z);
  for (const p of ps2) p.geo.applyMatrix4(sm);
  const glassW: THREE.BufferGeometry[] = [], rimW: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 24; i++) {
    const d = 4.7 + i * 0.46;
    for (const s of [1, -1]) {
      const a = s * 1.12;
      const p = hull(d, a, 0.004);
      const n = new THREE.Vector3(0, Math.cos(a) * 1.035, Math.sin(a)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const make = (g: THREE.BufferGeometry) => {
        g.scale(1 / S.x, 1.25 / S.y, 1).applyQuaternion(q).translate(p.x, p.y, p.z).applyMatrix4(sm);
        return g.index ? g.toNonIndexed() : g;
      };
      glassW.push(make(new THREE.CircleGeometry(0.15, 20).scale(1, 1.3, 1)));
      rimW.push(make(new THREE.TorusGeometry(0.15, 0.022, 5, 20).scale(1, 1.3, 0.4)));
    }
  }
  const glassMat = ps.find((p) => p.mat.name === 'glass')!.mat;
  const chromeMat = ps.find((p) => p.mat.name === 'chrome')!.mat;
  for (const g of glassW) { g.deleteAttribute('uv'); ps2.push({ geo: g, mat: glassMat, mesh: null as unknown as THREE.Mesh }); }
  for (const g of rimW) { g.deleteAttribute('uv'); ps2.push({ geo: g, mat: chromeMat, mesh: null as unknown as THREE.Mesh }); }
  const air = new THREE.Group();
  air.name = 'airliner';
  for (const m of byMaterial(ps2, uvForLivery(L))) air.add(m);
  air.userData = { scale: S.toArray() };
  return { jet: await toGlb(scene), airliner: await toGlb(air) };
}

/** Helicopter: static body, and the main rotor as its own node (spun by the site about its mast). */
async function heli() {
  const root = await mount(<HeliV2 rotorAngle={0} blur={0} />);
  root.updateMatrixWorld(true);
  const rotor = root.getObjectByName('rotor')!;
  const inRotor = (m: THREE.Mesh) => { let o: THREE.Object3D | null = m; while (o) { if (o === rotor) return true; o = o.parent; } return false; };
  const body = parts(root, (m) => inRotor(m) || m.name === 'rotorDisc');
  const blades = parts(rotor, (m) => m.name === 'rotorDisc', rotor);
  const scene = new THREE.Group();
  scene.name = 'helicopter';
  for (const m of byMaterial(body, uvForLivery(12.2))) scene.add(m);
  const r = new THREE.Group();
  r.name = 'rotor';
  r.position.setFromMatrixPosition(rotor.matrixWorld);
  for (const m of byMaterial(blades, () => null)) { m.name = `rotor-${m.name}`; r.add(m); }
  scene.add(r);
  return toGlb(scene);
}

/** The generic lakeside palace: plaster, stone, gold and the lit openings (vertex colours). */
async function palace() {
  const p = buildPalace(7);
  const scene = new THREE.Group();
  scene.name = 'palace';
  const mats: Record<string, THREE.MeshPhysicalMaterial> = {
    plaster: new THREE.MeshPhysicalMaterial({ name: 'plaster', color: '#ecd6b4', roughness: 0.82 }),
    stone: new THREE.MeshPhysicalMaterial({ name: 'stone', color: '#d9b78a', roughness: 0.88 }),
    gold: new THREE.MeshPhysicalMaterial({ name: 'gold', color: '#d9bc78', metalness: 1, roughness: 0.28 }),
    glow: new THREE.MeshPhysicalMaterial({ name: 'glow', color: '#ffffff', vertexColors: true }),
  };
  for (const k of ['plaster', 'stone', 'gold', 'glow'] as const) {
    let g = (p as unknown as Record<string, THREE.BufferGeometry>)[k];
    g = g.index ? g.toNonIndexed() : g.clone();
    // no normals: the palace is boxes and arches, drawn flat-shaded by the site
    for (const a of Object.keys(g.attributes)) if (!['position', ...(k === 'glow' ? ['color'] : [])].includes(a)) g.deleteAttribute(a);
    if (k === 'glow' && g.attributes.color) {
      // glTF colours are 0..1: store normalised, the site scales them back up
      const c = g.attributes.color as THREE.BufferAttribute;
      let peak = 0;
      for (let i = 0; i < c.array.length; i++) peak = Math.max(peak, c.array[i] as number);
      for (let i = 0; i < c.array.length; i++) (c.array as Float32Array)[i] /= peak || 1;
      mats.glow.userData = { colorScale: peak };
    }
    const m = new THREE.Mesh(g, mats[k]);
    m.name = k;
    scene.add(m);
  }
  scene.userData = { lamps: p.lamps.map((v) => v.toArray()), width: p.width, plinth: PLINTH };
  return toGlb(scene);
}

/** The mark: each element extruded from the logo file's own path, UVs over its own raster box. */
async function mark() {
  const scene = new THREE.Group();
  scene.name = 'mark';
  for (const el of ELS) {
    const { geo, box } = buildMarkGeometry(el);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    const svg = g.attributes.aSvg as THREE.BufferAttribute;
    const uv = new Float32Array(svg.count * 2);
    for (let i = 0; i < svg.count; i++) { uv[i * 2] = (svg.getX(i) - box.x) / box.w; uv[i * 2 + 1] = 1 - (svg.getY(i) - box.y) / box.h; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    for (const a of Object.keys(g.attributes)) if (!['position', 'uv'].includes(a)) g.deleteAttribute(a);
    // smooth across the bevel, sharp at the back edge (ExtrudeGeometry's own normals are per face)
    g = toCreasedNormals(g, THREE.MathUtils.degToRad(42));
    const mat = new THREE.MeshPhysicalMaterial({ name: el.name, color: '#ffffff' });
    // the element's own SVG (exact path, fill, stroke and gradients from the logo file), for the
    // site to rasterise as the face texture
    mat.userData = { svg: elementSvg(el, box, 1), box: [box.x, box.y, box.w, box.h] };
    const m = new THREE.Mesh(g, mat);
    m.name = el.name;
    m.userData = { pivot: PIVOTS[el.name] };
    scene.add(m);
  }
  return toGlb(scene);
}

declare global {
  interface Window { exportAll: () => Promise<Record<string, string>> }
}
window.exportAll = async () => {
  const j = await jets();
  return { jet: j.jet, airliner: j.airliner, helicopter: await heli(), palace: await palace(), mark: await mark() };
};
