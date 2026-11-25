import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A generic Rajasthani lakeside palace (not any real building or hotel), built as real geometry:
 * plinth and ghat steps into the lake, three storeys with arched openings (lit interiors set back
 * for depth), cornices, kanguras, jharokhas, a central domed pavilion, octagonal corner towers and
 * chhatris. Returns merged geometries per material. Front faces +z; plinth top at y = PLINTH.
 */
export const PLINTH = 2.6;

type G = THREE.BufferGeometry;
const at = (g: G, x: number, y: number, z: number) => g.translate(x, y, z);
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z);
const cyl = (r0: number, r1: number, h: number, seg: number, x: number, y: number, z: number) => at(new THREE.CylinderGeometry(r0, r1, h, seg), x, y + h / 2, z);

const archPath = (p: THREE.Path | THREE.Shape, cx: number, y0: number, w: number, h: number) => {
  const spring = y0 + h - w * 0.62;
  const apex = y0 + h;
  p.moveTo(cx - w / 2, y0);
  p.lineTo(cx - w / 2, spring);
  p.bezierCurveTo(cx - w / 2, spring + (apex - spring) * 0.55, cx - w * 0.16, apex - (apex - spring) * 0.12, cx, apex);
  p.bezierCurveTo(cx + w * 0.16, apex - (apex - spring) * 0.12, cx + w / 2, spring + (apex - spring) * 0.55, cx + w / 2, spring);
  p.lineTo(cx + w / 2, y0);
  p.lineTo(cx - w / 2, y0);
};

/** A wall slab (front face at zFront) with arched openings; also returns glowing panels set back behind them. */
const arcadeWall = (x0: number, x1: number, y0: number, y1: number, zFront: number, depth: number, n: number, aw: number, ah: number, sill: number, rnd: () => number) => {
  const s = new THREE.Shape();
  s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.lineTo(x0, y0);
  const glows: G[] = [];
  const reveals: G[] = [];
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const cx = x0 + step * (i + 0.5);
    const hole = new THREE.Path();
    archPath(hole, cx, y0 + sill, aw, ah);
    s.holes.push(hole);
    // lit interior behind the opening (varied: most lit warm, a few dim)
    const lit = rnd();
    const g = new THREE.ShapeGeometry((() => { const sh = new THREE.Shape(); archPath(sh, cx, y0 + sill, aw * 1.25, ah * 1.08); return sh; })());
    g.translate(0, 0, zFront - depth - 1.6);
    const col = new Float32Array(g.attributes.position.count * 3);
    const k = lit > 0.18 ? 0.55 + 0.6 * rnd() : 0.08;
    for (let v = 0; v < g.attributes.position.count; v++) {
      const yy = (g.attributes.position.getY(v) - (y0 + sill)) / ah;
      const f = k * (1.15 - 0.55 * yy);
      col.set([f * 1.0, f * 0.62, f * 0.3], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    glows.push(g);
    // reveal (the opening's inner sides), a short tunnel so the depth reads
    const rv = new THREE.ExtrudeGeometry((() => { const sh = new THREE.Shape(); archPath(sh, cx, y0 + sill, aw + 0.3, ah + 0.18); const h = new THREE.Path(); archPath(h, cx, y0 + sill, aw, ah); sh.holes.push(h); return sh; })(), { depth: 1.6, bevelEnabled: false, curveSegments: 10 });
    rv.translate(0, 0, zFront - depth - 1.6);
    reveals.push(rv);
  }
  const wall = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
  wall.translate(0, 0, zFront - depth);
  return { wall, glows, reveals };
};

const onion = (r: number, h: number) => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const y = t * h;
    const bulge = Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.22;
    const rr = r * Math.max(0, Math.cos(t * Math.PI * 0.5) ** 0.75 + bulge * (1 - t));
    pts.push(new THREE.Vector2(Math.max(rr, 0.001), y));
  }
  return new THREE.LatheGeometry(pts, 40);
};

