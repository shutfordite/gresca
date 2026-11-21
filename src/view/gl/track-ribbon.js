// The GPU ski track: one instanced ribbon mesh drawn over the terrain from the equipment's trail (track-trail.js). Each
// sample is a quad draped on the height texture exactly as the snow mesh is; the fragment shader presses a groove into
// it (darker floor, a lit lip on the sun side, streaks where the equipment skidded) by multiplying the snow beneath.
// The ring's Float32Array is the GPU buffer's source: each frame uploads only the samples added since the last.
import { PROJECT_GLSL } from './gl-projection.js';
import { FOG_GLSL } from './snow-material.js';
import { TRAIL_CAPACITY, SAMPLE_FLOATS } from '../track-trail.js';

// Shader tunables (GLSL constants). Widths are in the ribbon's across coordinate -1..1 unless in m.
const TUNE = `
const float LIFT_M = 0.04;          // m above the snow surface at the camera, against z-fighting
const float LIFT_PER_M = 0.0015;    // m of extra lift per m from the camera (the coarse mesh levels sit lower or higher)
const float GROOVE_M = 0.05;        // m, the depth of the deepest groove (shapes the lit and shaded walls)
const float FLOOR_FROM = 0.35;      // across, the groove floor is flat inside this and rises to the lip by FLOOR_TO
const float FLOOR_TO = 0.8;
const float LIP_AT = 0.88;          // across, the centre of the lip of pushed snow
const float LIP_WIDTH = 0.12;       // across, the lip's width
const float LIP_HEIGHT = 0.3;       // times the groove's depth
const float EDGE_CARVE = 0.9;       // across, a carved groove's edge is clean from here to the ribbon's edge (1)
const float EDGE_SMEAR = 0.55;      // across, a smeared swath fades out from here
const float LIGHT_GAIN = 1.6;       // brightness change per unit of sun cosine the groove walls gain or lose
const float FLOOR_DARK = 0.7;       // 0..1 share of the Look's shade-to-lit ratio the floor takes (1 = fully shaded)
const float STREAK_LANE_M = 0.06;   // m, the width of one scuff lane in a smeared swath
const float STREAK_VARIATION = 0.6; // 0..1, how much lanes differ in depth
const float FADE_NEAR_M = 110.0;    // m, the track at full strength nearer than this
const float FADE_FAR_M = 220.0;     // m, and gone past this (the fog fades it before)
`;

const VERTEX = `
precision highp float;
precision highp sampler2D;
${TUNE}
in vec2 corner;            // end of the segment (0 prev, 1 this), side (-1, +1)
in vec4 aA;                // x, y (m, world) of this sample, and of the previous one
in vec4 aB;                // half-width here and at the previous sample (m), depth 0..1, smear 0..1
uniform sampler2D uHeight; // m, R32F, one texel per grid metre
uniform vec2 uMapSize;     // texels
uniform vec2 uCamGrid;     // m, the camera on the grid
uniform vec2 uGridU;       // world unit vector of grid +u
uniform vec2 uGridV;       // world unit vector of grid +v
${PROJECT_GLSL}
out float vSide;           // across the ribbon, -1..1
out float vDepth;
out float vSmear;
out float vDist;           // m, horizontal distance from the camera
out vec2 vAcross;          // unit vector across the ribbon, on the grid
out float vLaneM;          // m across the ribbon from its centre line
out float vHalf;           // m, the ribbon's half-width here
float heightAt(ivec2 p) {
 return texelFetch(uHeight, clamp(p, ivec2(0), ivec2(uMapSize) - 1), 0).r;
}
float heightBilinear(vec2 uv) {
 vec2 f = floor(uv);
 vec2 t = uv - f;
 ivec2 p = ivec2(f);
 return mix(mix(heightAt(p), heightAt(p + ivec2(1, 0)), t.x), mix(heightAt(p + ivec2(0, 1)), heightAt(p + ivec2(1, 1)), t.x), t.y);
}
void main() {
 float here = corner.x;
 vec2 centre = mix(aA.zw, aA.xy, here);
 float hw = mix(aB.y, aB.x, here);
 vec2 along = aA.xy - aA.zw;
 if (aB.x <= 0.0 || dot(along, along) < 1e-8) { // an unwritten sample of the ring
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  return;
 }
 vec2 dir = normalize(along);
 vec2 across = vec2(-dir.y, dir.x);
 vec2 o = centre + across * corner.y * hw - uCam.xy;
 vec2 d = vec2(dot(o, uGridU), dot(o, uGridV));
 float dist = length(d);
 float h = heightBilinear(uCamGrid + d) + LIFT_M + LIFT_PER_M * dist;
 gl_Position = projectToClip(o, h);
 vSide = corner.y;
 vDepth = aB.z;
 vSmear = aB.w;
 vDist = dist;
 vAcross = vec2(dot(across, uGridU), dot(across, uGridV));
 vLaneM = corner.y * hw;
 vHalf = hw;
}
`;

