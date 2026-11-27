// SPIKE (?spike=env, throwaway): the art spec v1.5 environment on the GPU: the dawn sky with sun, glow and the Pyrenees
// ridge layers in one sky shader, and the spec's pine and fir profiles as the instanced tree model. Read from look.spikeEnv.
import { hexRgb } from '../look/look.js';
import { PROJECT_GLSL } from './gl-projection.js';
import { FOG_GLSL } from './snow-material.js';
import { SUN_VISIBILITY_GLSL, SUN_LIGHT_GLSL } from './sun-visibility.js';
import { FOV } from '../../core/config.js';

const DEG = Math.PI / 180;
const MAX_PEAKS = 12;
const rgb01 = (hex) => hexRgb(hex).map((v) => v / 255);
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** The fragment shader of the spike sky: per pixel azimuth and elevation, dawn gradient, sun, ridge layers. */
export const SPIKE_SKY_FRAGMENT = `
precision highp float;
uniform vec2 uRows;     // horizon row (px from the top), canvas height (px)
uniform vec4 uView;     // focal (px), canvas width (px), camera azimuth (deg, in the map's frame)
uniform vec3 uSkyCol[5];
uniform vec4 uSunPos;   // sun azimuth, elevation (deg), disc radius, glow radius (deg)
uniform vec3 uSunCol;
uniform vec3 uGlowCol;
uniform vec3 uMidCol;
uniform sampler2D uRidge; // 720 samples of 0.5 deg bearing by 3 layers: height, cap line (deg), light 0..1
uniform vec3 uLayerCol[9];
out vec4 outColour;
const float FOV = ${FOV.toFixed(4)};
float angDiff(float a, float b) { return mod(a - b + 540.0, 360.0) - 180.0; }
float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
void main() {
 float py = uRows.y - gl_FragCoord.y;
 float rel = (gl_FragCoord.x / uView.y - 0.5) * FOV;
 float az = uView.z + degrees(rel);
 float el = degrees(atan((uRows.x - py) * cos(rel) / uView.x));
 float pxDeg = degrees(1.0 / uView.x);
 float sd = abs(angDiff(az, uSunPos.x));
 float dawn = sd < 90.0 ? 14.0 + 12.0 * cos(radians(sd)) : mix(14.0, 8.0, (sd - 90.0) / 90.0);
 float cool = clamp((sd - 90.0) / 90.0, 0.0, 1.0);
 vec3 horizon = mix(uSkyCol[3], uMidCol, 0.3 * cool);
 vec3 c;
 if (el >= 45.0) c = mix(uSkyCol[1], uSkyCol[0], clamp((el - 45.0) / 45.0, 0.0, 1.0));
 else if (el >= dawn) c = mix(uSkyCol[2], uSkyCol[1], (el - dawn) / max(45.0 - dawn, 1e-3));
 else if (el >= 0.0) c = mix(horizon, uSkyCol[2], el / dawn);
 else c = mix(horizon, uSkyCol[4], clamp(-el / 4.0, 0.0, 1.0));
 // the glow along the horizon, then the sun's glow and disc
 float band = 0.35 * clamp(1.0 - sd / 45.0, 0.0, 1.0) * clamp(1.0 - el / 8.0, 0.0, 1.0) * step(-4.0, el);
 c = mix(c, uGlowCol, band);
 float d = length(vec2(angDiff(az, uSunPos.x) * cos(radians(uSunPos.y)), el - uSunPos.y));
 float g = clamp(1.0 - d / uSunPos.w, 0.0, 1.0);
 c = mix(c, uGlowCol, 0.6 * g * g);
 c = mix(c, uSunCol, clamp((uSunPos.z - d) / pxDeg + 0.5, 0.0, 1.0));
 // ridge layers, far to near, each over the last
 float u = mod(az, 360.0) / 0.5;
 int i0 = int(floor(u)) % 720;
 int i1 = (i0 + 1) % 720;
 for (int layer = 0; layer < 3; layer++) {
  vec4 r = mix(texelFetch(uRidge, ivec2(i0, layer), 0), texelFetch(uRidge, ivec2(i1, layer), 0), fract(u));
  float cover = clamp((r.x - el) / pxDeg + 0.5, 0.0, 1.0);
  if (cover <= 0.0) continue;
  float lit = smoothstep(0.3, 0.7, r.z);
  vec3 m = mix(uLayerCol[layer * 3 + 1], uLayerCol[layer * 3], lit);
  if (el > r.y) m = mix(uLayerCol[layer * 3 + 2], uLayerCol[layer * 3 + 1], 0.3 * (1.0 - lit));
  m = mix(m, uSkyCol[4], smoothstep(0.0, -2.5, el)); // the foot of the ridge fades into the horizon haze
  c = mix(c, m, cover);
 }
 outColour = vec4(c, 1.0);
}
`;

const RIDGE_N = 720; // samples round the compass, 0.5 deg apart
const CAP_FRAC = 0.35; // the snow cap is the top 35% of a lifted summit (art-directed)
const nz = (x, seed) => {
 const f = (k) => { const v = Math.sin(k * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); };
 const i = Math.floor(x);
 const t = x - i;
 return f(i) + (f(i + 1) - f(i)) * t * t * (3 - 2 * t);
};
const angDiff = (a, b) => ((a - b + 540) % 360 + 360) % 360 - 180;

