// World shaders. All lighting is custom: baked fixture light (static +
// live flickering slots), the player's flashlight, a few dynamic point
// lights, fog and sanity-driven distortion. Output is linear HDR.

import * as THREE from 'three';
import { getTexture } from './textures.js';

export const FIX_TEX_W = 512;
export const FIX_TEX_H = 16;
export const MAX_POINTS = 4;

const fixData = new Float32Array(FIX_TEX_W * FIX_TEX_H * 4);
export const fixTexture = new THREE.DataTexture(fixData, FIX_TEX_W, FIX_TEX_H, THREE.RGBAFormat, THREE.FloatType);
fixTexture.minFilter = THREE.NearestFilter;
fixTexture.magFilter = THREE.NearestFilter;
fixTexture.needsUpdate = true;
export const fixTextureData = fixData;

/** Uniforms shared by every world/object material. */
export const G = {
  uTime: { value: 0 },
  uFixTex: { value: fixTexture },
  uLightScale: { value: 1 },
  uFlashPos: { value: new THREE.Vector3() },
  uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
  uFlashColor: { value: new THREE.Vector3(0, 0, 0) },
  uFlashCone: { value: new THREE.Vector3(Math.cos(0.42), Math.cos(0.16), 22) },
  uFogColor: { value: new THREE.Color(0, 0, 0) },
  uFogDensity: { value: 0.03 },
  uDisturb: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
  uSanity: { value: 0 },
  uPointPos: { value: Array.from({ length: MAX_POINTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uPointCol: { value: Array.from({ length: MAX_POINTS }, () => new THREE.Vector3(0, 0, 0)) },
  uGrimeTex: { value: null },
  uWaterLevel: { value: -999 },
};

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uLightScale;
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform vec3 uFlashColor;
uniform vec3 uFlashCone;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec4 uDisturb[2];
uniform float uSanity;
uniform vec4 uPointPos[${MAX_POINTS}];
uniform vec3 uPointCol[${MAX_POINTS}];

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// localized flicker caused by nearby entities / events
float disturbance(vec3 p) {
  float m = 1.0;
  for (int i = 0; i < 2; i++) {
    vec4 d = uDisturb[i];
    if (d.w <= 0.0) continue;
    float k = 1.0 - smoothstep(d.w * 0.35, d.w, distance(p.xz, d.xz));
    vec2 cell = floor(p.xz / 2.4);
    float t = floor(uTime * 13.0);
    float n = hash12(cell * 1.7 + t * 0.37);
    float n2 = hash12(cell + floor(uTime * 3.0));
    float off = step(0.45, n) * step(0.25, n2);
    m *= 1.0 - k * off * 0.94;
  }
  return m;
}
`;

const FRAG_LIGHTS = /* glsl */ `
vec3 flashlight(vec3 wp, vec3 n) {
  vec3 toL = uFlashPos - wp;
  float d = length(toL);
  vec3 l = toL / max(d, 1e-4);
  float cosA = dot(-l, uFlashDir);
  float spot = smoothstep(uFlashCone.x, uFlashCone.y, cosA);
  float spill = smoothstep(uFlashCone.x - 0.22, uFlashCone.x, cosA) * 0.07;
  float ang = acos(clamp(cosA, -1.0, 1.0)) / max(acos(uFlashCone.x), 1e-3);
  float cookie = 0.7 + 0.55 * exp(-ang * ang * 9.0) + 0.1 * smoothstep(0.55, 0.62, ang) * (1.0 - smoothstep(0.66, 0.75, ang));
  float att = 1.0 / (0.35 + d * d * 0.09);
  att *= 1.0 - smoothstep(uFlashCone.z * 0.55, uFlashCone.z, d);
  float lam = max(dot(n, l), 0.0) * 0.85 + 0.15;
  return uFlashColor * (spot * cookie + spill) * att * lam;
}

vec3 pointLights(vec3 wp, vec3 n) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_POINTS}; i++) {
    vec4 pp = uPointPos[i];
    if (pp.w <= 0.0) continue;
    vec3 toL = pp.xyz - wp;
    float d = length(toL);
    vec3 l = toL / max(d, 1e-4);
    float att = max(0.0, 1.0 - d / pp.w);
    att *= att;
    acc += uPointCol[i] * att * (max(dot(n, l), 0.0) * 0.8 + 0.2);
  }
  return acc;
}