const FRAGMENT = `
precision highp float;
${TUNE}
in float vSide;
in float vDepth;
in float vSmear;
in float vDist;
in vec2 vAcross;
in float vLaneM;
in float vHalf;
uniform vec3 uSun;         // unit vector toward the sun: grid u, v, up
uniform vec3 uFloor;       // the Look's snow shade over its lit snow, per channel (the groove floor's multiplier)
${FOG_GLSL}
out vec4 outColour;

// The groove's height across the ribbon (0 at the snow, -1 at the floor, + the lip), before the depth scale.
float profile(float x) {
 float a = abs(x);
 float lip = (a - LIP_AT) / LIP_WIDTH;
 return -(1.0 - smoothstep(FLOOR_FROM, FLOOR_TO, a)) + LIP_HEIGHT * exp(-lip * lip);
}

float hash11(float p) {
 return fract(sin(p * 127.1 + 311.7) * 43758.5453);
}

void main() {
 float a = abs(vSide);
 float lane = hash11(floor(vLaneM / STREAK_LANE_M));
 float depth = vDepth * mix(1.0, 1.0 - STREAK_VARIATION * lane, vSmear);
 float cover = 1.0 - smoothstep(mix(EDGE_CARVE, EDGE_SMEAR, vSmear), 1.0, a);
 float bowl = (1.0 - smoothstep(FLOOR_FROM, FLOOR_TO, a)) * depth;
 float e = 0.05;
 float slope = GROOVE_M * depth * (profile(vSide + e) - profile(vSide - e)) / (2.0 * e) / vHalf;
 vec3 n = normalize(vec3(-slope * vAcross, 1.0));
 float walls = (dot(n, uSun) - uSun.z) * LIGHT_GAIN;
 vec3 floorTint = mix(vec3(1.0), uFloor, FLOOR_DARK);
 vec3 f = mix(vec3(1.0), floorTint, bowl) + walls;
 f = mix(vec3(1.0), f, cover);
 float fade = (1.0 - fogAmount(vDist)) * (1.0 - smoothstep(FADE_NEAR_M, FADE_FAR_M, vDist));
 f = mix(vec3(1.0), f, fade);
 outColour = vec4(clamp(f - 0.5, 0.0, 1.0), 0.5); // the blend multiplies the snow by rgb + alpha: 0.5 .. 1.5
}
`;

/**
 * The ribbon's look from the Look (Look.terrainTone via snowLook): the groove floor's multiplier per channel, 0..1 =
 * the shaded snow tone over the lit one. Pure. shade, lit: [r, g, b] 0..1.
 */
export function ribbonLook(shade, lit) {
 return { floor: [0, 1, 2].map((i) => Math.min(1, shade[i] / lit[i])) };
}

/**
 * The ribbon mesh for trail (track-trail.js), added to glScene before the sky. shared: the terrain's uniforms
 * (gl-renderer.js sharedUniforms), look: ribbonLook(). Returns {update(trail)}: call once a frame before rendering.
 * It uploads the samples appended since the last call (the whole ring after a clear, or when the ring lapped itself);
 * three.js re-sends the whole buffer after a lost context is restored.
 */
export function createTrackRibbon(THREE, glScene, shared, trail, look) {
 const geo = new THREE.InstancedBufferGeometry();
 geo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), 2));
 geo.setIndex([0, 1, 2, 2, 1, 3]);
 const buffer = new THREE.InstancedInterleavedBuffer(trail.data, SAMPLE_FLOATS, 1);
 buffer.setUsage(THREE.DynamicDrawUsage);
 geo.setAttribute('aA', new THREE.InterleavedBufferAttribute(buffer, 4, 0));
 geo.setAttribute('aB', new THREE.InterleavedBufferAttribute(buffer, 4, 4));
 geo.instanceCount = 0;
 const material = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  vertexShader: VERTEX,
  fragmentShader: FRAGMENT,
  uniforms: {
   uHeight: shared.uHeight, uMapSize: shared.uMapSize, uCamGrid: shared.uCamGrid, uGridU: shared.uGridU,
   uGridV: shared.uGridV, uCam: shared.uCam, uDir: shared.uDir, uScreen: shared.uScreen, uClip: shared.uClip,
   uSun: shared.uSun, uFar: shared.uFar, uFogLut: shared.uFogLut,
   uFloor: { value: new THREE.Vector3(look.floor[0], look.floor[1], look.floor[2]) },
  },
  transparent: true,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.DstColorFactor,
  blendDst: THREE.SrcAlphaFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  side: THREE.DoubleSide,
 });
 const mesh = new THREE.Mesh(geo, material);
 mesh.frustumCulled = false;
 glScene.add(mesh);
 const seen = { written: 0, epoch: trail.epoch };

 // Marks samples from..to (counts ever written) for upload, split where the ring wraps.
 function mark(from, to) {
  const first = from % TRAIL_CAPACITY;
  const n = to - from;
  if (first + n <= TRAIL_CAPACITY) {
   buffer.addUpdateRange(first * SAMPLE_FLOATS, n * SAMPLE_FLOATS);
  } else {
   buffer.addUpdateRange(first * SAMPLE_FLOATS, (TRAIL_CAPACITY - first) * SAMPLE_FLOATS);
   buffer.addUpdateRange(0, (first + n - TRAIL_CAPACITY) * SAMPLE_FLOATS);
  }
 }

 function update(t) {
  buffer.clearUpdateRanges(); // ranges a frame skipped (a lost context) are stale: three.js re-sends it all then
  const whole = t.epoch !== seen.epoch || t.written - seen.written >= TRAIL_CAPACITY;
  if (t.written !== seen.written || whole) {
   if (!whole) mark(seen.written, t.written); // no range at all: the whole buffer
   buffer.needsUpdate = true;
  }
  seen.written = t.written;
  seen.epoch = t.epoch;
  geo.instanceCount = Math.min(t.written, TRAIL_CAPACITY);
 }
 return { update, mesh };
}