/** The uniform values of the spike sky for the Look's spikeEnv; rotationDeg: the map frame's. Ridge: Float32Array RGBA. */
export function spikeSkyValues(env, rotationDeg) {
 const layerIndex = { far: 0, mid: 1, near: 2 };
 const haze = rgb01(env.sky.haze);
 const exag = env.backdrop.ridge.verticalExaggeration;
 const floor = env.backdrop.ridge.floorElevDeg;
 const sunAz = env.sun.azimuthDeg - rotationDeg;
 const ridge = new Float32Array(RIDGE_N * 3 * 4);
 const rough = { far: 0.8, mid: 0.5, near: 0.3 };
 for (const L of env.backdrop.layers) {
  const row = layerIndex[L.id];
  const peaks = env.backdrop.peaks.filter((p) => p.layer === L.id).map((p) => ({
   az: p.bearingCompassDeg - rotationDeg, apex: p.elevDeg * exag, half: Math.atan(p.halfWidthM / p.distM) / DEG,
  }));
  for (let i = 0; i < RIDGE_N; i++) {
   const az = i * 0.5;
   let h = -0.7 + rough[L.id] * (nz(az / 6, row + 1) + 0.5 * nz(az / 1.5, row + 7) - 0.4);
   let apex = h;
   let flank = 0;
   let lit = 0.5;
   for (const p of peaks) {
    const d = angDiff(az, p.az);
    if (Math.abs(d) >= p.half) continue;
    const shape = Math.pow(1 - Math.abs(d) / p.half, 1.35) * (1 + 0.14 * (nz(az * 1.3, row + 3) - 0.5));
    const v = floor + (p.apex - floor) * shape;
    if (v > h) {
     h = v;
     apex = p.apex;
     flank = d;
     const normalAz = p.az + (d > 0 ? 135 : 225);
     lit = Math.cos((sunAz - normalAz) * DEG) * 0.5 + 0.5;
    }
   }
   const capLine = apex - CAP_FRAC * (apex - floor) + 0.12 * apex * (nz(az * 2, row + 5) - 0.5);
   ridge.set([h, apex === h && flank === 0 ? 99 : capLine, lit, 0], (row * RIDGE_N + i) * 4);
  }
 }
 const cols = new Float32Array(9 * 3);
 for (const l of env.backdrop.layers) {
  [l.fill, l.shade, l.cap].forEach((hex, k) => {
   cols.set(mixRgb(rgb01(hex), haze, l.hazeMix), layerIndex[l.id] * 9 + k * 3);
  });
 }
 const s = env.sky;
 return {
  skyCol: new Float32Array(s.stops.flatMap((st) => rgb01(st.colour))),
  sunPos: [env.sun.azimuthDeg - rotationDeg, env.sun.elevationDeg, s.sun.discDiameterDeg / 2, s.sun.glow.radiusDeg],
  sunCol: rgb01(s.sunColour), glowCol: rgb01(s.glowColour), midCol: rgb01(s.skyMid), ridge, cols, ridgeN: RIDGE_N,
 };
}

/** Spike-only trees along the course edges below the treeline: [{x, y}] world m, seeded (density bands of the spec, per ha). */
export function spikePlant(course, terrain, treeline) {
 const out = [];
 const h = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
 const step = 5; // m of course between planting rows
 for (let s = Math.max(0, course.startS - 100); s < course.finishS; s += step) {
  for (const side of [-1, 1]) {
   for (let k = 0; k < 4; k++) {
    const off = course.widthAt(s) / 2 + 9 + h(s, side * (k + 1)) * 70;
    const p = course.point(s, side * off, {});
    const z = terrain.height(p.x, p.y);
    const perHa = z > treeline[0] ? 0 : z > treeline[1] ? 20 : z > treeline[2] ? 100 : 350;
    // each row covers step x 70 m = 0.35 ha shared by 4 candidates
    if (h(s * 1.7 + k, side * 3.1) < perHa * (step * 70 / 1e4) / 4) out.push({ x: p.x, y: p.y });
   }
  }
 }
 return out;
}

// ---- trees: the spec's profile as tiered cones, in the species' own lit / body / shade roles with snow on each tier ----

const SIDES = 6;
const TRUNK_R_M = 0.25;

function pushQuad(g, A, B, spec, part, seg0, seg1) {
 for (let i = 0; i < SIDES; i++) {
  const a0 = i / SIDES * 2 * Math.PI;
  const a1 = (i + 1) / SIDES * 2 * Math.PI;
  const ring = (q, a) => [Math.cos(a) * q[0], Math.sin(a) * q[0], q[1]];
  const A0 = ring(A, a0);
  const A1 = ring(A, a1);
  const B0 = ring(B, a0);
  const B1 = ring(B, a1);
  const u = A1.map((v, k) => v - A0[k]);
  const w = B0.map((v, k) => v - A0[k]);
  let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  const mid = (a0 + a1) / 2;
  const flip = n[0] * Math.cos(mid) + n[1] * Math.sin(mid) < 0 ? -1 : 1;
  n = n.map((v) => v / len * flip);
  for (const [p, seg] of [[A0, seg0], [A1, seg0], [B1, seg1], [A0, seg0], [B1, seg1], [B0, seg1]]) {
   g.positions.push(p[0], p[1], p[2]);
   g.normals.push(n[0], n[1], n[2]);
   g.attrs.push(part, seg, spec);
  }
 }
}

