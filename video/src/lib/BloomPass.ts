import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

const VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

// 13-tap downsample (Jimenez, "Next generation post processing in Call of Duty"), with an
// optional soft-knee threshold on the first level.
const DOWN = /* glsl */ `
  uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold, uKnee, uFirst; varying vec2 vUv;
  vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
  void main(){
    vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
    vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
    vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
    vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
    vec3 col = e * .125 + (a + c + g + i) * .03125 + (b + d + f + h) * .0625 + (j + k + l + m) * .125;
    if (uFirst > .5) {
      col = min(col, vec3(60.));
      float br = max(col.r, max(col.g, col.b));
      float soft = clamp(br - uThreshold + uKnee, 0., 2. * uKnee);
      soft = soft * soft / (4. * uKnee + 1e-4);
      col *= max(soft, br - uThreshold) / max(br, 1e-4);
    }
    gl_FragColor = vec4(col, 1.);
  }`;

// 9-tap tent upsample of the lower level, added to this level.
const UP = /* glsl */ `
  uniform sampler2D tLow, tBase; uniform vec2 uTexel; uniform float uRadius; varying vec2 vUv;
  vec3 s(vec2 o){ return texture2D(tLow, vUv + o * uTexel * uRadius).rgb; }
  void main(){
    vec3 col = s(vec2(0)) * 4. + (s(vec2(-1, 0)) + s(vec2(1, 0)) + s(vec2(0, -1)) + s(vec2(0, 1))) * 2.
             + s(vec2(-1, -1)) + s(vec2(1, -1)) + s(vec2(-1, 1)) + s(vec2(1, 1));
    gl_FragColor = vec4(texture2D(tBase, vUv).rgb + col / 16., 1.);
  }`;

const COMBINE = /* glsl */ `
  uniform sampler2D tScene, tBloom; uniform float uStrength; varying vec2 vUv;
  void main(){ gl_FragColor = vec4(texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uStrength, 1.); }`;

export class BloomPass extends Pass {
  strength = 0.7;
  radius = 1.0;
  threshold = 0.8;
  knee = 0.5;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private quad = new FullScreenQuad();
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private combineMat: THREE.ShaderMaterial;

  constructor(width: number, height: number, private levels = 6) {
    super();
    const mk = () =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      });
    for (let i = 0; i < levels; i++) {
      this.down.push(mk());
      this.up.push(mk());
    }
    this.downMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: DOWN, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 }, uKnee: { value: 0.5 }, uFirst: { value: 0 } },
    });
    this.upMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: UP, depthTest: false, depthWrite: false,
      uniforms: { tLow: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } },
    });
    this.combineMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: COMBINE, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: null }, tBloom: { value: null }, uStrength: { value: 1 } },
    });
    this.setSize(width, height);
  }

  setSize(width: number, height: number) {
    let w = width, h = height;
    for (let i = 0; i < this.levels; i++) {
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
      this.down[i].setSize(w, h);
      this.up[i].setSize(w, h);
    }
  }

  private draw(renderer: THREE.WebGLRenderer, mat: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    renderer.setRenderTarget(target);
    if (target) renderer.setViewport(0, 0, target.width, target.height);
    this.quad.material = mat;
    this.quad.render(renderer);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const L = this.levels;
    const du = this.downMat.uniforms;
    du.uThreshold.value = this.threshold;
    du.uKnee.value = this.knee;
    let src: THREE.WebGLRenderTarget = readBuffer;
    for (let i = 0; i < L; i++) {
      du.tSrc.value = src.texture;
      du.uTexel.value.set(1 / src.width, 1 / src.height);
      du.uFirst.value = i === 0 ? 1 : 0;
      this.draw(renderer, this.downMat, this.down[i]);
      src = this.down[i];
    }
    const uu = this.upMat.uniforms;
    uu.uRadius.value = this.radius;
    let low = this.down[L - 1];
    for (let i = L - 2; i >= 0; i--) {
      uu.tLow.value = low.texture;
      uu.tBase.value = this.down[i].texture;
      uu.uTexel.value.set(1 / low.width, 1 / low.height);
      this.draw(renderer, this.upMat, this.up[i]);
      low = this.up[i];
    }
    const cu = this.combineMat.uniforms;
    cu.tScene.value = readBuffer.texture;
    cu.tBloom.value = this.up[0].texture;
    cu.uStrength.value = this.strength / L;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.quad.material = this.combineMat;
      this.quad.render(renderer);
    } else {
      this.draw(renderer, this.combineMat, writeBuffer);
    }
  }

  dispose() {
    [...this.down, ...this.up].forEach((r) => r.dispose());
    this.downMat.dispose(); this.upMat.dispose(); this.combineMat.dispose(); this.quad.dispose();
  }
}
