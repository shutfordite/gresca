// The trees on the GPU (E3a): one instanced mesh of a low-poly stacked-cone conifer, drawn in the terrain's projection
// and depth-tested against it (so ridges hide trees), lit by the Look's sun and fogged by its fog. The instance list is
// made once from the world's trees; each frame only the trees in view are copied to the front of the instance buffer
// (no allocation). Pure parts (placement, culling, geometry, the Look's colours) are tested in Node; the GL part is
// createTreeMesh(). docs/adr/0008-three-js-gpu-renderer.md.
import { PROJECT_GLSL, NEAR_M } from './gl-projection.js';
import { FOG_GLSL, snowLook, sunOnGrid } from './snow-material.js';
import { SUN_VISIBILITY_GLSL, SUN_LIGHT_GLSL } from './sun-visibility.js';
import { sunAzimuthDeg } from '../sky.js';

const DEG = Math.PI / 180;

/** m along the view, further trees are not drawn (the sprites' limit, draw.js, too). */
export const TREE_FAR_M = 300;
/** m, the drawn height of a tree (the sprite's, and the height the baked shadow, sun-shadow.js, is cast for). */
export const TREE_HEIGHT_M = 9;

/** Tunables of the GPU trees. Lengths are metres, fractions 0..1. */
export const TREE_MESH = Object.freeze({
 FADE_M: 40,            // m, trees shrink to nothing over the last FADE_M before TREE_FAR_M (no pop)
 RADIUS_M: 2.6,         // m, the widest crown radius at scale 1.1: the cull's margin
 SCALE_MIN: 0.92,       // scale of the smallest tree (the baked shadow is cast for scale 1: keep it close)
 SCALE_MAX: 1.08,       // scale of the largest tree
 TONE_MIN: 0.88,        // brightness factor of the darkest tree
 TONE_MAX: 1.12,        // brightness factor of the lightest tree
 TRUNK_DARKEN: 0.55,    // trunk colour as a share of the crown's
 UNDERSIDE_DARKEN: 0.7, // the cones' undersides, as a share of the ambient
 SIDES: 6,              // sides of each cone
 TRUNK_SIDES: 4,
 TRUNK_RADIUS_M: 0.25,
 TRUNK_BOTTOM_M: -0.4,  // m, below the ground: the terrain mesh at its coarser levels can lie a little above it
 TRUNK_TOP_M: 1.4,
 SUN_SAMPLE_M: 2.8,      // m toward the sun where a tree reads the sun visibility (past its own baked shadow)
});

// The three crown cones: bottom radius, base height and height (m). They stack to TREE_HEIGHT_M.
const CONES = Object.freeze([
 Object.freeze({ radius: 2.4, base: 1.0, height: 3.6 }),
 Object.freeze({ radius: 1.9, base: 3.2, height: 3.6 }),
 Object.freeze({ radius: 1.4, base: 5.4, height: 3.6 }),
]);

/** Floats per instance in the list: x, y (m, world), ground z (m), scale, yaw (rad), tone (brightness factor). */
export const INSTANCE_STRIDE = 6;

// A 0..1 hash of two integers (the same mixing the world's tree placement uses; no Math.random).
function hash01(a, b) {
 let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
 h = Math.imul(h ^ (h >>> 13), 1274126177);
 h ^= h >>> 16;
 return (h >>> 0) / 4294967296;
}

/**
 * The look of one tree from its position (x, y m): {scale, yaw (rad), tone}, the same every run. Seeded by the
 * position to the centimetre, so a tree keeps its look when the list changes. Allocates (boot only).
 */
export function treeVariation(x, y) {
 const gx = Math.round(x * 100);
 const gy = Math.round(y * 100);
 const T = TREE_MESH;
 return {
  scale: T.SCALE_MIN + (T.SCALE_MAX - T.SCALE_MIN) * hash01(gx, gy),
  yaw: 2 * Math.PI * hash01(gy + 17, gx + 91),
  tone: T.TONE_MIN + (T.TONE_MAX - T.TONE_MIN) * hash01(gx + 5, gy + 23),
 };
}

/**
 * The instance list of the world's trees: Float32Array(INSTANCE_STRIDE * n) of x, y (m), ground z (m, from
 * terrain.height), scale, yaw (rad), tone. treeArr: [{x, y}] world m. Allocates once, at boot.
 */
