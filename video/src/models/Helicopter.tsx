import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * A stylised, generic twin-engine VIP helicopter built from code (no real type, no registration,
 * no operator marks). Local frame: nose +x, up +y; skids rest at y = 0.
 */
const podProfile = (x: number) => {
  // half-height and half-width of the cabin pod along x (0 = nose)
  if (x < 0) return [0, 0];
  if (x < 2.8) { const t = x / 2.8; const k = Math.pow(Math.sin((t * Math.PI) / 2), 0.8); return [0.92 * k, 0.88 * k]; }
  if (x < 5.6) return [0.92, 0.88];
  if (x < 7.6) { const t = (x - 5.6) / 2.0; const k = 1 - t * t * (3 - 2 * t); return [0.26 + 0.66 * k, 0.22 + 0.66 * k]; }
  return [0.28 - (x - 7.2) * 0.015, 0.24 - (x - 7.2) * 0.012];
};

const podGeometry = () => {
  const N = 120, M = 56, LEN = 11.8;
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * LEN;
    const [hh, hw] = podProfile(x);
    // the boom rises toward the tail
    const yc = (x < 5.6 ? 0 : 0.5 * Math.pow((x - 5.6) / (LEN - 5.6), 1.2)) - 0.12 * Math.max(0, 1 - x / 2.8) ** 2;
    for (let j = 0; j <= M; j++) {
      const a = (j / M) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      // superellipse cross-section: squarer below (cabin floor)
      const e = c < 0 ? 0.55 : 0.85;
      const y = Math.sign(c) * Math.pow(Math.abs(c), e) * hh;
      const z = Math.sign(s) * Math.pow(Math.abs(s), 0.85) * hw;
      pos.push(LEN / 2 - x, y + yc, z);
    }
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + M + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

export const Helicopter: React.FC<{
  env: THREE.Texture | null;
  rotorAngle: number;
  beacon?: number;
  strobe?: number;
}> = ({ env, rotorAngle, beacon = 0, strobe = 0 }) => {
  const m = useMemo(() => {
    const paint = new THREE.MeshPhysicalMaterial({ color: '#18224a', roughness: 0.34, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.0 });
    paint.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vL;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vL;').replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        {
          float x = 5.9 - vL.x; // from nose
          float y = vL.y; float az = abs(vL.z);
          // wrap-around cockpit glazing
          float ang = atan(vL.z, y + .15);
          float glaze = smoothstep(.35, .55, x) * smoothstep(2.35 - abs(ang) * .35, 2.2 - abs(ang) * .35, x) * step(-.12, y) * smoothstep(.06, .1, abs(ang)) ;
          // two big cabin windows each side
          vec2 w1 = vec2(x - 3.05, y - .22), w2 = vec2(x - 4.45, y - .22);
          float cab = (smoothstep(.04, -.04, length(max(abs(w1) - vec2(.38, .26), 0.)) - .14) + smoothstep(.04, -.04, length(max(abs(w2) - vec2(.38, .26), 0.)) - .14)) * step(.6, az);
          float dark = clamp(glaze + cab, 0., 1.);
          // gold pinstripe along the cabin and boom
          float band = (smoothstep(.045, .015, abs(y + .3 - max(x - 5.6, 0.) * .07)) + .6 * smoothstep(.018, 0., abs(y + .42 - max(x - 5.6, 0.) * .07))) * step(.35, az) * step(.8, x) * step(x, 10.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.75, .55, .22), band); metalnessFactor = mix(metalnessFactor, 1., band);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.01, .014, .025), dark);
          roughnessFactor = mix(roughnessFactor, .05, dark);
        }`,
      );
    };
    const plain = new THREE.MeshPhysicalMaterial({ color: '#18224a', roughness: 0.34, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.0 });
    const metal = new THREE.MeshStandardMaterial({ color: '#9aa0aa', roughness: 0.3, metalness: 1, envMapIntensity: 1.2 });
    const darkM = new THREE.MeshStandardMaterial({ color: '#15171d', roughness: 0.5, metalness: 0.4 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d9bc78', roughness: 0.25, metalness: 1, envMapIntensity: 1.3 });
    const blade = new THREE.MeshStandardMaterial({ color: '#202329', roughness: 0.45, metalness: 0.3, transparent: true, opacity: 0.55 });
    const disc = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uA: { value: 0 } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform float uA; varying vec2 vP;
        void main(){ float r = length(vP) / 5.4; float a = atan(vP.y, vP.x) - uA;
          float streak = pow(.5 + .5 * cos(a * 5.), 6.);
          float alpha = (.06 + .16 * streak) * smoothstep(1., .93, r) * smoothstep(.06, .2, r);
          gl_FragColor = vec4(vec3(.08, .085, .1) + vec3(.9, .7, .45) * .15 * smoothstep(.85, 1., r), alpha); }`,
    });
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.3, 0.2) });
    const green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 6, 1.2) });
    const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.6, 8) });
    return { paint, plain, metal, darkM, gold, blade, disc, red, green, white };
  }, []);
  [m.paint, m.plain, m.metal, m.gold].forEach((x) => (x.envMap = env));
  m.disc.uniforms.uA.value = rotorAngle * 0.7;
  const g = useMemo(() => {
    const pod = podGeometry();
    const cowl = new THREE.SphereGeometry(1, 40, 20);
    const skid = new THREE.CylinderGeometry(0.06, 0.06, 4.6, 12).rotateZ(Math.PI / 2);
    const cross = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.06, -1.15), new THREE.Vector3(0, 0.95, 0), new THREE.Vector3(0, 0.06, 1.15)), 24, 0.055, 10);
    const bladeG = new THREE.BoxGeometry(5.2, 0.05, 0.32).translate(2.75, 0, 0);
    const hub = new THREE.CylinderGeometry(0.28, 0.34, 0.35, 20);
    const mast = new THREE.CylinderGeometry(0.12, 0.14, 0.5, 12);
    const fen = new THREE.TorusGeometry(0.62, 0.14, 16, 40);
    const fin = new THREE.BoxGeometry(1.2, 1.5, 0.08);
    const stab = new THREE.BoxGeometry(0.7, 0.06, 2.6);
    const light = new THREE.SphereGeometry(0.07, 12, 8);
    const discG = new THREE.CircleGeometry(5.4, 64).rotateX(-Math.PI / 2);
    return { pod, cowl, skid, cross, bladeG, hub, mast, fen, fin, stab, light, discG };
  }, []);
  const blades = [0, 1, 2, 3, 4].map((i) => (
    <mesh key={i} geometry={g.bladeG} material={m.blade} rotation={[0, rotorAngle + (i * 2 * Math.PI) / 5, -0.03]} />
  ));
  return (
    <group>
      <group position={[0, 1.55, 0]}>
        <mesh geometry={g.pod} material={m.paint} />
        {/* engine cowling and mast */}
        <mesh geometry={g.cowl} material={m.plain} position={[0.6, 0.95, 0]} scale={[2.2, 0.55, 0.75]} />
        <mesh geometry={g.mast} material={m.metal} position={[0.9, 1.55, 0]} />
        <group position={[0.9, 1.82, 0]}>
          <mesh geometry={g.hub} material={m.metal} />
          {blades}
          <mesh geometry={g.discG} material={m.disc} position={[0, 0.02, 0]} />
        </group>
        {/* tail: fenestron ring, fin, stabiliser */}
        <group position={[-5.6, 0.72, 0]}>
          <mesh geometry={g.fen} material={m.plain} />
          <mesh geometry={g.fin} material={m.plain} position={[-0.2, 0.75, 0]} rotation={[0, 0, -0.35]} />
          <mesh geometry={g.light} material={m.white} position={[-0.6, 0.2, 0]} scale={0.6 + strobe * 1.5} />
        </group>
        <mesh geometry={g.stab} material={m.plain} position={[-3.9, 0.5, 0]} />
        <mesh geometry={g.light} material={m.red} position={[0.2, 1.25, 0]} scale={0.8 + beacon * 1.5} />
        <mesh geometry={g.light} material={m.red} position={[-3.6, 0.45, 1.3]} />
        <mesh geometry={g.light} material={m.green} position={[-3.6, 0.45, -1.3]} />
      </group>
      {/* skids */}
      {[1, -1].map((s) => (
        <group key={s}>
          <mesh geometry={g.skid} material={m.metal} position={[0.4, 0.06, s * 1.15]} />
          <mesh geometry={g.light} material={m.gold} position={[2.7, 0.12, s * 1.15]} scale={1.2} />
        </group>
      ))}
      {[1.5, -0.6].map((x) => (
        <mesh key={x} geometry={g.cross} material={m.metal} position={[x, 0, 0]} />
      ))}
    </group>
  );
};
