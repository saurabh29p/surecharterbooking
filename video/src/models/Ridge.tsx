import React, { useMemo } from 'react';
import * as THREE from 'three';
import { NOISE } from '../lib/glsl';

/**
 * One layer of hills as a vertical plane: ridge line from fbm, atmospheric colour,
 * moonlit rim, valley mist and tiny lamp lights. Optionally carries a stylised hill fort
 * (generic: walls, round bastions, a palace block with chhatris; not any real building).
 */
export type RidgeSpec = {
  z: number;
  width: number;
  bottom: number;
  top: number;
  base: number;
  amp: number;
  freq: number;
  seed: number;
  color: string;
  rim: string;
  mist: string;
  mistAmount?: number;
  lamps?: number;
  fortX?: number | null;
  fortScale?: number;
  x?: number;
};

export const Ridge: React.FC<{ spec: RidgeSpec; time: number }> = ({ spec, time }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uBase: { value: 0 }, uAmp: { value: 0 }, uFreq: { value: 0 }, uSeed: { value: 0 },
          uCol: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uMist: { value: new THREE.Color() },
          uMistAmt: { value: 0.6 }, uLamps: { value: 0 }, uFortX: { value: 0 }, uFortOn: { value: 0 }, uFortS: { value: 1 },
          uBottom: { value: 0 },
        },
        vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = (modelMatrix * vec4(position, 1.)).xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: /* glsl */ `
          ${NOISE}
          uniform float uTime, uBase, uAmp, uFreq, uSeed, uMistAmt, uLamps, uFortX, uFortOn, uFortS, uBottom;
          uniform vec3 uCol, uRim, uMist; varying vec2 vP;
          float ridge(float x){
            float q = x * uFreq + uSeed * 17.;
            float big = fbm4(vec2(q * .22, uSeed));
            float rg = 1. - abs(vnoise(vec2(q * .9, uSeed * 2.3)) * 2. - 1.);
            float det = fbm(vec2(q * 2.6, uSeed * 3.1));
            float h = uBase + uAmp * (1.7 * (big - .5) + .55 * (rg * rg - .4) + .32 * (det - .5));
            if (uFortOn > 0.) {
              float dx = (x - uFortX) / uFortS;
              float plateau = uBase + uAmp * .55 - pow(max(abs(dx) - 30., 0.) * .09, 1.6) * uFortS;
              h = max(h, plateau);
            }
            return h;
          }
          float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
          // Fort silhouette SDF in local units (origin at the fort's base centre).
          float fort(vec2 p, out float win){
            win = 0.;
            float d = sdBox(p - vec2(0., -6.), vec2(40., 14.));                             // curtain wall into the hill
            float mer = step(.45, fract(p.x / 1.5)) * step(8., p.y) * step(p.y, 9.)  * step(abs(p.x), 40.);
            d = min(d, mer > 0. ? -.01 : 1e3);
            for (int i = 0; i < 6; i++){                                                    // round bastions
              float bx = -40. + float(i) * 16.;
              float bh = 10.5 + mod(float(i), 2.) * 1.5;
              d = min(d, sdBox(p - vec2(bx, bh * .5 - 4.), vec2(3. - p.y * .04, bh * .5 + 4.)));
              d = min(d, max(length(p - vec2(bx, bh)) - 2.2, -(p.y - bh)));
            }
            // tiered palace: three stacked storeys, narrowing
            d = min(d, sdBox(p - vec2(6., 11.), vec2(17., 4.)));
            d = min(d, sdBox(p - vec2(6., 17.5), vec2(12.5, 2.6)));
            d = min(d, sdBox(p - vec2(6., 22.), vec2(8., 2.)));
            d = min(d, sdBox(p - vec2(6., 15.3), vec2(18., .35)));                          // cornice lines
            d = min(d, sdBox(p - vec2(6., 20.3), vec2(13.5, .3)));
            // chhatris: small domed pavilions along each storey, a big one on top
            for (int i = 0; i < 7; i++){
              float fi = float(i);
              float cx = -9. + fi * 5.;
              float hh = 21.4;
              float rr = 1.25;
              if (i == 3) { hh = 26.4; rr = 2.3; }
              else if (i == 0 || i == 6) { hh = 16.6; rr = 1.5; }
              d = min(d, sdBox(p - vec2(cx, hh - .3), vec2(rr + .5, .25)));
              d = min(d, max(length((p - vec2(cx, hh)) * vec2(1., .85)) - rr, -(p.y - hh)));
              d = min(d, sdBox(p - vec2(cx, hh + rr * 1.2 + .5), vec2(.09, .55)));
              d = min(d, sdBox(p - vec2(cx - rr, hh - 1.4), vec2(.18, 1.2)));
              d = min(d, sdBox(p - vec2(cx + rr, hh - 1.4), vec2(.18, 1.2)));
            }
            // lit jharokha windows on the lower two storeys
            vec2 wp = p - vec2(6., 13.5);
            if (abs(wp.x) < 15.5 && wp.y > -4. && wp.y < 6.5){
              vec2 cell = vec2(2.4, 5.);
              vec2 c = (fract(wp / cell) - .5) * cell;
              float arch = sdBox(c - vec2(0., -.4), vec2(.5, .9));
              arch = min(arch, length(c - vec2(0., .5)) - .5);
              float id = hash12(floor(wp / cell) + 3.);
              win = smoothstep(.12, -.12, arch) * step(.3, id) * (.8 + .2 * sin(uTime * 2.3 + id * 30.));
            }
            return d;
          }
          void main(){
            float x = vP.x, y = vP.y;
            float r = ridge(x);
            float aa = max(fwidth(y), 1e-3) * 1.2;
            float inside = smoothstep(r + aa, r - aa, y);
            float win = 0.; float fortIn = 0.;
            if (uFortOn > 0.) {
              float fx = uFortX; float fy = ridge(fx) - 2. * uFortS;
              vec2 fp = (vec2(x, y) - vec2(fx, fy)) / uFortS;
              float fd = fort(fp, win) * uFortS;
              fortIn = smoothstep(aa, -aa, fd);
              inside = max(inside, fortIn);
            }
            if (inside < .002) discard;
            float below = max(r - y, 0.);
            // slopes: a little moonlight near the crest, falling into shadow lower down
            vec3 col = uCol * (1.0 + .35 * exp(-below / max(uAmp * .5, 1.)));
            // thin moonlit rim exactly on the ridge line (never on the fort)
            float rim = exp(-below / max(aa * 2.5, .3)) * step(y, r + aa) * (1. - fortIn);
            col += uRim * rim * .55;
            // valley haze: deeper below the crest = more haze, broken up by drifting noise
            float m = fbm4(vec2(x * .015 + uTime * .025, y * .05 + uSeed));
            float haze = smoothstep(0., uAmp * 2.2, below) * (.5 + .5 * m) * uMistAmt;
            col = mix(col, uMist, clamp(haze, 0., 1.));
            // scattered lamp lights in the valleys
            if (uLamps > 0.) {
              vec2 g = vec2(x, y) / vec2(9., 5.); vec2 id = floor(g); vec2 f = fract(g) - .5;
              vec2 o = hash22(id) - .5; float on = step(1. - uLamps, hash12(id + 11.)) * step(y, r - 4.);
              float l = smoothstep(.09, 0., length(f - o * .7)) * on * (.6 + .4 * sin(uTime * 3. + hash12(id) * 50.));
              col += vec3(1., .62, .25) * l * 1.6;
            }
            col = mix(col, uCol * .8, fortIn);
            col += vec3(1., .62, .26) * win * 2.4 * fortIn;
            gl_FragColor = vec4(col, inside);
          }`,
      }),
    [],
  );
  const u = mat.uniforms;
  u.uTime.value = time;
  u.uBase.value = spec.base; u.uAmp.value = spec.amp; u.uFreq.value = spec.freq; u.uSeed.value = spec.seed;
  (u.uCol.value as THREE.Color).set(spec.color);
  (u.uRim.value as THREE.Color).set(spec.rim);
  (u.uMist.value as THREE.Color).set(spec.mist);
  u.uMistAmt.value = spec.mistAmount ?? 0.6;
  u.uLamps.value = spec.lamps ?? 0;
  u.uFortOn.value = spec.fortX != null ? 1 : 0;
  u.uFortX.value = spec.fortX ?? 0;
  u.uFortS.value = spec.fortScale ?? 1;
  u.uBottom.value = spec.bottom;
  const h = spec.top - spec.bottom;
  return (
    <mesh material={mat} position={[spec.x ?? 0, spec.bottom + h / 2, spec.z]} renderOrder={-5 + spec.z * 0.0001}>
      <planeGeometry args={[spec.width, h]} />
    </mesh>
  );
};