/** The pine and fir models in one buffer set: {positions, normals, parts (part 0 trunk 1 crown, snow param, species)}. */
export function spikeTreeGeometry(trees) {
 const g = { positions: [], normals: [], attrs: [] };
 [trees.pine, trees.fir].forEach((sp, spec) => {
  const k = sp.typicalM / sp.heightM;
  const list = sp.profile.slice(2).map((q) => [q[0] * k, q[1] * k]);
  pushQuad(g, [TRUNK_R_M, -0.4], [TRUNK_R_M, list[0][1]], spec, 0, -1, -1);
  for (let i = 0; i < list.length - 1; i++) {
   const upper = i % 2 === 0 || i === list.length - 2;
   pushQuad(g, list[i], list[i + 1], spec, 1, upper ? 0 : -1, upper ? 1 : -1);
  }
 });
 return {
  positions: Float32Array.from(g.positions), normals: Float32Array.from(g.normals),
  parts: Float32Array.from(g.attrs), triangles: g.attrs.length / 9,
 };
}

/** The spike trees' colours: 12 rgb triples (pine then fir: lit, body, shade, trunk, snow, snowShade), cover per species. */
export function spikeTreeColours(trees) {
 const rows = [trees.pine, trees.fir].flatMap((s) => [s.lit, s.body, s.shade, s.trunk, s.snow, s.snowShade]);
 return { cols: new Float32Array(rows.flatMap(rgb01)), cover: [trees.pine.cover, trees.fir.cover] };
}

export const SPIKE_TREE_VERTEX = `
precision highp float;
precision highp int;
in vec3 position;
in vec3 normal;
in vec3 aPart;   // part (0 trunk, 1 crown), snow parameter (0 outer edge .. 1 notch, -1 none), species
in vec4 aTree;
in vec2 aStyle;
uniform vec2 uFade;
uniform float uSunSample;
uniform float uFirShare;
out vec3 vNormal;
out float vVisible;
out vec2 vPart;
flat out int vSpec;
out float vTone;
out float vDist;
${PROJECT_GLSL}
${SUN_VISIBILITY_GLSL}
${SUN_LIGHT_GLSL}
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
 float species = h21(aTree.xy) < uFirShare ? 1.0 : 0.0;
 if (abs(aPart.z - species) > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
 vec2 o = aTree.xy - uCam.xy;
 vVisible = sunVisibilityAt(aTree.xy + normalize(uObjSun.xy) * uSunSample);
 float f = dot(o, uDir);
 float scale = aTree.w * (0.8 + 0.5 * h21(aTree.yx)) * (1.0 - smoothstep(uFade.x, uFade.y, f));
 float c = cos(aStyle.x);
 float s = sin(aStyle.x);
 vec2 local = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * scale;
 vec2 offset = o + local;
 float h = aTree.z + position.z * scale;
 gl_Position = projectToClip(offset, h);
 vNormal = vec3(normal.x * c - normal.y * s, normal.x * s + normal.y * c, normal.z);
 vPart = aPart.xy;
 vSpec = int(aPart.z + 0.5);
 vTone = aStyle.y;
 vDist = length(vec3(offset, h - uCam.z));
}
`;

export const SPIKE_TREE_FRAGMENT = `
precision highp float;
in vec3 vNormal;
in float vVisible;
in vec2 vPart;
flat in int vSpec;
in float vTone;
in float vDist;
uniform vec3 uTreeCol[12];
uniform vec2 uCover;
uniform vec3 uFog;
out vec4 outColour;
${FOG_GLSL}
uniform vec3 uObjSun;
void main() {
 vec3 n = normalize(vNormal);
 float t = smoothstep(0.0, 0.5, clamp(dot(n, uObjSun), 0.0, 1.0) * vVisible);
 int b = vSpec * 6;
 vec3 crown = mix(mix(uTreeCol[b + 2], uTreeCol[b + 1], clamp(t * 2.0, 0.0, 1.0)), uTreeCol[b], clamp(t * 2.0 - 1.0, 0.0, 1.0));
 vec3 base = vPart.x < 0.5 ? uTreeCol[b + 3] * (0.6 + 0.4 * t) : crown;
 bool snowy = vPart.y >= 0.0 && vPart.y >= 1.0 - (vSpec == 0 ? uCover.x : uCover.y);
 if (snowy) base = mix(uTreeCol[b + 5], uTreeCol[b + 4], t);
 vec3 c = mix(base * vTone, uFog, fogAmount(vDist));
 outColour = vec4(c, 1.0);
}
`;
