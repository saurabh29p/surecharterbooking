import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Detailed procedural twin-engine VIP helicopter (generic type; no registration, no operator marks).
 * Glossy ivory over midnight livery split by a gold pinstripe. Local frame: nose +x, up +y; skids at y = 0.
 */
const LEN = 12.2;
const prof = (x: number) => {
  // half-height, half-width, centre-y of the pod/boom at x (0 = nose tip)
  if (x < 2.5) { const t = x / 2.5; const k = Math.pow(Math.sin((t * Math.PI) / 2), 0.5); return [1.0 * k, 0.88 * k, -0.3 * (1 - t) ** 1.6]; }
  if (x < 5.9) return [1.0, 0.88, 0];
  if (x < 8.0) { const t = (x - 5.9) / 2.1; const k = 1 - t * t * (3 - 2 * t); return [0.28 + 0.67 * k, 0.24 + 0.66 * k, 0.42 * t * t]; }
  return [0.28 - (x - 8) * 0.018, 0.24 - (x - 8) * 0.014, 0.42 + (x - 8) * 0.06];
};
export const heliHull = (x: number, a: number, off = 0) => {
  const [hh, hw, cy] = prof(x);
  const c = Math.cos(a), s = Math.sin(a);
  const e = c < 0 ? 0.5 : 0.82;
  return new THREE.Vector3(LEN / 2 - x, Math.sign(c) * Math.pow(Math.abs(c), e) * (hh + off) + cy, Math.sign(s) * Math.pow(Math.abs(s), 0.85) * (hw + off));
};
const podGeo = () => {
  const N = 150, M = 80;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) { const x = (i / N) * LEN; for (let j = 0; j <= M; j++) { const p = heliHull(x, (j / M) * Math.PI * 2); pos.push(p.x, p.y, p.z); uv.push(x, j / M); } }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
};

const livery = /* glsl */ `
  {
    float x = vHUv.x; float a = vHUv.y;
    float y = cos(a * 6.2831853); float side = abs(sin(a * 6.2831853));
    float belt = -.05 + max(x - 5.9, 0.) * .09;
    float lower = smoothstep(belt + .01, belt - .01, y);
    vec3 ivory = vec3(.93, .9, .84), midnight = vec3(.035, .05, .12);
    diffuseColor.rgb = mix(ivory, midnight, lower);
    metalnessFactor = mix(0., .55, lower);
    roughnessFactor = mix(.2, .26, lower);
    float stripe = smoothstep(.028, .008, abs(y - belt)) + .7 * smoothstep(.012, .0, abs(y - belt + .07));
    stripe *= step(.25, side) * step(.6, x) * step(x, 11.4);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.78, .58, .24), clamp(stripe, 0., 1.));
    metalnessFactor = mix(metalnessFactor, 1., clamp(stripe, 0., 1.));
    // glazing: wrap-around cockpit + two big cabin windows each side
    float ang = atan(sin(a * 6.2831853), y + .1);
    float glz = smoothstep(.45, .6, x) * smoothstep(2.55 - abs(ang) * .4, 2.4 - abs(ang) * .4, x) * step(-.08, y) * smoothstep(.05, .09, abs(ang));
    vec2 w1 = vec2(x - 3.4, y - .25), w2 = vec2(x - 4.85, y - .25);
    float cab = (smoothstep(.03, -.03, length(max(abs(w1) - vec2(.42, .24), 0.)) - .16) + smoothstep(.03, -.03, length(max(abs(w2) - vec2(.42, .24), 0.)) - .16)) * step(.55, side);
    float post = smoothstep(.06, .03, abs(ang)) * glz;
    glz *= 1. - post;
    float glass = clamp(glz + cab, 0., 1.);
    gCab = clamp(cab, 0., 1.) * (.55 + .45 * smoothstep(.55, .05, y)) + glz * .08;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.006, .008, .014), glass);
    roughnessFactor = mix(roughnessFactor, .03, glass);
    metalnessFactor = mix(metalnessFactor, 0., glass);
    // door seam and panel lines
    float seam = smoothstep(.012, 0., abs(x - 2.75)) * step(.6, side) * step(-.6, y) * step(y, .55);
    seam += smoothstep(.012, 0., abs(x - 5.6)) * step(.6, side) * step(-.6, y) * step(y, .55);
    diffuseColor.rgb *= 1. - seam * .5;
  }`;

