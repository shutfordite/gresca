// The GL terrain's snow: its colours and sun from the Look (uniform values) and its shaders (GLSL ES 3.0).
// Per pixel: the terrain's slope plus a tiling ripple and crust detail, sun from the spec's azimuth and elevation,
// lavender shade and warm lit snow, bluer hollows, sparkle, corduroy on the groomed piste, rock where steep, painted
// features from the colour map, ski tracks and the Look's fog. Colours are only ever the Look's (ADR 0007).
import { RAY_FAR } from '../../core/config.js';
import { hexRgb } from '../look/look.js';
import { sunAzimuthDeg } from '../sky.js';
import { PROJECT_GLSL } from './gl-projection.js';

export const FOG_LUT_SIZE = 64;       // samples of the Look's fog curve from 0 to RAY_FAR (linear in between)
const DEFAULT_SUN_ELEVATION_DEG = 20; // deg, for a Look without sky.sun.elevationDeg (optional field)
const DEG = Math.PI / 180;

/** GLSL: uFar, uFogLut and fogAmount(d), the Look's fog (0..1) at d m from the camera. Shared with the track ribbon. */
export const FOG_GLSL = `
uniform float uFar;        // m, where the fog curve ends and the terrain stops (RAY_FAR)
uniform float uFogLut[${FOG_LUT_SIZE}];
float fogAmount(float d) {
 float x = clamp(d / uFar, 0.0, 1.0) * float(${FOG_LUT_SIZE - 1});
 int i = int(floor(x));
 int j = min(i + 1, ${FOG_LUT_SIZE - 1});
 return mix(uFogLut[i], uFogLut[j], x - float(i));
}
`;

// Shader tunables (GLSL constants). Slopes are m/m added to the terrain's; distances m from the camera.
const TUNE = `
const float LIT_FROM = -0.08;       // sun cosine where snow starts to catch the sun (lit 0)
const float LIT_TO = 0.5;           // sun cosine where it is fully lit (lit 1)
const float SUN_TINT = 0.55;        // 0..1, how much the sun's colour warms lit snow
const float DETAIL_TILE_M = 4.5;    // m, the ripple tile's size on the ground
const float CRUST_TILE_M = 1.1;     // m, the same tile, turned, as fine crust
const float RIPPLE_SLOPE = 0.55;    // m/m, the ripples' steepest slope
const float CRUST_SLOPE = 0.22;     // m/m, the crust's
const float GROOMED_SMOOTH = 0.85;  // 0..1, how much of the ripple grooming removes
const float DETAIL_NEAR_M = 25.0;   // m, detail at full strength nearer than this
const float DETAIL_FAR_M = 160.0;   // m, and gone past this (mipmaps fade it before)
const float GRAIN = 0.05;           // brightness swing of the crust grain
const float HOLLOW_PER_M = 0.9;     // 0..1 of hollow per m the snow lies below its surroundings
const float HOLLOW_SHADE = 0.45;    // how much a full hollow takes from the sun
const float HOLLOW_TINT = 0.35;     // how far a full hollow goes toward the deep shade
const float HOLLOW_DEEP = 0.9;      // the deep shade: the shade tone times this
const float RIDGE_PER_M = 0.8;      // 0..1 of ridge per m the snow stands above its surroundings
const float RIDGE_LIFT = 0.03;      // brightness added on a full ridge
const float ROCK_FROM = 0.5;        // m/m, steeper than this starts to show rock (as the colour map)
const float ROCK_TO = 0.75;         // m/m, fully rock
const float CORDUROY_PERIOD_M = 0.3;  // m across the piste between corduroy ridges
const float CORDUROY_GAIN = 0.4;    // times the Look's corduroy depth (the colour map's stripes are 3 m wide)
const float CORDUROY_FADE_NEAR_M = 8.0;   // m, corduroy at full strength nearer than this
const float CORDUROY_FADE_FAR_M = 45.0;   // m, and gone past this (the groomed tone stays: only the ribs fade)
const float CORDUROY_WOBBLE_RAD = 1.4;    // rad, how far the crust bends a ridge's phase (ridges are not straight)
const float CORDUROY_BREAK_FROM = 0.3;    // 0..1 of the crust and ripple noise below which a ridge is gone
const float CORDUROY_BREAK_TO = 0.62;     // and above which it is whole: the ribs come and go along the piste
const float SPARKLE_CELL_M = 0.03;  // m, the size of one glint
const float SPARKLE_DENSITY = 0.02;  // share of cells that can glint
const float SPARKLE_FLICKER = 9.0;  // how fast glints change as the view direction turns
const float SPARKLE_DOT_PX = 1.5;   // canvas px across one glint
const float SPARKLE_NEAR_M = 2.0;   // m, glints at full strength from here
const float SPARKLE_FAR_M = 24.0;   // m, and none past here
const float FEATURE_FROM = 0.2;     // feature weight where painted features start to show
const float FEATURE_TO = 0.55;      // and where they are solid: a crisp edge between 1 m texels
`;

