import * as THREE from 'three';

export type EnvSpec = {
  top: string;
  horizon: string;
  bottom: string;
  /** Bright warm source (sun/sunset) direction and colour, for rim reflections. */
  sunDir?: [number, number, number];
  sunColor?: string;
  sunPower?: number;
  sunSize?: number;
  /** Extra soft light panels: [dir, colour, power, size]. */
  panels?: [[number, number, number], string, number, number][];
};

/** Builds a prefiltered environment map from a procedural gradient sky with light panels. */
export const buildEnv = (gl: THREE.WebGLRenderer, spec: EnvSpec) => {
  const scene = new THREE.Scene();
  const panels = spec.panels ?? [];
  const lights = [
    ...(spec.sunDir ? [[spec.sunDir, spec.sunColor ?? '#ffcc88', spec.sunPower ?? 8, spec.sunSize ?? 0.08] as const] : []),
    ...panels,
  ];
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(spec.top) },
      hor: { value: new THREE.Color(spec.horizon) },
      bot: { value: new THREE.Color(spec.bottom) },
      ld: { value: lights.map((l) => new THREE.Vector3(...l[0]).normalize()).concat(Array(4).fill(new THREE.Vector3(0, -1, 0))).slice(0, 4) },
      lc: { value: lights.map((l) => new THREE.Color(l[1]).multiplyScalar(l[2])).concat(Array(4).fill(new THREE.Color(0, 0, 0))).slice(0, 4) },
      ls: { value: lights.map((l) => l[3]).concat([1, 1, 1, 1]).slice(0, 4) },
    },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 top, hor, bot; uniform vec3 ld[4]; uniform vec3 lc[4]; uniform float ls[4]; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float h = d.y;
        vec3 c = h > 0. ? mix(hor, top, pow(clamp(h, 0., 1.), .5)) : mix(hor, bot, pow(clamp(-h, 0., 1.), .35));
        for (int i = 0; i < 4; i++){ float a = dot(d, ld[i]); c += lc[i] * smoothstep(1. - ls[i], 1. - ls[i] * .3, a); }
        gl_FragColor = vec4(c, 1.); }`,
  });
  // colours given in sRGB; THREE.Color converts to linear working space automatically
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat));
  const pmrem = new THREE.PMREMGenerator(gl);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  return rt.texture;
};