/** A gold rim light that only the helicopter receives (so the lawn and palace stay dark). */
export const RIM = { dir: new THREE.Vector3(-0.3, 0.45, -0.85).normalize(), color: new THREE.Color(1.0, 0.68, 0.3), strength: 2.2 };
const RIM_GLSL = /* glsl */ `
  {
    vec3 Vv = normalize(vViewPosition);
    vec3 Ld = normalize((viewMatrix * vec4(uRimDir, 0.)).xyz);
    float fres = pow(1. - clamp(dot(normal, Vv), 0., 1.), 2.5);
    float facing = smoothstep(-.2, .6, dot(normal, Ld));
    totalEmissiveRadiance += uRimCol * fres * facing;
  }`;
const withRim = <M extends THREE.MeshStandardMaterial>(m: M, key: string, extra?: (sh: THREE.WebGLProgramParametersWithUniforms) => void) => {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRimDir = { value: RIM.dir };
    sh.uniforms.uRimCol = { value: RIM.color.clone().multiplyScalar(RIM.strength) };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimDir, uRimCol;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + RIM_GLSL);
    extra?.(sh);
  };
  m.customProgramCacheKey = () => 'rim' + key;
  return m;
};

export const HeliV2: React.FC<{ rotorAngle: number; beacon?: number; strobe?: number; blur?: number }> = ({ rotorAngle, beacon = 0, strobe = 0, blur = 1 }) => {
  const m = useMemo(() => {
    const paint = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.1 });
    withRim(paint, 'livery', (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vHUv; uniform float uCabin; float gCab = 0.;').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + livery).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1., .62, .3) * gCab * uCabin;');
      sh.uniforms.uCabin = { value: 0.09 };
    });
    const ivory = withRim(new THREE.MeshPhysicalMaterial({ color: '#ede6d8', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 }), 'ivory');
    const navy = withRim(new THREE.MeshPhysicalMaterial({ color: '#0b1124', roughness: 0.25, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 }), 'navy');
    const gold = new THREE.MeshStandardMaterial({ color: '#d9bc78', metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
    const metal = withRim(new THREE.MeshStandardMaterial({ color: '#c3c7ce', metalness: 1, roughness: 0.18, envMapIntensity: 1.3 }), 'metal');
    const dark = new THREE.MeshStandardMaterial({ color: '#16181d', metalness: 0.6, roughness: 0.4 });
    const blade = new THREE.MeshStandardMaterial({ color: '#1d2026', metalness: 0.4, roughness: 0.35, transparent: true, opacity: 0.35 + 0.65 * (1 - blur) });
    const disc = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uA: { value: 0 }, uB: { value: 1 } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform float uA, uB; varying vec2 vP;
        void main(){ float r = length(vP) / 5.6; float a = atan(vP.y, vP.x) - uA;
          float streak = pow(.5 + .5 * cos(a * 5.), 10.);
          float alpha = (.09 + .2 * streak) * smoothstep(1., .965, r) * smoothstep(.07, .2, r) * uB;
          vec3 col = vec3(.1, .11, .13) + vec3(1., .82, .55) * .35 * smoothstep(.9, 1., r) * (.6 + .4 * streak);
          gl_FragColor = vec4(col, alpha + .25 * smoothstep(.96, .99, r) * smoothstep(1., .985, r) * uB); }`,
    });
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 0.3, 0.2) });
    const green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 6, 1.2) });
    const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7.8, 7.4) });
    const mats = { paint, ivory, navy, gold, metal, dark, blade, disc, red, green, white };
    // names and the livery shader travel with the model when it is exported to glTF (scripts/export-gltf.mjs)
    for (const [k, v] of Object.entries(mats)) v.name = k;
    paint.userData = { glsl: livery, uvLength: LEN };
    return mats;
  }, []);
  m.disc.uniforms.uA.value = rotorAngle * 0.6;
  m.disc.uniforms.uB.value = blur;
  const g = useMemo(() => {
    const pod = podGeo();
    const cowl = new THREE.CapsuleGeometry(0.62, 2.0, 8, 24).rotateZ(Math.PI / 2).scale(1, 0.62, 0.95);
    const exhaust = new THREE.CylinderGeometry(0.17, 0.2, 0.5, 18).rotateZ(Math.PI / 2 - 0.5);
    const mast = new THREE.CylinderGeometry(0.11, 0.15, 0.55, 14);
    const hub = new THREE.CylinderGeometry(0.32, 0.36, 0.32, 24);
    const bladeG = new THREE.BoxGeometry(5.2, 0.05, 0.34).translate(2.9, 0, 0);
    const discG = new THREE.CircleGeometry(5.6, 96).rotateX(-Math.PI / 2);
    const fen = new THREE.TorusGeometry(0.6, 0.11, 18, 48).scale(1, 1, 2.2);
    const fenDisc = new THREE.CircleGeometry(0.6, 32);
    const fin = new THREE.BoxGeometry(1.25, 1.55, 0.09);
    const stab = new THREE.BoxGeometry(0.75, 0.06, 2.7);
    const plate = new THREE.BoxGeometry(0.62, 0.55, 0.05);
    const skid = new THREE.CylinderGeometry(0.055, 0.055, 4.8, 12).rotateZ(Math.PI / 2);
    const skidTip = new THREE.TorusGeometry(0.3, 0.055, 8, 16, Math.PI / 2);
    const cross = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0.06, -1.2], [0, 0.42, -1.12], [0, 0.74, -0.62], [0, 0.8, 0], [0, 0.74, 0.62], [0, 0.42, 1.12], [0, 0.06, 1.2]].map((p) => new THREE.Vector3(...(p as [number, number, number])))), 40, 0.055, 10);
    const light = new THREE.SphereGeometry(0.07, 12, 8);
    return { pod, cowl, exhaust, mast, hub, bladeG, discG, fen, fenDisc, fin, stab, plate, skid, skidTip, cross, light };
  }, []);
  return (
    <group>
      <group position={[0, 1.6, 0]}>
        <mesh geometry={g.pod} material={m.paint} />
        <mesh geometry={g.cowl} material={m.ivory} position={[0.45, 0.98, 0]} />
        {[1, -1].map((s) => <mesh key={s} geometry={g.exhaust} material={m.dark} position={[-0.95, 1.1, s * 0.45]} />)}
        <mesh geometry={g.mast} material={m.metal} position={[0.85, 1.55, 0]} />
        <group name="rotor" position={[0.85, 1.85, 0]}>
          <mesh geometry={g.hub} material={m.metal} />
          {[0, 1, 2, 3, 4].map((i) => <mesh key={i} geometry={g.bladeG} material={m.blade} rotation={[0, rotorAngle + (i * 2 * Math.PI) / 5, -0.025]} />)}
          <mesh name="rotorDisc" geometry={g.discG} material={m.disc} position={[0, 0.03, 0]} />
        </group>
        <group position={[-5.75, 0.95, 0]}>
          <mesh geometry={g.fen} material={m.navy} />
          <mesh geometry={g.fenDisc} material={m.dark} />
          <mesh geometry={g.fin} material={m.navy} position={[-0.25, 0.85, 0]} rotation={[0, 0, -0.38]} />
          <mesh geometry={g.light} material={m.white} position={[-0.75, 0.25, 0]} scale={0.6 + strobe * 1.6} />
        </group>
        <mesh geometry={g.stab} material={m.navy} position={[-4.05, 0.62, 0]} />
        {[1, -1].map((s) => <mesh key={s} geometry={g.plate} material={m.navy} position={[-4.05, 0.72, s * 1.36]} />)}
        <mesh geometry={g.light} material={m.red} position={[0.15, 1.28, 0]} scale={0.8 + beacon * 1.6} />
        <mesh geometry={g.light} material={m.red} position={[2.2, -0.96, 0]} scale={0.8 + beacon * 1.6} />
        <mesh geometry={g.light} material={m.red} position={[-4.05, 0.66, 1.4]} />
        <mesh geometry={g.light} material={m.green} position={[-4.05, 0.66, -1.4]} />
      </group>
      {[1, -1].map((s) => (
        <group key={s}>
          <mesh geometry={g.skid} material={m.metal} position={[0.4, 0.06, s * 1.2]} />
          <mesh geometry={g.skidTip} material={m.metal} position={[2.8, 0.36, s * 1.2]} rotation={[0, 0, -Math.PI / 2]} />
        </group>
      ))}
      {[1.6, -0.8].map((x) => <mesh key={x} geometry={g.cross} material={m.metal} position={[x, 0, 0]} />)}
    </group>
  );
};
