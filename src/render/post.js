// Post-processing: HDR scene -> bloom -> final grading pass (tonemap,
// colour grade, vignette, grain, sanity distortion, VHS camcorder mode).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.045 },
    uCA: { value: 0.0015 },
    uVHS: { value: 0 },
    uSanity: { value: 0 },
    uDamage: { value: 0 },
    uFade: { value: 0 },
    uGlitch: { value: 0 },
    uBlink: { value: 0 },
    uRedTint: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uExposure;
    uniform vec3 uTint;
    uniform float uSat;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uCA;
    uniform float uVHS;
    uniform float uSanity;
    uniform float uDamage;
    uniform float uFade;
    uniform float uGlitch;
    uniform float uBlink;
    uniform float uRedTint;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

    // filmic curve (ACES approximation, Narkowicz)
    vec3 aces(vec3 x) {
      const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }

    vec3 sampleScene(vec2 uv) { return texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb; }

    void main() {
      vec2 uv = vUv;
      float t = uTime;

      // ---- sanity: wavy distortion and slow drift
      if (uSanity > 0.0) {
        float s = uSanity * uSanity;
        uv.x += sin(uv.y * 9.0 + t * 1.3) * 0.006 * s;
        uv.y += cos(uv.x * 7.0 + t * 1.1) * 0.005 * s;
        vec2 c = uv - 0.5;
        uv = 0.5 + c * (1.0 - 0.025 * s * (0.5 + 0.5 * sin(t * 0.7)));
      }

      // ---- noclip glitch: block displacement
      if (uGlitch > 0.0) {
        float bt = floor(t * 24.0);
        float row = floor(uv.y * 24.0);
        float r = hash(vec2(row, bt));
        if (r < uGlitch * 0.6) uv.x += (hash(vec2(bt, row)) - 0.5) * 0.25 * uGlitch;
        if (hash(vec2(bt, 7.0)) < uGlitch * 0.3) uv.y += (hash(vec2(bt, 9.0)) - 0.5) * 0.1;
      }

      // ---- VHS: line quantization, tracking wobble
      float vhs = uVHS;
      if (vhs > 0.0) {
        float lines = 480.0;
        uv.y = mix(uv.y, (floor(uv.y * lines) + 0.5) / lines, vhs);
        float wob = sin(uv.y * 300.0 + t * 7.0) * 0.0006 + (hash(vec2(floor(uv.y * lines), floor(t * 30.0))) - 0.5) * 0.0012;
        // tracking band rolling down the frame
        float band = smoothstep(0.03, 0.0, abs(fract(t * 0.07) - (1.0 - uv.y)));
        wob += band * (hash(vec2(floor(uv.y * 200.0), floor(t * 50.0))) - 0.5) * 0.02;
        uv.x += wob * vhs;
      }

      // ---- chromatic aberration (radial)
      vec2 dc = uv - 0.5;
      float ca = uCA + uSanity * 0.004 + uGlitch * 0.012 + vhs * 0.0025;
      vec3 col;
      col.r = sampleScene(uv + dc * ca * 2.0).r;
      col.g = sampleScene(uv).g;
      col.b = sampleScene(uv - dc * ca * 2.0).b;

      if (vhs > 0.0) {
        // chroma bleed: smear colour horizontally
        vec3 bl = vec3(0.0);
        for (int i = 1; i <= 4; i++) {
          bl += sampleScene(uv - vec2(float(i) * 0.0018, 0.0));
        }
        bl /= 4.0;
        float yl = dot(col, vec3(0.299, 0.587, 0.114));
        float yb = dot(bl, vec3(0.299, 0.587, 0.114));
        vec3 chroma = bl - yb;
        col = mix(col, vec3(yl) + chroma, 0.65 * vhs);
      }

      // ---- exposure + tonemap
      col *= uExposure;
      col = aces(col);

      // ---- grade
      col *= uTint;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float sat = uSat * (1.0 - uSanity * 0.45);
      col = mix(vec3(luma), col, sat);
      col = (col - 0.5) * uContrast + 0.5;
      col = mix(col, col * vec3(1.25, 0.35, 0.3), uRedTint);

      // ---- VHS colour + noise
      if (vhs > 0.0) {
        col = mix(col, col * vec3(1.03, 1.02, 0.92) + vec3(0.015, 0.02, 0.01), vhs);
        float scan = 0.94 + 0.06 * sin(vUv.y * uRes.y * 1.5);
        col *= mix(1.0, scan, vhs);
        float sn = hash(vec2(floor(vUv.x * uRes.x * 0.5), floor(vUv.y * 480.0)) + fract(t * 13.1));
        col += (sn - 0.5) * 0.06 * vhs;
        // occasional white noise speckle line
        float sp = step(0.9985, hash(vec2(floor(vUv.y * 480.0), floor(t * 24.0))));
        col += sp * hash(vec2(vUv.x * 50.0, t)) * 0.5 * vhs;
        // soft rounded-corner darkening of old camcorder optics
        vec2 q = vUv * (1.0 - vUv.yx);
        col *= mix(1.0, pow(q.x * q.y * 18.0, 0.18), vhs);
      }

      // ---- vignette
      float vig = smoothstep(0.85, 0.18, length(dc * vec2(1.0, 0.85)) * (1.0 + uVignette));
      col *= mix(1.0, vig, 0.7 + uSanity * 0.3);

      // ---- film grain
      float g = hash3(vec3(vUv * uRes, fract(t * 7.0) * 100.0)) - 0.5;
      col += g * (uGrain + uSanity * 0.05) * (0.6 + 0.4 * (1.0 - luma));

      // ---- damage flash, blink and fade
      col = mix(col, vec3(0.5, 0.0, 0.0), uDamage * 0.55 * smoothstep(0.2, 0.9, length(dc) * 1.6));
      float lid = smoothstep(0.0, 1.0, uBlink);
      float lidEdge = abs(vUv.y - 0.5) * 2.0;
      col *= 1.0 - step(1.0 - lid, lidEdge) * lid * 1.0;
      col *= 1.0 - uFade;

      gl_FragColor = vec4(toSRGB(col), 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.28, 1.7);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.u = this.final.uniforms;
    this.bloomEnabled = true;
  }
  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.u.uRes.value.set(w * pr, h * pr);
  }
  setBloom(on) {
    this.bloomEnabled = on;
    this.bloom.enabled = on;
  }
  render(dt) {
    this.composer.render(dt);
  }
}
