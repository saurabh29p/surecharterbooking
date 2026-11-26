import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import logo from '../data/logo.json';

/**
 * Geometry of the Vaanika mark in 3D, from the exact path data in design/logo/svg (via
 * scripts/sync-logo.mjs): each element extruded from its own outline. Shared by the film
 * (LogoMark3D) and the website export (scripts/export-gltf.mjs).
 */
export type MarkName = 'saraswati' | 'lakshmi' | 'kali' | 'chandra' | 'base';
export type El = { name: MarkName; d: string; fill?: string; stroke?: string; 'stroke-width'?: string; 'stroke-linecap'?: string };
export const ELS = logo.mark as El[];
const SW = 2.4; // stroke width used by the file

export const PIVOTS: Record<MarkName, [number, number]> = {
  saraswati: [94, 166], lakshmi: [100, 164], kali: [106, 166], chandra: [100, 17], base: [100, 188],
};

const parseOutline = (d: string) => {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
  const shape = SVGLoader.createShapes(data.paths[0])[0];
  const pts = shape.getPoints(96);
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  return pts;
};
const area = (p: THREE.Vector2[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
const offsetOutward = (pts: THREE.Vector2[], w: number) => {
  const p = area(pts) < 0 ? [...pts].reverse() : pts;
  const n = p.length;
  return p.map((pt, i) => {
    const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
    const e1 = pt.clone().sub(a).normalize(), e2 = b.clone().sub(pt).normalize();
    const n1 = new THREE.Vector2(e1.y, -e1.x), n2 = new THREE.Vector2(e2.y, -e2.x);
    const m = n1.clone().add(n2).normalize();
    const len = w / Math.max(m.dot(n1), 0.25); // miter (limit 4, as SVG)
    return pt.clone().add(m.multiplyScalar(len));
  });
};
const strokeOutline = (d: string, w: number) => {
  const nums = d.match(/-?[\d.]+/g)!.map(Number); // M x0 y0 Q x1 y1 x2 y2
  const P0 = new THREE.Vector2(nums[0], nums[1]), P1 = new THREE.Vector2(nums[2], nums[3]), P2 = new THREE.Vector2(nums[4], nums[5]);
  const B = (t: number) => P0.clone().multiplyScalar((1 - t) ** 2).add(P1.clone().multiplyScalar(2 * (1 - t) * t)).add(P2.clone().multiplyScalar(t * t));
  const T = (t: number) => P1.clone().sub(P0).multiplyScalar(2 * (1 - t)).add(P2.clone().sub(P1).multiplyScalar(2 * t)).normalize();
  const N = 64, h = w / 2;
  const left: THREE.Vector2[] = [], right: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, b = B(t), tn = T(t), nn = new THREE.Vector2(-tn.y, tn.x);
    left.push(b.clone().add(nn.clone().multiplyScalar(h)));
    right.push(b.clone().sub(nn.clone().multiplyScalar(h)));
  }
  const cap = (c: THREE.Vector2, dir: THREE.Vector2, from: THREE.Vector2) => {
    const out: THREE.Vector2[] = [];
    const a0 = Math.atan2(from.y - c.y, from.x - c.x);
    const turn = Math.sign(dir.x * (from.y - c.y) - dir.y * (from.x - c.x)) || 1;
    for (let i = 1; i < 16; i++) { const a = a0 - turn * (Math.PI * i) / 16; out.push(new THREE.Vector2(c.x + Math.cos(a) * h, c.y + Math.sin(a) * h)); }
    return out;
  };
  return [...left, ...cap(P2, T(1), left[N]), ...right.reverse(), ...cap(P0, T(0).negate(), right[right.length - 1])];
};

const outlineFor = (el: El) => {
  if (el.name === 'base') return strokeOutline(el.d, SW);
  const pts = parseOutline(el.d);
  return el.name === 'kali' ? offsetOutward(pts, SW / 2) : pts;
};

export const elementSvg = (el: El, box: { x: number; y: number; w: number; h: number }, px: number) => {
  const attrs = Object.entries(el).filter(([k]) => k !== 'name').map(([k, v]) => `${k}="${v}"`).join(' ');
  const paint = el.fill && el.fill !== 'none' ? el.fill : el.stroke!;
  const dil = `<path d="${el.d}" fill="none" stroke="${el.name === 'kali' ? el.stroke : paint}" stroke-width="${el.name === 'base' || el.name === 'kali' ? SW + 4 : 4}" stroke-linejoin="round" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(box.w * px)}" height="${Math.round(box.h * px)}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}">${logo.stacked.defs}${dil}<path ${attrs}/></svg>`;
};


export type MarkGeometry = { name: MarkName; geo: THREE.ExtrudeGeometry; box: { x: number; y: number; w: number; h: number } };

/** Extruded geometry per element, centred on its pivot, front face at z = 0; aSvg holds SVG coordinates. */
export const buildMarkGeometry = (el: El): MarkGeometry => {
  const pts = outlineFor(el);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const box = { x: Math.min(...xs) - 3, y: Math.min(...ys) - 3, w: Math.max(...xs) - Math.min(...xs) + 6, h: Math.max(...ys) - Math.min(...ys) + 6 };
  const [px, py] = PIVOTS[el.name];
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x - px, -(p.y - py))));
  const bev = el.name === 'chandra' || el.name === 'base' ? 0.3 : 0.55;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: true, bevelThickness: 0.9, bevelSize: bev, bevelOffset: -bev, bevelSegments: 3, curveSegments: 64 });
  geo.computeBoundingBox();
  geo.translate(0, 0, -geo.boundingBox!.max.z);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const svgXY = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { svgXY[i * 2] = pos.getX(i) + px; svgXY[i * 2 + 1] = -pos.getY(i) + py; }
  geo.setAttribute('aSvg', new THREE.BufferAttribute(svgXY, 2));
  return { name: el.name, geo, box };
};