export function buildTreeInstances(treeArr, terrain) {
 const out = new Float32Array(treeArr.length * INSTANCE_STRIDE);
 for (let n = 0; n < treeArr.length; n++) {
  const t = treeArr[n];
  const v = treeVariation(t.x, t.y);
  const o = n * INSTANCE_STRIDE;
  out[o] = t.x;
  out[o + 1] = t.y;
  out[o + 2] = terrain.height(t.x, t.y);
  out[o + 3] = v.scale;
  out[o + 4] = v.yaw;
  out[o + 5] = v.tone;
 }
 return out;
}

/**
 * Copies the trees in view from instances to the front of outTree (x, y, z, scale per tree) and outStyle (yaw, tone),
 * and returns how many. In view: not behind the near plane, not past TREE_FAR_M (they have shrunk to nothing there)
 * and inside the field of view across, each with TREE_MESH.RADIUS_M of margin. camera: {x, y, dirX, dirY, fov (rad)}.
 * Allocates nothing.
 */
export function cullTrees(instances, camera, outTree, outStyle) {
 const R = TREE_MESH.RADIUS_M;
 const half = camera.fov / 2;
 const tanHalf = half < Math.PI / 2 ? Math.tan(half) : Infinity;
 let n = 0;
 for (let o = 0; o < instances.length; o += INSTANCE_STRIDE) {
  const dx = instances[o] - camera.x;
  const dy = instances[o + 1] - camera.y;
  const f = dx * camera.dirX + dy * camera.dirY;
  if (f < NEAR_M - R || f >= TREE_FAR_M) continue;
  const across = dx * camera.dirY - dy * camera.dirX;
  if (Math.abs(across) - R > Math.max(f, 0) * tanHalf) continue;
  const t = n * 4;
  outTree[t] = instances[o];
  outTree[t + 1] = instances[o + 1];
  outTree[t + 2] = instances[o + 2];
  outTree[t + 3] = instances[o + 3];
  const s = n * 2;
  outStyle[s] = instances[o + 4];
  outStyle[s + 1] = instances[o + 5];
  n++;
 }
 return n;
}

// Pushes one triangle (three points a, b, c of [x, y, z]) with the face normal n and the part (0 trunk, 1 crown).
function pushTriangle(g, a, b, c, n, part) {
 for (const p of [a, b, c]) {
  g.positions.push(p[0], p[1], p[2]);
  g.normals.push(n[0], n[1], n[2]);
  g.parts.push(part);
 }
}

// The unit outward-and-up normal of a cone face at angle mid (rad), for a cone of this radius and height.
function coneNormal(mid, radius, height) {
 const len = Math.hypot(height, radius);
 return [Math.cos(mid) * height / len, Math.sin(mid) * height / len, radius / len];
}

function addCone(g, cone) {
 const N = TREE_MESH.SIDES;
 const tip = [0, 0, cone.base + cone.height];
 const centre = [0, 0, cone.base];
 const down = [0, 0, -1];
 for (let i = 0; i < N; i++) {
  const a0 = i / N * 2 * Math.PI;
  const a1 = (i + 1) / N * 2 * Math.PI;
  const p0 = [Math.cos(a0) * cone.radius, Math.sin(a0) * cone.radius, cone.base];
  const p1 = [Math.cos(a1) * cone.radius, Math.sin(a1) * cone.radius, cone.base];
  pushTriangle(g, p0, p1, tip, coneNormal((a0 + a1) / 2, cone.radius, cone.height), 1);
  pushTriangle(g, p1, p0, centre, down, 1);
 }
}

function addTrunk(g) {
 const N = TREE_MESH.TRUNK_SIDES;
 const r = TREE_MESH.TRUNK_RADIUS_M;
 const z0 = TREE_MESH.TRUNK_BOTTOM_M;
 const z1 = TREE_MESH.TRUNK_TOP_M;
 for (let i = 0; i < N; i++) {
  const a0 = i / N * 2 * Math.PI;
  const a1 = (i + 1) / N * 2 * Math.PI;
  const mid = (a0 + a1) / 2;
  const n = [Math.cos(mid), Math.sin(mid), 0];
  const b0 = [Math.cos(a0) * r, Math.sin(a0) * r, z0];
  const b1 = [Math.cos(a1) * r, Math.sin(a1) * r, z0];
  const t0 = [b0[0], b0[1], z1];
  const t1 = [b1[0], b1[1], z1];
  pushTriangle(g, b0, b1, t1, n, 0);
  pushTriangle(g, b0, t1, t0, n, 0);
 }
}