const finial = (s: number) => {
  const pts = [[0, 0], [0.18, 0], [0.22, 0.25], [0.12, 0.45], [0.3, 0.7], [0.12, 1.0], [0.06, 1.3], [0.12, 1.45], [0.02, 1.9], [0.0, 1.95]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  return new THREE.LatheGeometry(pts, 16);
};

/** Domed kiosk on pillars: returns parts per material. */
const chhatri = (x: number, y: number, z: number, r: number, cols = 4) => {
  const stone: G[] = [], plaster: G[] = [], gold: G[] = [];
  stone.push(cyl(r * 1.25, r * 1.25, 0.25, cols * 2, x, y, z));
  for (let i = 0; i < cols; i++) {
    const a = (i / cols) * Math.PI * 2 + Math.PI / cols;
    stone.push(cyl(r * 0.09, r * 0.11, r * 1.3, 8, x + Math.cos(a) * r * 0.95, y + 0.25, z + Math.sin(a) * r * 0.95));
  }
  stone.push(cyl(r * 1.42, r * 1.1, r * 0.22, cols * 4, x, y + 0.25 + r * 1.3, z)); // chajja (eave)
  plaster.push(at(onion(r * 1.02, r * 1.35), x, y + 0.25 + r * 1.52, z));
  gold.push(at(finial(r * 0.55), x, y + 0.25 + r * 1.52 + r * 1.3, z));
  return { stone, plaster, gold };
};

const kanguras = (x0: number, x1: number, y: number, z: number, spacing: number, size: number) => {
  const gs: G[] = [];
  for (let x = x0 + spacing / 2; x < x1; x += spacing) {
    gs.push(box(size, size * 0.9, size * 0.5, x, y, z));
    gs.push(at(new THREE.SphereGeometry(size * 0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), x, y + size * 0.9, z));
  }
  return gs;
};

export type PalaceGeo = { plaster: G; stone: G; gold: G; glow: G; lamps: THREE.Vector3[]; width: number };

export const buildPalace = (seed = 7): PalaceGeo => {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
  const plaster: G[] = [], stone: G[] = [], gold: G[] = [], glow: G[] = [];
  const lamps: THREE.Vector3[] = [];
  const W = 74, D = 22, P = PLINTH;
  const zF = D / 2;
  // plinth and ghats (steps into the lake)
  stone.push(box(W + 14, P + 3, D + 8, 0, -3, -2));
  for (let i = 0; i < 9; i++) stone.push(box(W + 12 - i * 0.2, 0.32, 0.7, 0, P - 0.32 * (i + 1), D / 2 + 2 + 0.7 * i));
  // three storeys of arcades on the front; plain walls elsewhere
  const storeys = [
    { y: P, h: 6.4, n: 11, aw: 3.6, ah: 4.8, sill: 0.0 },
    { y: P + 6.4, h: 5.4, n: 15, aw: 2.2, ah: 3.4, sill: 0.9 },
    { y: P + 11.8, h: 4.4, n: 19, aw: 1.6, ah: 2.5, sill: 0.9 },
  ];
  for (const st of storeys) {
    const { wall, glows, reveals } = arcadeWall(-W / 2, W / 2, st.y, st.y + st.h, zF, 0.9, st.n, st.aw, st.ah, st.sill, rnd);
    plaster.push(wall); plaster.push(...reveals); glow.push(...glows);
    // cornice + chajja at the top of the storey
    stone.push(box(W + 1.2, 0.35, 1.4, 0, st.y + st.h - 0.35, zF + 0.3));
    stone.push(box(W + 1.8, 0.18, 1.9, 0, st.y + st.h - 0.55, zF + 0.55));
  }
  // body behind the facade
  plaster.push(box(W, 16.2, D - 3.2, 0, P, -1.6)); // body set back so the lit interiors show through the arches
  // parapet and kanguras
  const top = P + 16.2;
  plaster.push(box(W + 1, 1.0, 0.6, 0, top, zF - 0.2));
  stone.push(...kanguras(-W / 2, W / 2, top + 1.0, zF - 0.2, 1.3, 0.55));
  // pillars between ground-floor arches
  for (let i = 0; i <= 11; i++) {
    const x = -W / 2 + (W / 11) * i;
    stone.push(cyl(0.32, 0.38, 6.0, 12, x, P, zF + 0.35));
  }
  // jharokhas (projecting balconies) on the first floor
  for (let i = 0; i < 7; i++) {
    const x = -W / 2 + 5 + i * ((W - 10) / 6);
    stone.push(box(3.4, 0.4, 1.6, x, P + 6.6, zF + 0.8));            // floor slab on brackets
    stone.push(box(3.0, 1.0, 0.25, x, P + 7.0, zF + 1.5));           // parapet
    for (const dx of [-1.3, 1.3]) stone.push(cyl(0.12, 0.12, 2.6, 8, x + dx, P + 7.0, zF + 1.45));
    stone.push(box(3.8, 0.22, 2.0, x, P + 9.6, zF + 0.9));           // roof slab
    plaster.push(at(new THREE.CylinderGeometry(1.0, 1.0, 3.5, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.55, 1), x, P + 9.82, zF + 0.9)); // bangaldar roof
    gold.push(at(finial(0.35), x, P + 10.35, zF + 0.9));
  }
  // central pavilion: projecting, one storey taller, big onion dome on a drum
  const cw = 20;
  plaster.push(box(cw, 4.8, 6, 0, top, zF - 3.5));
  {
    const { wall, glows, reveals } = arcadeWall(-cw / 2, cw / 2, top, top + 4.8, zF - 0.5, 0.8, 5, 2.0, 3.0, 0.6, rnd);
    plaster.push(wall); plaster.push(...reveals); glow.push(...glows);
  }
  stone.push(box(cw + 1.4, 0.35, 1.4, 0, top + 4.8, zF - 0.2));
  stone.push(...kanguras(-cw / 2, cw / 2, top + 5.15, zF - 0.6, 1.2, 0.5));
  plaster.push(cyl(5.2, 5.4, 3.2, 40, 0, top + 4.8, zF - 4.5));            // drum
  stone.push(cyl(5.7, 5.7, 0.35, 40, 0, top + 8.0, zF - 4.5));
  plaster.push(at(onion(5.6, 8.4), 0, top + 8.3, zF - 4.5));
  gold.push(at(finial(1.6), 0, top + 15.9, zF - 4.5));
  for (const dx of [-8, 8]) {
    const c = chhatri(dx, top + 4.8, zF - 2, 1.6, 4);
    stone.push(...c.stone); plaster.push(...c.plaster); gold.push(...c.gold);
  }
  // secondary domes
  for (const dx of [-22, 22]) {
    plaster.push(cyl(3.0, 3.1, 2.0, 32, dx, top, zF - 6));
    plaster.push(at(onion(3.3, 5.0), dx, top + 2.0, zF - 6));
    gold.push(at(finial(1.0), dx, top + 6.8, zF - 6));
  }
  // rooftop chhatris along the parapet
  for (const dx of [-31, -14, 14, 31]) {
    const c = chhatri(dx, top + 1.0, zF - 1.5, 1.2, 4);
    stone.push(...c.stone); plaster.push(...c.plaster); gold.push(...c.gold);
  }
  // octagonal corner towers with chhatris
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 2.6);
    plaster.push(cyl(3.4, 3.8, top + 3.5 - P, 8, x, P, zF - 2.5));
    stone.push(cyl(4.1, 4.1, 0.4, 8, x, top + 3.5, zF - 2.5));
    stone.push(...kanguras(x - 3, x + 3, top + 3.9, zF + 0.9, 1.2, 0.5));
    for (let k = 0; k < 4; k++) {
      const { wall, glows, reveals } = arcadeWall(x - 1.6, x + 1.6, P + 2 + k * 4.5, P + 5.8 + k * 4.5, zF + 0.95, 0.6, 1, 1.4, 2.6, 0.4, rnd);
      plaster.push(wall); plaster.push(...reveals); glow.push(...glows);
    }
    const c = chhatri(x, top + 3.9, zF - 2.5, 2.4, 6);
    stone.push(...c.stone); plaster.push(...c.plaster); gold.push(...c.gold);
  }
  // lamp posts along the ghat edge (warm lights)
  for (let i = 0; i <= 12; i++) lamps.push(new THREE.Vector3(-W / 2 - 4 + i * ((W + 8) / 12), P + 1.4, zF + 2.2));
  const nonIndexed = (gs: G[]) => mergeGeometries(gs.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  }), false)!;
  return { plaster: nonIndexed(plaster), stone: nonIndexed(stone), gold: nonIndexed(gold), glow: nonIndexed(glow), lamps, width: W };
};