/** The vertex shader: a clipmap level's vertex on the map's grid, its height from the height texture, projected. */
export const SNOW_VERTEX = `
precision highp float;
precision highp sampler2D;
in vec3 position;          // i, j (vertex of the level), morph (terrain-mesh.js MORPH)
uniform sampler2D uHeight; // m, R32F, one texel per grid metre (read exactly, no filtering)
uniform vec2 uMapSize;     // texels
uniform vec2 uOrigin;      // m, grid u, v of the level's vertex (0, 0)
uniform float uSpacing;    // m between the level's vertices
uniform vec2 uCamGrid;     // m, the camera on the grid
uniform vec2 uGridU;       // world unit vector of grid +u
uniform vec2 uGridV;       // world unit vector of grid +v
${PROJECT_GLSL}
out vec2 vGrid;            // m on the grid
out float vDist;           // m, horizontal distance from the camera
out vec3 vToCam;           // m, grid u, v and up, from the surface to the camera
float heightAt(vec2 uv) {
 ivec2 p = clamp(ivec2(floor(uv + 0.5)), ivec2(0), ivec2(uMapSize) - 1);
 return texelFetch(uHeight, p, 0).r;
}
void main() {
 vec2 uv = uOrigin + position.xy * uSpacing;
 float h;
 if (position.z == 1.0) h = 0.5 * (heightAt(uv - vec2(uSpacing, 0.0)) + heightAt(uv + vec2(uSpacing, 0.0)));
 else if (position.z == 2.0) h = 0.5 * (heightAt(uv - vec2(0.0, uSpacing)) + heightAt(uv + vec2(0.0, uSpacing)));
 else h = heightAt(uv);
 vec2 d = uv - uCamGrid;
 gl_Position = projectToClip(d.x * uGridU + d.y * uGridV, h);
 vGrid = uv;
 vDist = length(d);
 vToCam = vec3(-d, uCam.z - h);
}
`;

