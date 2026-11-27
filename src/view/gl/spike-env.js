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
uniform vec4 uPeak[${MAX_PEAKS}]; // azimuth (deg), apex elevation (deg), half width (deg), layer (0 far .. 2 near)
uniform float uCapDepth[${MAX_PEAKS}]; // deg
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
 for (int layer = 0; layer < 3; layer++) {
  float best = -90.0;
  float bestApex = 0.0;
  float bestDiff = 0.0;
  float bestCap = 0.0;
  for (int i = 0; i < ${MAX_PEAKS}; i++) {
   if (int(uPeak[i].w + 0.5) != layer) continue;
   float dz = angDiff(az, uPeak[i].x);
   float h = uPeak[i].y - (uPeak[i].y + 1.0) * abs(dz) / uPeak[i].z;
   if (h > best) { best = h; bestApex = uPeak[i].y; bestDiff = dz; bestCap = uCapDepth[i]; }
  }
  float cover = clamp((best - el) / pxDeg + 0.5, 0.0, 1.0);
  if (cover <= 0.0) continue;
  float cell = az / 2.0;
  float noise = mix(hash(floor(cell)), hash(floor(cell) + 1.0), fract(cell));
  float capLine = bestApex - bestCap * (1.0 + 0.5 * (noise - 0.5));
  float sunSide = sign(angDiff(uSunPos.x, az - bestDiff));
  bool shaded = bestDiff * sunSide < 0.0;
  vec3 fill = uLayerCol[layer * 3];
  vec3 shade = uLayerCol[layer * 3 + 1];
  vec3 cap = uLayerCol[layer * 3 + 2];
  vec3 m = shaded ? shade : fill;
  if (el > capLine) m = shaded ? mix(cap, shade, 0.3) : cap;
  c = mix(c, m, cover);
 }
 outColour = vec4(c, 1.0);
}
`;

/** The uniform values of the spike sky (plain numbers and arrays) for the Look's spikeEnv; rotationDeg: the map frame's. */
export function spikeSkyValues(env, rotationDeg) {
 const pk = env.backdrop.peaks;
 const layerIndex = { far: 0, mid: 1, near: 2 };
 const haze = rgb01(env.sky.haze);
 const peaks = new Float32Array(MAX_PEAKS * 4);
 const caps = new Float32Array(MAX_PEAKS);
 pk.slice(0, MAX_PEAKS).forEach((p, i) => {
  const layer = env.backdrop.layers.find((l) => l.id === p.layer);
  const exag = env.backdrop.ridge.verticalExaggeration;
  peaks.set([p.bearingCompassDeg - rotationDeg, p.elevDeg * exag, Math.atan(p.halfWidthM / p.distM) / DEG,
   layerIndex[p.layer]], i * 4);
  const depthM = Math.min(layer.capRule.depthM, p.altM - layer.capRule.snowlineM);
  caps[i] = depthM / p.distM / DEG; // the cap's depth in true degrees (not lifted by the exaggeration)
 });
 for (let i = pk.length; i < MAX_PEAKS; i++) peaks[i * 4 + 3] = -1;
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
  sunCol: rgb01(s.sunColour), glowCol: rgb01(s.glowColour), midCol: rgb01(s.skyMid), peaks, caps, cols,
 };
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