/**
 * The tree's model, flat-shaded, in metres with z up, centred on its trunk, 1 unit = 1 m at scale 1: {positions
 * (Float32Array, xyz per vertex), normals (the same), parts (Float32Array: 0 trunk, 1 crown), triangles}. Not indexed:
 * every face has its own normal. Allocates (boot only).
 */
export function treeGeometry() {
 const g = { positions: [], normals: [], parts: [] };
 addTrunk(g);
 for (const cone of CONES) addCone(g, cone);
 return {
  positions: Float32Array.from(g.positions),
  normals: Float32Array.from(g.normals),
  parts: Float32Array.from(g.parts),
  triangles: g.parts.length / 3,
 };
}

/** The model's height above the ground (m): the top cone's tip. */
export const treeModelHeightM = () => CONES[CONES.length - 1].base + CONES[CONES.length - 1].height;

/**
 * The trees' uniform values from the Look: crown (0..1 RGB, sprites.tree), ambient (the colour of shade over lit
 * snow, per channel: what sunless light does to a colour), sunLight (the sun's colour over its brightest channel),
 * sun (unit vector toward the sun in the world, x east, y north, z up). Pure.
 */
export function treeLook(look, frame) {
 const s = snowLook(look, frame);
 const crown = look.sprites.tree.rgb;
 const az = sunAzimuthDeg(look.sky, frame) * DEG;
 const el = Math.asin(sunOnGrid(look.sky, frame)[2]);
 return {
  crown: [crown[0] / 255, crown[1] / 255, crown[2] / 255],
  ambient: [s.shade[0] / s.lit[0], s.shade[1] / s.lit[1], s.shade[2] / s.lit[2]],
  sunLight: s.sunTint,
  sun: [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)],
  fog: s.fog,
  fogLut: s.fogLut,
  far: s.far,
 };
}

/**
 * The GPU memory of the tree mesh for n trees (bytes): the model's vertex buffers, and the instance buffers at their
 * largest (every tree in view; in practice a fraction is). cpuBytes: the instance list and the copies the GPU
 * buffers are made from.
 */
export function treeMeshBytes(n) {
 const model = treeGeometry();
 const floatsPerVertex = 3 + 3 + 1;
 const modelBytes = model.parts.length * floatsPerVertex * 4;
 const instanceBytes = n * (4 + 2) * 4;
 return { gpuBytes: modelBytes + instanceBytes, cpuBytes: modelBytes + instanceBytes + n * INSTANCE_STRIDE * 4 };
}

const TREE_VERTEX = `
precision highp float;
precision highp int;
in vec3 position;
in vec3 normal;
in float aPart;
in vec4 aTree;   // x, y (m), ground z (m), scale
in vec2 aStyle;  // yaw (rad), tone
uniform vec2 uFade; // m along the view: where trees start to shrink, where they are gone
uniform float uSunSample; // m toward the sun where the sun visibility is read
out vec3 vNormal;
out float vVisible;
out float vPart;
out float vTone;
out float vDist;
${PROJECT_GLSL}
${SUN_VISIBILITY_GLSL}
${SUN_LIGHT_GLSL}
void main() {
 vec2 o = aTree.xy - uCam.xy;
 vVisible = sunVisibilityAt(aTree.xy + normalize(uObjSun.xy) * uSunSample);
 float f = dot(o, uDir);
 float scale = aTree.w * (1.0 - smoothstep(uFade.x, uFade.y, f));
 float c = cos(aStyle.x);
 float s = sin(aStyle.x);
 vec2 local = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * scale;
 vec2 offset = o + local;
 float h = aTree.z + position.z * scale;
 gl_Position = projectToClip(offset, h);
 vNormal = vec3(normal.x * c - normal.y * s, normal.x * s + normal.y * c, normal.z);
 vPart = aPart;
 vTone = aStyle.y;
 vDist = length(vec3(offset, h - uCam.z));
}
`;

