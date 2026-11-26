// The terrain park on the GPU (E3b): kicker ramps with their lip bars, flags with poles, rails and boxes with posts, as
// one static mesh built once from the Course and the Terrain (positions in world m, sitting on the snow), lit by the
// Look's sun and the baked sun visibility (sun-visibility.js) and fogged by its fog. Each frame only the features in
// view have their triangles copied into the index buffer (no allocation). Pure parts (geometry, culling, colours,
// memory) are tested in Node; the GL part is createParkMesh(). docs/adr/0008-three-js-gpu-renderer.md.
import { PROJECT_GLSL, NEAR_M } from './gl-projection.js';
import { FOG_GLSL } from './snow-material.js';
import { SUN_VISIBILITY_GLSL, SUN_LIGHT_GLSL } from './sun-visibility.js';
import { hexRgb } from '../look/look.js';
import { KICKER_FLAG_D, RAMP_FLAG_BACK_M, KICKER_RAMP_M, RAIL_FLAG_D } from '../sprites.js';
import { treeLook } from './tree-mesh.js';
import { FOV } from '../../core/config.js';

// The sprites' flag and ramp placement, which the mesh keeps (tests read them from here).
export { KICKER_FLAG_D, KICKER_RAMP_M };

/** m along the view, features further than this are not drawn (the fog has taken them). */
export const PARK_FAR_M = 300;

/** Tunables of the park objects. Lengths are metres. */
export const PARK = Object.freeze({
 LIFT_M: 0.1,             // m, the ramp surface and the bars above the snow (the coarse terrain levels lie a little off)
 PAD_ALONG: 10,           // cells along a kicker's ramp
 PAD_ACROSS: 6,           // cells across it
 LIP_HALF_ALONG_M: 0.35,  // m, half the lip bar's width along the piste
 LIP_HALF_HEIGHT_M: 0.14, // m, half its height
 LIP_RISE_M: 0.2,         // m, its centre above the ramp surface
 EDGE_HALF_ALONG_M: 0.2,  // m, half the width of the bars along the ramp's sides
 EDGE_HALF_HEIGHT_M: 0.08,
 POLE_HALF_M: 0.06,       // m, half the side of a pole (square)
 PENNANT_LENGTH_M: 1.1,   // m, how far a pennant streams from its pole
 PENNANT_DROP_M: 0.65,    // m, its height at the pole
 RAIL_SEGMENT_M: 1.5,     // m, a rail is built in pieces this long so it follows the snow (the sprites' too)
 RAIL_POST_EVERY_M: 6,    // m between the posts under a rail
 RAIL_HALF_WIDTH_M: 0.07, // m, a rail bar's half width and half height
 RAIL_HALF_HEIGHT_M: 0.06,
 BOX_HALF_WIDTH_M: 0.45,  // m, a box's half width and half height
 BOX_HALF_HEIGHT_M: 0.12,
 RAIL_POST_HALF_M: 0.05,
 BOX_POST_HALF_M: 0.22,
 KICKER_FLAG_HEIGHT_M: 2.4, // m, a small kicker's poles (the sprites' heights)
 BIG_KICKER_FLAG_HEIGHT_M: 3.2,
 RAIL_FLAG_HEIGHT_M: 1.8,
 GRADIENT_STEP_M: 0.5,    // m, the step the ground's normal is measured over
});

/** Kinds of feature in the table, as the number stored in it. */
export const FEATURE_KIND = Object.freeze({ KICKER: 0, RAIL: 1, FLAG: 2 });
/** Numbers per feature in the table: x, y (m, world), radius (m), first index, index count, kind. */
export const FEATURE_STRIDE = 6;

const CULL_MARGIN_M = 2; // m, extra radius a feature is kept in view for (the pennants stream past their pole)

// Growing lists of the mesh being built (boot only).
function newBuild() {
 return { positions: [], normals: [], colours: [], indices: [], features: [] };
}

