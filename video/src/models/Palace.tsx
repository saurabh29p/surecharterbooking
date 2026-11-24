import React, { useMemo } from 'react';
import * as THREE from 'three';
import { NOISE } from '../lib/glsl';

/**
 * A generic Rajput-style palace façade (not any real building), drawn as a signed-distance
 * field on a plane: arcaded ground floor, jharokha balconies, chhatris and a central dome,
 * sandstone warmly uplit at night, lantern-lit arches. Units are metres; origin at base centre.
 */
export const Palace: React.FC<{ position: [number, number, number]; time: number; width?: number; height?: number; glow?: number }> = ({
  position, time, width = 190, height = 52, glow = 1,
}) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: true,
        uniforms: { uTime: { value: 0 }, uGlow: { value: 1 }, uH: { value: 52 } },
        vertexShader: /* glsl */ `uniform float uH; varying vec2 vP; void main(){ vP = position.xy + vec2(0., uH * .5); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: /* glsl */ `
          ${NOISE}
          uniform float uTime, uGlow; varying vec2 vP;
          float box(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
          // pointed (cusped) arch opening of width w, springing height h
          float arch(vec2 p, float w, float h){
            float r = box(p - vec2(0., h * .5), vec2(w * .5, h * .5));
            vec2 q = vec2(abs(p.x), p.y - h);
            float pa = max(length(q - vec2(-w * .3, 0.)) - w * .8, -q.y);
            pa = max(pa, -(p.y - h));
            return min(r, max(length(q + vec2(w * .3, 0.)) - w * .8, -(p.y - h + .001)));
          }
          float dome(vec2 p, float r){ // onion dome with finial
            vec2 q = p / r;
            float d = length(q * vec2(1., 1.05) - vec2(0., .05)) - 1.;
            d = min(d, max(abs(q.x) - (1. - smoothstep(.6, 1.9, q.y)) * .55, q.y - 1.9));
            d = max(d, -q.y);
            return min(d, box(q - vec2(0., 2.0), vec2(.06, .3))) * r;
          }
          void main(){
            vec2 p = vP;
            float x = p.x, y = p.y;
            float ax = abs(x);
            // massing
            float d = box(p - vec2(0., 13.), vec2(78., 13.));                // main block, 3 storeys
            d = min(d, box(p - vec2(0., 29.5), vec2(40., 3.5)));             // upper pavilion storey
            d = min(d, box(vec2(ax - 82., y - 16.), vec2(9., 16.)));          // corner towers
            // parapet kanguras
            float kg = step(.5, fract(x / 1.4)) * step(26., y) * step(y, 27.) * step(ax, 78.);
            kg += step(.5, fract(x / 1.4)) * step(32.9, y) * step(y, 33.8) * step(ax, 40.);
            if (kg > 0.) d = min(d, -.01);
            // chhatris along the roofline and on the towers, central dome
            float dm = 1e3;
            for (int i = 0; i < 9; i++){ float cx = -64. + float(i) * 16.; if (abs(cx) < 42.) continue; dm = min(dm, dome(p - vec2(cx, 29.6), 2.6)); dm = min(dm, box(p - vec2(cx, 28.2), vec2(3.2, .35))); dm = min(dm, box(vec2(abs(x - cx) - 2.4, y - 27.6), vec2(.22, 1.)));}
            for (int i = 0; i < 2; i++){ float cx = i == 0 ? -82. : 82.; dm = min(dm, dome(p - vec2(cx, 35.4), 5.)); dm = min(dm, box(p - vec2(cx, 33.), vec2(6., .5))); dm = min(dm, box(vec2(abs(x - cx) - 4.8, y - 32.5), vec2(.35, 1.)));}
            for (int i = 0; i < 4; i++){ float cx = -27. + float(i) * 18.; dm = min(dm, dome(p - vec2(cx, 36.6), 2.4)); dm = min(dm, box(p - vec2(cx, 35.2), vec2(3., .35))); }
            dm = min(dm, dome(p - vec2(0., 34.2), 8.5));
            d = min(d, dm);
            float aa = fwidth(d) * 1.2;
            float inside = smoothstep(aa, -aa, d);
            if (inside < .003) discard;
            // sandstone with weathering, warm uplight falling off with height, beam pools
            float n = fbm4(p * .35) * .6 + vnoise(p * 2.) * .4;
            vec3 stone = vec3(.62, .40, .21) * (.8 + .3 * n);
            // floodlight pools from below between the arches, falling off with height
            float pool = pow(.5 + .5 * cos(x * 6.2831 / 12.), 3.);
            float up = .08 + .55 * exp(-y / 7.) * (.55 + .45 * pool) + .1 * exp(-y / 22.);
            // pilasters: slight vertical relief every 6 m
            float pil = smoothstep(.5, .3, abs(fract(x / 6.) - .5) * 6. - 2.4);
            vec3 col = stone * up * (1. + .25 * pil);
            // storey cornices catch the light
            float corn = smoothstep(.25, 0., abs(y - 8.6)) + smoothstep(.2, 0., abs(y - 17.4)) + smoothstep(.2, 0., abs(y - 25.6));
            col += vec3(1., .74, .42) * corn * .35 * step(ax, 78.);
            // ground-floor arcade, lantern-lit interiors
            float em = 0.;
            if (y < 8.5 && ax < 76.) {
              float cx = (fract(x / 6.) - .5) * 6.;
              float a = arch(vec2(cx, y - .9), 3.6, 4.8);
              float id = hash11(floor(x / 6.) + 3.);
              float lit = .75 + .25 * sin(uTime * 2.1 + id * 30.);
              em += smoothstep(.06, -.06, a) * (1.2 + .8 * id) * lit;
              col = mix(col, col * .35, smoothstep(.6, 0., a) * step(0., a) * .8); // recess shadow around the arch
            }
            // first floor jharokhas (projecting windows) and second-floor arches
            if (y > 9.5 && y < 17. && ax < 76.) {
              float cx = (fract((x + 6.) / 12.) - .5) * 12.;
              float a = arch(vec2(cx, y - 11.), 3.2, 3.4);
              float hood = dome(vec2(cx, y - 15.4), 1.3);
              float id = hash11(floor((x + 6.) / 12.) + 9.);
              em += smoothstep(.05, -.05, a) * (.6 + .9 * step(.35, id));
              col = mix(col, col * 1.35, smoothstep(.05, -.05, hood));
              float sx = (fract(x / 4.) - .5) * 4.;
              float sa = arch(vec2(sx, y - 11.6), 1.2, 2.);
              em += smoothstep(.04, -.04, sa) * .35 * step(1.5, abs(cx));
            }
            if (y > 18.5 && y < 25. && ax < 76.) {
              float cx = (fract(x / 5.) - .5) * 5.;
              float a = arch(vec2(cx, y - 19.6), 1.8, 2.8);
              em += smoothstep(.04, -.04, a) * (.45 + .5 * hash11(floor(x / 5.) + 21.));
            }
            if (y > 26.5 && y < 32.5 && ax < 39.) {
              float cx = (fract(x / 4.5) - .5) * 4.5;
              em += smoothstep(.04, -.04, arch(vec2(cx, y - 27.4), 1.7, 2.6)) * .6;
            }
            if (y < 24. && ax > 74. && ax < 90.) {
              float a = arch(vec2(ax - 82., mod(y, 8.) - 2.), 1.6, 3.);
              em += smoothstep(.04, -.04, a) * .5;
            }
            // domes: brighter, gilded finials catch the light
            float onDome = smoothstep(.2, -.2, dm) * step(27.5, y);
            float domeShade = .25 + .6 * smoothstep(-.8, .8, -(x - floor(x / 16. + .5) * 16.) * .1);
            col = mix(col, vec3(.5, .36, .22) * .22 * domeShade, onDome * .85);
            col += vec3(1., .6, .24) * em * uGlow * 1.6;
            gl_FragColor = vec4(col, inside);
          }`,
      }),
    [],
  );
  mat.uniforms.uTime.value = time;
  mat.uniforms.uGlow.value = glow;
  mat.uniforms.uH.value = height;
  return (
    <mesh material={mat} position={[position[0], position[1] + height / 2, position[2]]}>
      <planeGeometry args={[width, height]} />
    </mesh>
  );
};