/** The fragment shader: the snow's colour at one pixel. */
export const SNOW_FRAGMENT = `
precision highp float;
precision highp sampler2D;
${TUNE}
in vec2 vGrid;
in float vDist;
in vec3 vToCam;
uniform sampler2D uSlope;  // RG16F: dh/du, dh/dv (m/m)
uniform sampler2D uAux;    // RGBA8: relief, groomed (terrain-bake.js bakeAux)
uniform sampler2D uPaint;  // RGBA8: the colour map as built (painted features) and the feature weight (bakePaint)
uniform sampler2D uPiste;  // R16F: the piste's across coordinate (m) every uPisteStep m
uniform sampler2D uDetail; // RGBA8: ripple slope, grain, sparkle seed (detail-texture.js), tiling
uniform vec2 uMapSize;     // texels
uniform vec2 uPisteSize;   // samples
uniform float uPisteStep;  // m between them
uniform float uReliefPerByte; // m of relief per byte step
uniform vec3 uSun;         // unit vector toward the sun: grid u, v, up
uniform vec3 uShade;       // the Look's terrain tones (0..1): shade, lit, groomed shade, groomed lit, rock
uniform vec3 uLit;
uniform vec3 uGroomShade;
uniform vec3 uGroomLit;
uniform vec3 uRock;
uniform vec3 uSunTint;     // the sun's colour over its brightest channel
uniform vec3 uFog;
uniform float uCorduroy;   // the Look's corduroy brightness swing
${FOG_GLSL}
out vec4 outColour;

// Texture coordinates for a crisp lookup of a 1 m texture: bilinear only within a pixel of each texel edge, so a
// painted feature keeps a sharp edge however close it is, and far away (texels under a pixel) it is plain bilinear.
vec2 crispUv(vec2 grid) {
 vec2 base = floor(grid);
 vec2 width = max(fwidth(grid), vec2(1e-4));
 vec2 f = clamp((grid - base - 0.5) / width + 0.5, 0.0, 1.0);
 return (base + f + 0.5) / uMapSize;
}

float hash12(vec2 p) {
 vec3 p3 = fract(vec3(p.xyx) * 0.1031);
 p3 += dot(p3, p3.yzx + 33.33);
 return fract((p3.x + p3.y) * p3.z);
}

void main() {
 if (vGrid.x < 1.0 || vGrid.y < 1.0 || vGrid.x >= uMapSize.x - 2.0 || vGrid.y >= uMapSize.y - 2.0 || vDist > uFar) {
  discard;
 }
 vec2 tc = (vGrid + 0.5) / uMapSize;
 vec2 g = texture(uSlope, tc).rg;
 vec4 aux = texture(uAux, tc);
 float relief = (aux.r * 255.0 - 128.0) * uReliefPerByte;
 float groomed = aux.g;
 float steep = length(g);

 float near = 1.0 - smoothstep(DETAIL_NEAR_M, DETAIL_FAR_M, vDist);
 vec4 ripple = texture(uDetail, vGrid / DETAIL_TILE_M);
 vec4 crust = texture(uDetail, mat2(0.8, -0.6, 0.6, 0.8) * vGrid / CRUST_TILE_M);
 vec2 dg = (ripple.rg - 0.5) * 2.0 * RIPPLE_SLOPE * (1.0 - GROOMED_SMOOTH * groomed)
  + (crust.rg - 0.5) * 2.0 * CRUST_SLOPE;
 vec3 n = normalize(vec3(-(g + dg * near), 1.0));
 float ndl = dot(n, uSun);
 float lit = smoothstep(LIT_FROM, LIT_TO, ndl);
 float hollow = clamp(relief * HOLLOW_PER_M, 0.0, 1.0);
 float ridge = clamp(-relief * RIDGE_PER_M, 0.0, 1.0);
 lit *= 1.0 - hollow * HOLLOW_SHADE;

 vec3 shade = mix(uShade, uGroomShade, groomed);
 vec3 litC = mix(uLit, uGroomLit, groomed) * mix(vec3(1.0), uSunTint, SUN_TINT);
 vec3 c = mix(shade, litC, lit);
 c = mix(c, uShade * HOLLOW_DEEP, hollow * HOLLOW_TINT);
 c *= 1.0 + ridge * RIDGE_LIFT + (crust.b - 0.5) * 2.0 * GRAIN * near;

 float across = texture(uPiste, (vGrid / uPisteStep + 0.5) / uPisteSize).r;
 float wobble = (crust.g - 0.5) * 2.0 * CORDUROY_WOBBLE_RAD;
 float phase = across * 6.2831853 / CORDUROY_PERIOD_M;
 float resolved = 1.0 - smoothstep(0.25, 0.7, fwidth(phase) / 6.2831853); // fades stripes thinner than a pixel
 float broken = smoothstep(CORDUROY_BREAK_FROM, CORDUROY_BREAK_TO, ripple.r * 0.6 + crust.b * 0.4);
 float ribs = 1.0 - smoothstep(CORDUROY_FADE_NEAR_M, CORDUROY_FADE_FAR_M, vDist);
 c *= 1.0 + uCorduroy * CORDUROY_GAIN * groomed * sin(phase + wobble) * resolved * broken * ribs * (0.5 + 0.5 * lit);

 float rock = smoothstep(ROCK_FROM, ROCK_TO, steep) * (1.0 - groomed);
 c = mix(c, uRock * (0.8 + 0.35 * lit), rock);

 vec2 cells = vGrid / SPARKLE_CELL_M;
 vec2 cell = floor(cells);
 vec3 toCam = normalize(vToCam);
 float glint = step(1.0 - SPARKLE_DENSITY, hash12(cell)) * step(0.5, hash12(cell + floor(toCam.xy * SPARKLE_FLICKER)));
 // a dot of about SPARKLE_DOT_PX at the cell's centre, however the cell is foreshortened
 vec2 offPx = (fract(cells) - 0.5) / max(fwidth(cells), vec2(1e-4));
 glint *= 1.0 - smoothstep(SPARKLE_DOT_PX * 0.5, SPARKLE_DOT_PX * 0.5 + 1.0, length(offPx));
 float sparkle = glint * lit * lit * (1.0 - rock) * (1.0 - smoothstep(SPARKLE_NEAR_M, SPARKLE_FAR_M, vDist));
 c = mix(c, litC * 1.06, sparkle);

 vec4 paint = texture(uPaint, crispUv(vGrid));
 c = mix(c, paint.rgb * mix(0.82, 1.06, lit), smoothstep(FEATURE_FROM, FEATURE_TO, paint.a));

 c = mix(c, uFog, fogAmount(vDist));
 c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0; // dither: no banding in the long gradients
 outColour = vec4(c, 1.0);
}
`;