const TREE_FRAGMENT = `
precision highp float;
in vec3 vNormal;
in float vVisible;
in float vPart;
in float vTone;
in float vDist;
uniform vec3 uCrown;    // the Look's crown colour (0..1)
uniform vec3 uAmbient;  // the shade's colour over lit (per channel)
uniform vec3 uFog;
uniform vec2 uTreeShade; // trunk share of the crown colour, the undersides' share of the ambient
out vec4 outColour;
${FOG_GLSL}
${SUN_LIGHT_GLSL}
void main() {
 vec3 n = normalize(vNormal);
 vec3 ambient = uAmbient * (n.z < -0.5 ? uTreeShade.y : 1.0);
 vec3 light = sunLit(n, ambient, vVisible);
 vec3 base = uCrown * (vPart > 0.5 ? 1.0 : uTreeShade.x) * vTone;
 vec3 c = mix(base * light, uFog, fogAmount(vDist));
 outColour = vec4(c, 1.0);
}
`;

/**
 * Adds the trees to glScene as one instanced mesh (one draw call) and returns {update(camera) -> trees drawn,
 * triangles (per tree), drawCalls, bytes (treeMeshBytes)}. shared: the terrain's uniforms (the projection and the fog,
 * gl-renderer.js sharedUniforms). Builds the model and the instance list once; update() copies the trees in view and
 * allocates nothing. THREE: env.THREE.
 */
export function createTreeMesh(THREE, glScene, shared, treeArr, terrain, look, frame) {
 const instances = buildTreeInstances(treeArr, terrain);
 const model = treeGeometry();
 const capacity = Math.max(1, treeArr.length);
 const treeData = new Float32Array(capacity * 4);
 const styleData = new Float32Array(capacity * 2);
 const treeAttr = new THREE.InstancedBufferAttribute(treeData, 4);
 const styleAttr = new THREE.InstancedBufferAttribute(styleData, 2);
 treeAttr.setUsage(THREE.DynamicDrawUsage);
 styleAttr.setUsage(THREE.DynamicDrawUsage);
 const geo = new THREE.InstancedBufferGeometry();
 geo.setAttribute('position', new THREE.BufferAttribute(model.positions, 3));
 geo.setAttribute('normal', new THREE.BufferAttribute(model.normals, 3));
 geo.setAttribute('aPart', new THREE.BufferAttribute(model.parts, 1));
 geo.setAttribute('aTree', treeAttr);
 geo.setAttribute('aStyle', styleAttr);
 geo.instanceCount = 0;
 const L = treeLook(look, frame);
 const material = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  vertexShader: TREE_VERTEX,
  fragmentShader: TREE_FRAGMENT,
  uniforms: {
   uCam: shared.uCam, uDir: shared.uDir, uScreen: shared.uScreen, uClip: shared.uClip,
   uFar: shared.uFar, uFogLut: shared.uFogLut, uFog: shared.uFog,
   uAux: shared.uAux, uMapSize: shared.uMapSize, uGridOrigin: shared.uGridOrigin, uGridU: shared.uGridU,
   uGridV: shared.uGridV, uObjSun: shared.uObjSun, uObjSunLight: shared.uObjSunLight,
   uSunSample: { value: TREE_MESH.SUN_SAMPLE_M },
   uFade: { value: new THREE.Vector2(TREE_FAR_M - TREE_MESH.FADE_M, TREE_FAR_M) },
   uCrown: { value: new THREE.Vector3(L.crown[0], L.crown[1], L.crown[2]) },
   uAmbient: { value: new THREE.Vector3(L.ambient[0], L.ambient[1], L.ambient[2]) },
   uTreeShade: { value: new THREE.Vector2(TREE_MESH.TRUNK_DARKEN, TREE_MESH.UNDERSIDE_DARKEN) },
  },
  side: THREE.FrontSide,
 });
 const mesh = new THREE.Mesh(geo, material);
 mesh.frustumCulled = false; // the vertex shader projects
 mesh.renderOrder = 0;
 glScene.add(mesh);
 function update(camera) {
  const n = cullTrees(instances, camera, treeData, styleData);
  geo.instanceCount = n;
  if (n === 0) return 0;
  treeAttr.clearUpdateRanges();
  treeAttr.addUpdateRange(0, n * 4);
  treeAttr.needsUpdate = true;
  styleAttr.clearUpdateRanges();
  styleAttr.addUpdateRange(0, n * 2);
  styleAttr.needsUpdate = true;
  return n;
 }
 return { update, triangles: model.triangles, drawCalls: 1, bytes: treeMeshBytes(treeArr.length) };
}