vec3 applyFog(vec3 col, float dist) {
  float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
`;

const WORLD_VERT = /* glsl */ `
${COMMON}
uniform sampler2D uFixTex;
attribute vec3 aStatic;
attribute vec4 aDynW;
attribute vec4 aDynI;
#ifdef FIXTURE
attribute vec3 aEmit;
attribute float aFix;
varying vec3 vEmit;
#endif
varying vec3 vLight;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec2 vUv;
uniform float uWarp;

vec3 dynSlot(float idx) {
  if (idx < 0.0) return vec3(0.0);
  int i = int(idx + 0.5);
  return texelFetch(uFixTex, ivec2(i % ${FIX_TEX_W}, i / ${FIX_TEX_W}), 0).rgb;
}

void main() {
  vec3 p = position;
  #ifdef GLITCH
    float gt = floor(uTime * 18.0);
    float gj = hash12(vec2(floor(p.y * 6.0), gt)) - 0.5;
    p += normal * gj * 0.05 + vec3(gj * 0.06, 0.0, -gj * 0.04) * step(0.6, hash12(vec2(gt, 3.0)));
  #endif
  // sanity: walls slowly breathe
  float br = sin(uTime * 0.9 + p.y * 2.3 + (p.x + p.z) * 0.7) * 0.5 + 0.5;
  p += normal * br * uSanity * uWarp * 0.045;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vec3 L = aStatic;
  L += aDynW.x * dynSlot(aDynI.x);
  L += aDynW.y * dynSlot(aDynI.y);
  L += aDynW.z * dynSlot(aDynI.z);
  L += aDynW.w * dynSlot(aDynI.w);
  float dist = disturbance(wp.xyz);
  vLight = L * uLightScale * dist;
  #ifdef FIXTURE
    float k = 1.0;
    if (aFix >= 0.0) {
      int i = int(aFix + 0.5);
      k = texelFetch(uFixTex, ivec2(i % ${FIX_TEX_W}, i / ${FIX_TEX_W}), 0).a;
    }
    vEmit = aEmit * k * uLightScale * dist;
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WORLD_FRAG = /* glsl */ `
${COMMON}
${FRAG_LIGHTS}
uniform sampler2D map;
uniform sampler2D uGrimeTex;
uniform vec3 uTint;
uniform vec4 uGrime;      // x: stain strength, y: dirt strength, z: stain scale, w: dirt scale
uniform vec3 uStainColor;
uniform float uDamp;      // rising damp near the floor (walls)
uniform float uCaustic;
uniform float uWaterLevel;
uniform float uSpec;      // fake wet sheen strength
uniform vec3 uEmissive;
varying vec3 vLight;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec2 vUv;
#ifdef FIXTURE
varying vec3 vEmit;
#endif

void main() {
  vec3 n = normalize(vNormalW);
  vec3 wp = vWorldPos;
  vec4 tex = texture2D(map, vUv);
  vec3 albedo = tex.rgb * uTint;
  // macro variation breaks texture repetition
  vec2 mp = abs(n.y) > 0.5 ? wp.xz : vec2(wp.x + wp.z, wp.y);
  float stainM = texture2D(uGrimeTex, mp * uGrime.z).r;
  float dirt = texture2D(uGrimeTex, mp * uGrime.w + 0.37).g;
  float fine = texture2D(uGrimeTex, mp * uGrime.w * 4.1).b;
  float st = smoothstep(0.35, 0.95, stainM) * uGrime.x;
  if (abs(n.y) < 0.5) {
    float damp = (1.0 - smoothstep(0.0, 0.55 + stainM * 0.5, wp.y)) * uDamp;
    st = max(st, damp * (0.6 + 0.4 * fine));
  }
  albedo = mix(albedo, albedo * uStainColor, clamp(st, 0.0, 1.0));
  albedo *= 1.0 + (dirt - 0.5) * uGrime.y + (fine - 0.5) * uGrime.y * 0.4;

  vec3 light = vLight + flashlight(wp, n) + pointLights(wp, n);
  if (uCaustic > 0.0 && wp.y < uWaterLevel - 0.03) {
    // dancing pool caustics on submerged surfaces
    vec2 q = wp.xz * 2.3 + vec2(wp.y * 0.7);
    float t = uTime * 0.6;
    float c1 = sin(q.x * 3.1 + t * 1.7 + sin(q.y * 2.3 + t)) + sin(q.y * 3.7 - t * 1.3 + sin(q.x * 1.9 - t * 0.7));
    float c = pow(max(0.0, 1.0 - abs(c1) * 0.6), 6.0);
    light *= 0.85;
    light += vLight * c * uCaustic;
    albedo *= vec3(0.82, 0.95, 1.0);
  }
  vec3 col = albedo * light;
  #ifdef FIXTURE
    col += vEmit * tex.rgb;
  #endif
  col += uEmissive * albedo;

  // cheap wet sheen: brighten grazing view in damp spots
  if (uSpec > 0.0) {
    vec3 v = normalize(cameraPosition - wp);
    float fres = pow(1.0 - max(dot(v, n), 0.0), 4.0);
    col += light * fres * uSpec * (0.3 + st);
  }

  #ifdef GLITCH
    float gt = floor(uTime * 20.0);
    float band = step(0.82, hash12(vec2(floor(wp.y * 14.0), gt)));
    vec3 gc = vec3(hash12(vec2(gt, 1.0)), hash12(vec2(gt, 2.0)), hash12(vec2(gt, 3.0)));
    col = mix(col, gc * 1.8, band * 0.65);
    col += vec3(0.05, 0.08, 0.12) * (0.5 + 0.5 * sin(uTime * 40.0 + wp.y * 30.0));
  #endif

  col = applyFog(col, distance(cameraPosition, wp));
  gl_FragColor = vec4(col, 1.0);
}
`;

const OBJ_VERT = /* glsl */ `
${COMMON}
#include <skinning_pars_vertex>
#include <color_pars_vertex>
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  #include <color_vertex>
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const OBJ_FRAG = /* glsl */ `
${COMMON}
${FRAG_LIGHTS}
#include <color_pars_fragment>
uniform sampler2D map;
uniform vec3 uTint;
uniform vec3 uObjLight;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uRim;
uniform float uAlphaTest;
uniform vec3 uRegion[4];
uniform float uWet;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  vec3 wp = vWorldPos;
  vec4 tex = texture2D(map, vUv);
  if (tex.a < uAlphaTest) discard;
  vec3 albedo = tex.rgb * uTint;
  #if defined( USE_COLOR_ALPHA )
    // baked creature colours: RGB = region masks, A = ambient occlusion
    vec3 reg = uRegion[0] * vColor.r + uRegion[1] * vColor.g + uRegion[2] * vColor.b
      + uRegion[3] * max(0.0, 1.0 - vColor.r - vColor.g - vColor.b);
    albedo *= reg * vColor.a;
  #endif
  float hemi = 0.5 + 0.5 * n.y;
  // the probe has no receiver cosine, so scale it to match baked surfaces
  vec3 light = uObjLight * (0.16 + 0.36 * hemi) * uLightScale * disturbance(wp) + flashlight(wp, n) + pointLights(wp, n);
  vec3 col = albedo * light + uEmissive * tex.rgb;
  vec3 v = normalize(cameraPosition - wp);
  float fres = pow(1.0 - max(dot(v, n), 0.0), 4.0);
  if (uRim > 0.0) col += uObjLight * fres * uRim * (0.5 + 0.5 * hemi);
  if (uWet > 0.0) {
    // wet, waxy skin: a sharp highlight from the flashlight and a sheen at grazing angles
    vec3 toF = normalize(uFlashPos - wp);
    float spec = pow(max(dot(reflect(-toF, n), v), 0.0), 40.0);
    col += uFlashColor * spec * uWet * 0.6 + uObjLight * fres * uWet * 0.12;
  }
  col = applyFog(col, distance(cameraPosition, wp));
  gl_FragColor = vec4(col, uOpacity * tex.a);
}
`;

const matCache = new Map();

/**
 * Create a world surface material.
 * def: { tex, tint, grime:[stain,dirt,stainScale,dirtScale], stainColor, damp, spec, emissive, fixture, glitch, warp }
 */
export function worldMaterial(def) {
  const key = JSON.stringify(def);
  if (matCache.has(key)) return matCache.get(key);
  if (!G.uGrimeTex.value) G.uGrimeTex.value = getTexture('grime');
  const defines = {};
  if (def.fixture) defines.FIXTURE = 1;
  if (def.glitch) defines.GLITCH = 1;
  const m = new THREE.ShaderMaterial({
    vertexShader: WORLD_VERT,
    fragmentShader: WORLD_FRAG,
    defines,
    uniforms: {
      ...G,
      map: { value: getTexture(def.tex || 'white') },
      uTint: { value: new THREE.Color(...(def.tint || [1, 1, 1])) },
      uGrime: { value: new THREE.Vector4(...(def.grime || [0.25, 0.25, 0.07, 0.35])) },
      uStainColor: { value: new THREE.Color(...(def.stainColor || [0.62, 0.5, 0.32])) },
      uDamp: { value: def.damp ?? 0 },
      uSpec: { value: def.spec ?? 0 },
      uEmissive: { value: new THREE.Color(...(def.emissive || [0, 0, 0])) },
      uWarp: { value: def.warp ?? 1 },
      uCaustic: { value: def.caustic ?? 0 },
    },
    side: def.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  matCache.set(key, m);
  return m;
}

/** Material for dynamic objects (entities, items). Not cached: per-object light. */
export function objectMaterial(opts = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: OBJ_VERT,
    fragmentShader: OBJ_FRAG,
    uniforms: {
      ...G,
      map: { value: opts.map || getTexture('white') },
      // object colours are authored as display (sRGB) values
      uTint: { value: new THREE.Color().setRGB(...(opts.tint || [1, 1, 1]), THREE.SRGBColorSpace) },
      uObjLight: { value: new THREE.Vector3(1, 1, 1) },
      uEmissive: { value: new THREE.Color(...(opts.emissive || [0, 0, 0])) },
      uOpacity: { value: opts.opacity ?? 1 },
      uRim: { value: opts.rim ?? 0 },
      uAlphaTest: { value: opts.alphaTest ?? 0 },
      uRegion: { value: (opts.regions || [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]]).map((c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace)) },
      uWet: { value: opts.wet ?? 0 },
    },
    vertexColors: !!opts.vertexColors,
    transparent: !!opts.transparent,
    depthWrite: opts.depthWrite ?? !opts.transparent,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return m;
}

/** Additive glowing sprite/mesh (Smiler faces, eyes, sparks). Fog fades it to nothing. */
export function glowMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: opts.map || getTexture('white') },
      uColor: { value: new THREE.Color(...(opts.color || [1, 1, 1])) },
      uOpacity: { value: opts.opacity ?? 1 },
      uFogDensity: G.uFogDensity,
      uTime: G.uTime,
    },
    vertexShader: /* glsl */ `
      #include <skinning_pars_vertex>
      varying vec2 vUv;
      varying float vDist;
      void main() {
        vUv = uv;
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vDist = distance(wp.xyz, cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uFogDensity;
      uniform float uTime;
      varying vec2 vUv;
      varying float vDist;
      void main() {
        vec4 t = texture2D(map, vUv);
        float fog = exp(-uFogDensity * uFogDensity * vDist * vDist * 0.6);
        float flick = 0.92 + 0.08 * sin(uTime * 23.0 + vDist);
        gl_FragColor = vec4(t.rgb * uColor * uOpacity * fog * flick, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const WATER_FRAG = /* glsl */ `
${COMMON}
${FRAG_LIGHTS}
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uReflect;
uniform float uClarity;
uniform float uSpecular;
varying vec3 vLight;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec2 vUv;

vec3 waveNormal(vec2 p, float t) {
  float e = 0.05;
  float h0 = sin(p.x * 3.0 + t * 1.3) * 0.5 + sin(p.y * 2.6 - t * 1.1) * 0.5 + sin((p.x + p.y) * 5.3 + t * 2.1) * 0.25;
  float hx = sin((p.x + e) * 3.0 + t * 1.3) * 0.5 + sin(p.y * 2.6 - t * 1.1) * 0.5 + sin((p.x + e + p.y) * 5.3 + t * 2.1) * 0.25;
  float hz = sin(p.x * 3.0 + t * 1.3) * 0.5 + sin((p.y + e) * 2.6 - t * 1.1) * 0.5 + sin((p.x + p.y + e) * 5.3 + t * 2.1) * 0.25;
  return normalize(vec3(-(hx - h0) / e * 0.04, 1.0, -(hz - h0) / e * 0.04));
}

void main() {
  vec3 wp = vWorldPos;
  vec3 n = waveNormal(wp.xz, uTime);
  vec3 v = normalize(cameraPosition - wp);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(v, n), 0.0), 5.0);
  vec3 L = vLight;
  vec3 body = mix(uShallow, uDeep, 1.0 - uClarity) * (L + 0.02);
  vec3 refl = uReflect * (0.6 + 0.4 * dot(L, vec3(0.33)));
  vec3 col = mix(body, refl, fres);
  // glints from the lights above
  vec3 r = reflect(-v, n);
  float spec = pow(max(r.y, 0.0), 220.0) * uSpecular;
  col += L * spec * 2.5;
  col += flashlight(wp, n) * (0.12 + fres * 1.5) * vec3(0.65, 0.75, 0.8);
  col = applyFog(col, distance(cameraPosition, wp));
  float alpha = mix(uClarity < 0.5 ? 0.97 : 0.42, 0.98, fres);
  gl_FragColor = vec4(col, alpha);
}
`;

export function waterMaterial(def) {
  return new THREE.ShaderMaterial({
    vertexShader: WORLD_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: {
      ...G,
      uWarp: { value: 0 },
      uDeep: { value: new THREE.Color(...(def.deep || [0.01, 0.02, 0.03])) },
      uShallow: { value: new THREE.Color(...(def.shallow || [0.3, 0.6, 0.65])) },
      uReflect: { value: new THREE.Color(...(def.reflect || [0.6, 0.65, 0.7])) },
      uClarity: { value: def.clarity ?? 0.8 },
      uSpecular: { value: def.specular ?? 1 },
    },
    transparent: true,
    depthWrite: false,
  });
}