function pushVertex(g, p, n, c) {
 g.positions.push(p[0], p[1], p[2]);
 g.normals.push(n[0], n[1], n[2]);
 g.colours.push(c[0], c[1], c[2]);
 return g.positions.length / 3 - 1;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => {
 const l = Math.hypot(a[0], a[1], a[2]) || 1;
 return [a[0] / l, a[1] / l, a[2] / l];
};

// A flat quad of corners a, b, c, d (in order around it) facing n (unit): wound counter-clockwise seen from n's side.
function addQuad(g, a, b, c, d, n, col) {
 const facing = dot(cross(sub(b, a), sub(c, a)), n) >= 0;
 const o = facing ? [a, b, c, d] : [a, d, c, b];
 const v = o.map((p) => pushVertex(g, p, n, col));
 g.indices.push(v[0], v[1], v[2], v[0], v[2], v[3]);
}

// A beam from a to b (m, [x, y, z]) of half width hw (across, horizontal) and half height ht, flat-shaded, with every
// face but the underside. side: the horizontal direction across the beam (default: from the beam's own direction).
function addBeam(g, a, b, hw, ht, col, side = null) {
 const dir = unit(sub(b, a));
 const across = side ?? (Math.hypot(dir[0], dir[1]) > 1e-6 ? unit(cross(dir, [0, 0, 1])) : [1, 0, 0]);
 const up = unit(cross(across, dir));
 const corner = (p, sa, su) => [p[0] + across[0] * hw * sa + up[0] * ht * su, p[1] + across[1] * hw * sa +
  up[1] * ht * su, p[2] + across[2] * hw * sa + up[2] * ht * su];
 const a00 = corner(a, -1, -1);
 const a10 = corner(a, 1, -1);
 const a11 = corner(a, 1, 1);
 const a01 = corner(a, -1, 1);
 const b00 = corner(b, -1, -1);
 const b10 = corner(b, 1, -1);
 const b11 = corner(b, 1, 1);
 const b01 = corner(b, -1, 1);
 addQuad(g, a01, a11, b11, b01, up, col);
 addQuad(g, a10, a11, b11, b10, across, col);
 addQuad(g, a00, a01, b01, b00, across.map((x) => -x), col);
 addQuad(g, a00, a10, a11, a01, dir.map((x) => -x), col);
 addQuad(g, b00, b10, b11, b01, dir, col);
}

// The ground's unit normal at (x, y) (m) from the terrain's height.
function groundNormal(terrain, x, y) {
 const e = PARK.GRADIENT_STEP_M;
 const gx = (terrain.height(x + e, y) - terrain.height(x - e, y)) / (2 * e);
 const gy = (terrain.height(x, y + e) - terrain.height(x, y - e)) / (2 * e);
 return unit([-gx, -gy, 1]);
}

// Opens a feature: returns where its triangles start, to close with endFeature().
const beginFeature = (g) => g.indices.length;

// Closes a feature: its centre (x, y m), radius (m) and kind, with the index range it added.
function endFeature(g, start, x, y, radius, kind) {
 g.features.push(x, y, radius, start, g.indices.length - start, kind);
}

// A point of the course at (s, d) lying on the snow, lifted by rise m: [x, y, z].
function onSnow(course, terrain, s, d, rise, scratch) {
 course.point(s, d, scratch);
 return [scratch.x, scratch.y, terrain.height(scratch.x, scratch.y) + rise];
}

// One kicker: the ramp surface (a draped grid from the run-up to the launch depth, across the launch width), a lip bar
// across it and a bar along each side. The ramp itself is the terrain's (the sim launches over it): this is its dress.
function addKicker(g, course, terrain, k, colours) {
 const P = PARK;
 const start = beginFeature(g);
 const scratch = { x: 0, y: 0 };
 const s0 = k.s - KICKER_RAMP_M;
 const s1 = k.s + k.depth;
 const rows = P.PAD_ALONG + 1;
 const cols = P.PAD_ACROSS + 1;
 const index = [];
 for (let i = 0; i < rows; i++) {
  for (let j = 0; j < cols; j++) {
   const p = onSnow(course, terrain, s0 + (s1 - s0) * i / P.PAD_ALONG, k.d + k.halfWidth * (2 * j / P.PAD_ACROSS - 1),
    P.LIFT_M, scratch);
   index.push(pushVertex(g, p, groundNormal(terrain, p[0], p[1]), colours.pad));
  }
 }
 const flip = !padFacesUp(g, index, cols);
 for (let i = 0; i < P.PAD_ALONG; i++) {
  for (let j = 0; j < P.PAD_ACROSS; j++) {
   const a = index[i * cols + j];
   const b = index[i * cols + j + 1];
   const c = index[(i + 1) * cols + j + 1];
   const d = index[(i + 1) * cols + j];
   if (flip) g.indices.push(a, c, b, a, d, c);
   else g.indices.push(a, b, c, a, c, d);
  }
 }
 const lipColour = k.big ? colours.bigLip : colours.lip;
 const lipRise = P.LIFT_M + P.LIP_RISE_M;
 for (let j = 0; j < P.PAD_ACROSS; j++) {
  const a = onSnow(course, terrain, k.s, k.d + k.halfWidth * (2 * j / P.PAD_ACROSS - 1), lipRise, scratch);
  const b = onSnow(course, terrain, k.s, k.d + k.halfWidth * (2 * (j + 1) / P.PAD_ACROSS - 1), lipRise, scratch);
  addBeam(g, a, b, P.LIP_HALF_ALONG_M, P.LIP_HALF_HEIGHT_M, lipColour);
 }
 for (const side of [-1, 1]) {
  for (let i = 0; i < P.PAD_ALONG; i++) {
   const a = onSnow(course, terrain, s0 + (s1 - s0) * i / P.PAD_ALONG, k.d + side * k.halfWidth, P.LIFT_M, scratch);
   const b = onSnow(course, terrain, s0 + (s1 - s0) * (i + 1) / P.PAD_ALONG, k.d + side * k.halfWidth, P.LIFT_M,
    scratch);
   addBeam(g, a, b, P.EDGE_HALF_ALONG_M, P.EDGE_HALF_HEIGHT_M, colours.lip);
  }
 }
 course.point(k.s, k.d, scratch);
 endFeature(g, start, scratch.x, scratch.y, Math.hypot(k.halfWidth, k.depth + KICKER_RAMP_M) + CULL_MARGIN_M,
  FEATURE_KIND.KICKER);
}

// True if the pad's first cell, wound a, b, c (along then across), faces up (so its front side is the top).
function padFacesUp(g, index, cols) {
 const at = (v) => [g.positions[v * 3], g.positions[v * 3 + 1], g.positions[v * 3 + 2]];
 const a = at(index[0]);
 const b = at(index[1]);
 const c = at(index[cols + 1]);
 return cross(sub(b, a), sub(c, a))[2] > 0;
}

// One rail or box: bar pieces that follow the snow, with posts under them.
function addRail(g, terrain, r, colours) {
 const P = PARK;
 const start = beginFeature(g);
 const isBox = r.t === 'box';
 const barColour = isBox ? colours.box : colours.rail;
 const hw = isBox ? P.BOX_HALF_WIDTH_M : P.RAIL_HALF_WIDTH_M;
 const ht = isBox ? P.BOX_HALF_HEIGHT_M : P.RAIL_HALF_HEIGHT_M;
 const postHalf = isBox ? P.BOX_POST_HALF_M : P.RAIL_POST_HALF_M;
 const at = (t) => {
  const x = r.x0 + r.dx * t;
  const y = r.y0 + r.dy * t;
  return [x, y, terrain.height(x, y)];
 };
 let prev = null;
 let nextPost = 0;
 for (let t = 0; t <= r.len + 0.01; t += P.RAIL_SEGMENT_M) {
  const ground = at(Math.min(t, r.len));
  const top = [ground[0], ground[1], ground[2] + r.h - ht];
  if (prev !== null) addBeam(g, prev, top, hw, ht, barColour);
  if (t >= nextPost) {
   addBeam(g, [ground[0], ground[1], ground[2] - 0.1], [top[0], top[1], top[2] - ht], postHalf, postHalf,
    colours.pole, [1, 0, 0]);
   nextPost += P.RAIL_POST_EVERY_M;
  }
  prev = top;
 }
 endFeature(g, start, r.x0 + r.dx * r.len / 2, r.y0 + r.dy * r.len / 2, r.len / 2 + hw + CULL_MARGIN_M,
  FEATURE_KIND.RAIL);
}

/**
 * Where the course's flags stand, as the sprites draw them (sprites.js drawFlags): a pole each side of every kicker's
 * lip, two more up the ramp of a big one, and one at the start of each rail or box. Returns [{x, y (m, world), height
 * (m), look ('kicker' | 'bigKicker' | 'rail' | 'box': which Look colour), dirX, dirY (the unit horizontal direction
 * the pennant streams, away from the piste)}]. frame: the MapFrame. Allocates (boot only).
 */
export function flagPlacements(course, frame) {
 const out = [];
 const A = { x: 0, y: 0 };
 const B = { x: 0, y: 0 };
 const off = { x: 0, y: 0 };
 for (const k of course.kickers) {
  course.point(k.s, k.d, A);
  course.point(k.s, k.d + 1, B);
  const across = [B.x - A.x, B.y - A.y];
  for (const side of [-1, 1]) {
   course.point(k.s, k.d + side * KICKER_FLAG_D, off);
   out.push({ x: off.x, y: off.y, height: k.big ? PARK.BIG_KICKER_FLAG_HEIGHT_M : PARK.KICKER_FLAG_HEIGHT_M,
    look: 'kicker', dirX: across[0] * side, dirY: across[1] * side });
  }
  if (k.big) {
   for (const side of [-1, 1]) {
    frame.vecToWorld(side * KICKER_FLAG_D, -RAMP_FLAG_BACK_M, off); // where the sprites have always drawn them
    const dir = frame.vecToWorld(side, 0, { x: 0, y: 0 });
    out.push({ x: A.x + off.x, y: A.y + off.y, height: PARK.BIG_KICKER_FLAG_HEIGHT_M, look: 'bigKicker',
     dirX: dir.x, dirY: dir.y });
   }
  }
 }
 for (const r of course.rails) {
  const side = r.d > 0 ? 1 : -1;
  frame.vecToWorld(side * RAIL_FLAG_D, 0, off); // further out across the map than the rail
  const dir = frame.vecToWorld(side, 0, { x: 0, y: 0 });
  out.push({ x: r.x0 + off.x, y: r.y0 + off.y, height: PARK.RAIL_FLAG_HEIGHT_M, look: r.t === 'box' ? 'box' : 'rail',
   dirX: dir.x, dirY: dir.y });
 }
 return out;
}

// One flag: a square pole from the snow up, and a triangular pennant at its top streaming along (dirX, dirY).
function addFlag(g, terrain, f, colours) {
 const P = PARK;
 const start = beginFeature(g);
 const ground = terrain.height(f.x, f.y);
 const len = Math.hypot(f.dirX, f.dirY) || 1;
 const dx = f.dirX / len;
 const dy = f.dirY / len;
 const top = [f.x, f.y, ground + f.height];
 addBeam(g, [f.x, f.y, ground - 0.1], top, P.POLE_HALF_M, P.POLE_HALF_M, colours.pole, [1, 0, 0]);
 const tip = [f.x + dx * P.PENNANT_LENGTH_M, f.y + dy * P.PENNANT_LENGTH_M, top[2] - P.PENNANT_DROP_M / 2];
 const low = [f.x, f.y, top[2] - P.PENNANT_DROP_M];
 const n = unit(cross(sub(tip, top), sub(low, top)));
 const col = colours[f.look];
 const v = [top, tip, low].map((p) => pushVertex(g, p, n, col));
 g.indices.push(v[0], v[1], v[2]);
 const w = [top, low, tip].map((p) => pushVertex(g, p, n.map((x) => -x), col));
 g.indices.push(w[0], w[1], w[2]);
 endFeature(g, start, f.x, f.y, P.PENNANT_LENGTH_M + CULL_MARGIN_M, FEATURE_KIND.FLAG);
}

/**
 * The park's colours from the Look as 0..1 RGB: pad, lip, bigLip (the ramp), pole, rail, box, kicker, bigKicker (the
 * pennants). Pure.
 */
export function parkLook(look) {
 const s = look.sprites;
 const unitRgb = (hex) => hexRgb(hex).map((c) => c / 255);
 return {
  pad: unitRgb(s.kickerRamp.pad), lip: unitRgb(s.kickerRamp.lip), bigLip: unitRgb(s.kickerRamp.bigLip),
  pole: unitRgb(s.pole.colour), rail: unitRgb(s.rail.colour), box: unitRgb(s.box.colour),
  kicker: unitRgb(s.flag.kicker), bigKicker: unitRgb(s.flag.bigKicker),
 };
}

/**
 * The park's mesh from the course: {positions, normals, colours (Float32Array, 3 per vertex; colours 0..1 RGB),
 * indices (Uint32Array, triangles), features (Float32Array, FEATURE_STRIDE each: x, y, radius, first index, index
 * count, kind), counts {kickers, rails, flags}}. Everything is in world m, on the terrain. look: the Look; frame: the
 * MapFrame. Allocates (boot only).
 */
export function buildParkMesh(course, terrain, look, frame) {
 const g = newBuild();
 const colours = parkLook(look);
 for (const k of course.kickers) addKicker(g, course, terrain, k, colours);
 for (const r of course.rails) addRail(g, terrain, r, colours);
 const flags = flagPlacements(course, frame);
 for (const f of flags) addFlag(g, terrain, f, colours);
 return {
  positions: Float32Array.from(g.positions),
  normals: Float32Array.from(g.normals),
  colours: Float32Array.from(g.colours),
  indices: Uint32Array.from(g.indices),
  features: Float32Array.from(g.features),
  counts: { kickers: course.kickers.length, rails: course.rails.length, flags: flags.length },
 };
}

/**
 * Copies the triangles of the features in view from indices to the front of out (a Uint32Array of at least
 * indices.length) and returns how many indices. In view: not behind the near plane, not past PARK_FAR_M and inside the
 * field of view across, each with its radius. camera: {x, y, dirX, dirY}. Allocates nothing.
 */
export function cullPark(features, indices, camera, out) {
 const half = FOV / 2;
 const tanHalf = half < Math.PI / 2 ? Math.tan(half) : Infinity;
 let n = 0;
 for (let o = 0; o < features.length; o += FEATURE_STRIDE) {
  const radius = features[o + 2];
  const dx = features[o] - camera.x;
  const dy = features[o + 1] - camera.y;
  const f = dx * camera.dirX + dy * camera.dirY;
  if (f < NEAR_M - radius || f >= PARK_FAR_M + radius) continue;
  const across = dx * camera.dirY - dy * camera.dirX;
  if (Math.abs(across) - radius > Math.max(f, 0) * tanHalf) continue;
  const first = features[o + 3];
  const count = features[o + 4];
  for (let i = 0; i < count; i++) out[n + i] = indices[first + i];
  n += count;
 }
 return n;
}

/**
 * The park's memory (bytes) for a built mesh: the vertex buffers (position, normal and colour, 3 floats each) and the
 * index buffer at its largest (every feature in view). cpuBytes also counts the feature table.
 */
export function parkMeshBytes(mesh) {
 const vertices = mesh.positions.length / 3;
 const vertexBytes = vertices * 9 * 4;
 const indexBytes = mesh.indices.length * 4;
 return { gpuBytes: vertexBytes + indexBytes, cpuBytes: vertexBytes + 2 * indexBytes + mesh.features.length * 4 };
}

const PARK_VERTEX = `
precision highp float;
precision highp int;
in vec3 position;
in vec3 normal;
in vec3 aColour;
out vec3 vNormal;
out vec3 vColour;
out vec2 vWorld;
out float vDist;
${PROJECT_GLSL}
void main() {
 vec2 o = position.xy - uCam.xy;
 gl_Position = projectToClip(o, position.z);
 vNormal = normal;
 vColour = aColour;
 vWorld = position.xy;
 vDist = length(vec3(o, position.z - uCam.z));
}
`;

const PARK_FRAGMENT = `
precision highp float;
in vec3 vNormal;
in vec3 vColour;
in vec2 vWorld;
in float vDist;
uniform vec3 uAmbient;  // the shade's colour over lit (per channel)
uniform vec3 uFog;
out vec4 outColour;
${FOG_GLSL}
${SUN_VISIBILITY_GLSL}
${SUN_LIGHT_GLSL}
void main() {
 vec3 light = sunLit(normalize(vNormal), uAmbient, sunVisibilityAt(vWorld));
 outColour = vec4(mix(vColour * light, uFog, fogAmount(vDist)), 1.0);
}
`;

/**
 * Adds the park to glScene as one mesh (one draw call) and returns {update(camera) -> triangles drawn, triangles
 * (all), drawCalls, counts {kickers, rails, flags}, bytes (parkMeshBytes)}. shared: the terrain's uniforms
 * (gl-renderer.js sharedUniforms). Builds the mesh once; update() copies the indices of the features in view and
 * allocates nothing. THREE: env.THREE.
 */
export function createParkMesh(THREE, glScene, shared, course, terrain, look, frame) {
 const built = buildParkMesh(course, terrain, look, frame);
 const indexData = new Uint32Array(Math.max(3, built.indices.length));
 const indexAttr = new THREE.BufferAttribute(indexData, 1);
 indexAttr.setUsage(THREE.DynamicDrawUsage);
 const geo = new THREE.BufferGeometry();
 geo.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
 geo.setAttribute('normal', new THREE.BufferAttribute(built.normals, 3));
 geo.setAttribute('aColour', new THREE.BufferAttribute(built.colours, 3));
 geo.setIndex(indexAttr);
 geo.setDrawRange(0, 0);
 const L = treeLook(look, frame);
 const material = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  vertexShader: PARK_VERTEX,
  fragmentShader: PARK_FRAGMENT,
  uniforms: {
   uCam: shared.uCam, uDir: shared.uDir, uScreen: shared.uScreen, uClip: shared.uClip,
   uFar: shared.uFar, uFogLut: shared.uFogLut, uFog: shared.uFog,
   uAux: shared.uAux, uMapSize: shared.uMapSize, uGridOrigin: shared.uGridOrigin, uGridU: shared.uGridU,
   uGridV: shared.uGridV, uObjSun: shared.uObjSun, uObjSunLight: shared.uObjSunLight,
   uAmbient: { value: new THREE.Vector3(L.ambient[0], L.ambient[1], L.ambient[2]) },
  },
  side: THREE.FrontSide,
  polygonOffset: true, // the ramp surface lies a hand's width over a terrain mesh that is coarser further out
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
 });
 const mesh = new THREE.Mesh(geo, material);
 mesh.frustumCulled = false; // the vertex shader projects
 mesh.renderOrder = 0;
 glScene.add(mesh);
 function update(camera) {
  const n = cullPark(built.features, built.indices, camera, indexData);
  geo.setDrawRange(0, n);
  if (n === 0) return 0;
  indexAttr.clearUpdateRanges();
  indexAttr.addUpdateRange(0, n);
  indexAttr.needsUpdate = true;
  return n / 3;
 }
 return { update, triangles: built.indices.length / 3, drawCalls: 1, counts: built.counts,
  bytes: parkMeshBytes(built) };
}