// An [r, g, b] (0..1) from a Look tone (0..255).
const unit = (rgb) => [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];

/**
 * The snow's uniform values from the Look (look.js) and the map's frame: tones shade, lit, groomShade, groomLit,
 * rock (0..1 RGB, the Look's terrainTone at its corners), corduroy (brightness swing), sunTint, fog (0..1 RGB),
 * fogLut (Float32Array FOG_LUT_SIZE, the Look's fog amount from 0 to far m), far (m), sun (unit vector toward the sun:
 * grid u, v, up). Pure.
 */
export function snowLook(look, frame) {
 const tone = (lit, groomed, wave, rock) => look.terrainTone(lit, groomed, wave, rock, [0, 0, 0]);
 const groomShade = tone(0, 1, 0, 0);
 const sun = hexRgb(look.sky.sun.colour);
 const top = Math.max(sun[0], sun[1], sun[2]);
 const fogLut = new Float32Array(FOG_LUT_SIZE);
 for (let i = 0; i < FOG_LUT_SIZE; i++) fogLut[i] = look.fog.amount(i / (FOG_LUT_SIZE - 1) * RAY_FAR, RAY_FAR);
 return {
  shade: unit(tone(0, 0, 0, 0)),
  lit: unit(tone(1, 0, 0, 0)),
  groomShade: unit(groomShade),
  groomLit: unit(tone(1, 1, 0, 0)),
  rock: unit(tone(0, 0, 0, 1)),
  corduroy: tone(0, 1, 1, 0)[0] / groomShade[0] - 1,
  sunTint: [sun[0] / top, sun[1] / top, sun[2] / top],
  fog: unit(look.fog.rgb),
  fogLut,
  far: RAY_FAR,
  sun: sunOnGrid(look.sky, frame),
 };
}

/**
 * The unit vector toward the sun on the map's grid [u, v, up]: the Look's sun azimuth (compass deg, turned with the
 * map as sky.js sunAzimuthDeg) and elevation (deg; sky.sun.elevationDeg, optional). Compass degrees end here.
 */
export function sunOnGrid(sky, frame) {
 const az = sunAzimuthDeg(sky, frame) * DEG;
 const el = (sky.sun.elevationDeg ?? DEFAULT_SUN_ELEVATION_DEG) * DEG;
 const g = frame.vecToGrid(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), { u: 0, v: 0 });
 return [g.u, g.v, Math.sin(el)];
}
