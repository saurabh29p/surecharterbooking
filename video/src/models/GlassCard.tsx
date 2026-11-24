import React, { useEffect, useMemo, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import { loadFonts } from '../lib/fonts';
import { NOISE } from '../lib/glsl';

export type CardContent = { icon: 'shield' | 'doc' | 'receipt' | 'chat'; title: string; body: string };

const W = 1024, H = 1320;

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxW: number) => {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
};

const drawIcon = (ctx: CanvasRenderingContext2D, kind: CardContent['icon'], x: number, y: number, s: number) => {
  const grd = ctx.createLinearGradient(x, y, x + s, y + s);
  grd.addColorStop(0, '#F4E3B5'); grd.addColorStop(0.45, '#D9BC78'); grd.addColorStop(1, '#B8924A');
  ctx.strokeStyle = grd; ctx.lineWidth = s * 0.055; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const u = s / 100;
  if (kind === 'shield') {
    ctx.moveTo(x + 50 * u, y + 6 * u);
    ctx.bezierCurveTo(x + 66 * u, y + 16 * u, x + 80 * u, y + 18 * u, x + 90 * u, y + 18 * u);
    ctx.bezierCurveTo(x + 90 * u, y + 62 * u, x + 74 * u, y + 84 * u, x + 50 * u, y + 96 * u);
    ctx.bezierCurveTo(x + 26 * u, y + 84 * u, x + 10 * u, y + 62 * u, x + 10 * u, y + 18 * u);
    ctx.bezierCurveTo(x + 20 * u, y + 18 * u, x + 34 * u, y + 16 * u, x + 50 * u, y + 6 * u);
    ctx.moveTo(x + 32 * u, y + 50 * u); ctx.lineTo(x + 45 * u, y + 63 * u); ctx.lineTo(x + 69 * u, y + 37 * u);
  } else if (kind === 'doc') {
    ctx.moveTo(x + 22 * u, y + 6 * u); ctx.lineTo(x + 62 * u, y + 6 * u); ctx.lineTo(x + 80 * u, y + 24 * u); ctx.lineTo(x + 80 * u, y + 94 * u);
    ctx.lineTo(x + 22 * u, y + 94 * u); ctx.closePath();
    ctx.moveTo(x + 62 * u, y + 6 * u); ctx.lineTo(x + 62 * u, y + 24 * u); ctx.lineTo(x + 80 * u, y + 24 * u);
    ctx.moveTo(x + 34 * u, y + 40 * u); ctx.lineTo(x + 66 * u, y + 40 * u);
    ctx.moveTo(x + 36 * u, y + 66 * u); ctx.lineTo(x + 46 * u, y + 76 * u); ctx.lineTo(x + 66 * u, y + 56 * u);
  } else if (kind === 'receipt') {
    ctx.moveTo(x + 20 * u, y + 6 * u); ctx.lineTo(x + 80 * u, y + 6 * u); ctx.lineTo(x + 80 * u, y + 94 * u);
    for (let i = 0; i < 6; i++) { ctx.lineTo(x + (80 - (i + 0.5) * 10) * u, y + 86 * u); ctx.lineTo(x + (80 - (i + 1) * 10) * u, y + 94 * u); }
    ctx.closePath();
    ctx.moveTo(x + 34 * u, y + 30 * u); ctx.lineTo(x + 66 * u, y + 30 * u);
    ctx.moveTo(x + 34 * u, y + 48 * u); ctx.lineTo(x + 66 * u, y + 48 * u);
    ctx.moveTo(x + 34 * u, y + 66 * u); ctx.lineTo(x + 54 * u, y + 66 * u);
  } else {
    ctx.moveTo(x + 50 * u, y + 10 * u);
    ctx.bezierCurveTo(x + 76 * u, y + 10 * u, x + 92 * u, y + 28 * u, x + 92 * u, y + 48 * u);
    ctx.bezierCurveTo(x + 92 * u, y + 70 * u, x + 74 * u, y + 86 * u, x + 50 * u, y + 86 * u);
    ctx.bezierCurveTo(x + 42 * u, y + 86 * u, x + 34 * u, y + 84 * u, x + 28 * u, y + 81 * u);
    ctx.lineTo(x + 10 * u, y + 92 * u); ctx.lineTo(x + 16 * u, y + 74 * u);
    ctx.bezierCurveTo(x + 11 * u, y + 66 * u, x + 8 * u, y + 57 * u, x + 8 * u, y + 48 * u);
    ctx.bezierCurveTo(x + 8 * u, y + 28 * u, x + 24 * u, y + 10 * u, x + 50 * u, y + 10 * u);
    ctx.moveTo(x + 34 * u, y + 48 * u); ctx.lineTo(x + 34.5 * u, y + 48 * u);
    ctx.moveTo(x + 50 * u, y + 48 * u); ctx.lineTo(x + 50.5 * u, y + 48 * u);
    ctx.moveTo(x + 66 * u, y + 48 * u); ctx.lineTo(x + 66.5 * u, y + 48 * u);
  }
  ctx.stroke();
};

const drawCard = (c: CardContent, index: number) => {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  const pad = 96;
  drawIcon(ctx, c.icon, pad, pad + 4, 160);
  ctx.font = '600 34px Manrope';
  ctx.fillStyle = '#D4B26A';
  ctx.textAlign = 'right';
  (ctx as any).letterSpacing = '8px';
  ctx.fillText(`0${index + 1}`, W - pad, pad + 40);
  ctx.textAlign = 'left';
  const rule = ctx.createLinearGradient(pad, 0, pad + 180, 0);
  rule.addColorStop(0, 'rgba(244,227,181,0.95)'); rule.addColorStop(1, 'rgba(184,146,74,0)');
  ctx.fillStyle = rule; ctx.fillRect(pad, 352, 220, 3);
  (ctx as any).letterSpacing = '0px';
  ctx.font = '500 108px "Bodoni Moda"';
  ctx.fillStyle = '#F3EDE2';
  let y = 500;
  for (const line of wrap(ctx, c.title, W - pad * 2 + 20)) {
    ctx.fillText(line, pad, y);
    // Bodoni's display-size hyphen is a hairline: give it a visible weight
    let k = line.indexOf('-');
    while (k >= 0) {
      const x0 = pad + ctx.measureText(line.slice(0, k)).width;
      const hw = ctx.measureText('-').width;
      ctx.fillRect(x0 + hw * 0.1, y - 108 * 0.27, hw * 0.8, 108 * 0.05);
      k = line.indexOf('-', k + 1);
    }
    y += 118;
  }
  ctx.font = '500 58px Manrope';
  ctx.fillStyle = 'rgba(208,201,188,0.96)';
  y += 36;
  for (const line of wrap(ctx, c.body, W - pad * 2)) { ctx.fillText(line, pad, y); y += 80; }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
};

export const useCardTextures = (cards: CardContent[]) => {
  const [tex, setTex] = useState<THREE.Texture[] | null>(null);
  const [handle] = useState(() => delayRender('Drawing card textures'));
  useEffect(() => {
    loadFonts().then(() => document.fonts.ready).then(() => {
      setTex(cards.map((c, i) => drawCard(c, i)));
      continueRender(handle);
    });
  }, []);
  return tex;
};

/** A floating glass card: frosted body, gold hairline border, fresnel edges, light sweep, dissolve. */
export const GlassCard: React.FC<{
  map: THREE.Texture;
  size: [number, number];
  opacity: number;
  sweep: number; // -1..2 position of the light band across the card
  dissolve: number; // 0..1, burns away with a gold edge
  seed: number;
  time: number;
}> = ({ map, size, opacity, sweep, dissolve, seed, time }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { map: { value: null }, uOp: { value: 1 }, uSweep: { value: 0 }, uDis: { value: 0 }, uSeed: { value: 0 }, uT: { value: 0 }, uAspect: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `
          ${NOISE}
          uniform sampler2D map; uniform float uOp, uSweep, uDis, uSeed, uT, uAspect; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
          void main(){
            vec2 p = (vUv - .5) * vec2(uAspect, 1.);
            float d = rbox(p, vec2(uAspect, 1.) * .5, .045);
            float aa = fwidth(d) * 1.2;
            float inside = smoothstep(aa, -aa, d);
            if (inside < .002) discard;
            float fres = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.5);
            // frosted glass body: dark navy, brighter toward the top, fine grain
            float grain = vnoise(vUv * 420. + uSeed) * .5 + vnoise(vUv * 60. + uSeed) * .5;
            vec3 body = mix(vec3(.010, .014, .034), vec3(.028, .036, .078), smoothstep(-.6, .7, p.y)) * (.92 + .16 * grain);
            float a = .72;
            // gold hairline border and soft inner glow
            float border = smoothstep(aa * 1.5 + .0025, .0, abs(d + .012));
            vec3 gold = mix(vec3(.91, .78, .45), vec3(.48, .32, .12), vUv.x * .6 + (1. - vUv.y) * .4);
            vec3 col = body + gold * border * 1.1;
            col += vec3(.9, .8, .6) * smoothstep(.06, 0., -d) * .05;
            col += vec3(.75, .72, .9) * fres * .25;
            // light sweep: a soft diagonal band
            float band = exp(-pow((vUv.x * .8 + (1. - vUv.y) * .5 - uSweep) / .09, 2.));
            col += vec3(1., .93, .78) * band * .55;
            a = max(a, band * .4);
            // content
            vec4 tx = texture2D(map, vec2(vUv.x, vUv.y));
            col = mix(col, tx.rgb * 1.08 + band * .2, tx.a);
            a = max(a, tx.a);
            // dissolve into gold embers
            float n = fbm4(vUv * vec2(4., 5.) + uSeed * 3.1) * .8 + vnoise(vUv * 40.) * .2;
            float th = uDis * 1.25 - .1;
            if (n < th) discard;
            float ember = smoothstep(.08, 0., n - th) * step(.001, uDis);
            col += vec3(1., .72, .32) * ember * 3.;
            gl_FragColor = vec4(col, a * inside * uOp);
          }`,
      }),
    [],
  );
  mat.uniforms.map.value = map;
  mat.uniforms.uOp.value = opacity;
  mat.uniforms.uSweep.value = sweep;
  mat.uniforms.uDis.value = dissolve;
  mat.uniforms.uSeed.value = seed;
  mat.uniforms.uT.value = time;
  mat.uniforms.uAspect.value = size[0] / size[1];
  if (opacity <= 0.001) return null;
  return (
    <mesh material={mat}>
      <planeGeometry args={size} />
    </mesh>
  );
};
