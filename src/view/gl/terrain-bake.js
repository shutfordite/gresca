// The GL terrain's textures, baked once at boot from the terrain on the map's grid: heights, slopes, relief, piste.
// Pure: typed arrays in, typed arrays out, no GL. Texel (i, j) is grid point (u, v) = (i, j) m, placed in the world by
// the map's frame (view.mapFrame), so nothing here knows which way is downhill. Memory on the procedural map (1000 ×
// 2450 texels): heights 9.8 MB (R32F), slopes 9.8 MB (RG16F), aux 9.8 MB (RGBA8), the piste's across coordinate
// 0.3 MB (R16F at PISTE_STEP_M), paint 9.8 MB (RGBA8): 40 MB on the GPU, and the same again as CPU copies.

const CAVITY_RADIUS_M = 6;      // m, half-width of the box blur the relief is measured against
const CAVITY_BYTE_PER_M = 96;   // byte steps per m of relief (128 = flat): ±1.3 m fills the byte
const FEATURE_MIN_DIFF = 3;     // 0..255, a colour map texel this far from plain snow in any channel is a feature
const FEATURE_FULL_DIFF = 24;   // 0..255, and this far is fully a feature
/** The bytes of one aux texel and what each holds (gl-budget.js counts them). */
export const AUX_CHANNELS = Object.freeze(['relief', 'groomed', 'track', 'sunVisibility']);
export const PISTE_STEP_M = 4;  // m between samples of the piste's across coordinate (linear in between)
const PISTE_MARGIN = 2;         // samples, the across coordinate is kept this far around groomed snow

/** Heights (m) of the terrain at every grid point, a Float32Array nx × ny (rows of v). frame: the map's MapFrame. */
export function bakeHeights(terrain, frame, nx, ny) {
 const out = new Float32Array(nx * ny);
 const at = { x: 0, y: 0 };
 for (let j = 0; j < ny; j++) {
  for (let i = 0; i < nx; i++) {
   frame.toWorld(i, j, at);
   out[j * nx + i] = terrain.height(at.x, at.y);
  }
 }
 return out;
}

/** Slopes on the grid: dh/du, dh/dv (m/m) by central differences (0 on the edge), interleaved, Float32Array 2 nx ny. */
export function bakeSlopes(heights, nx, ny) {
 const out = new Float32Array(nx * ny * 2);
 for (let j = 1; j < ny - 1; j++) {
  for (let i = 1; i < nx - 1; i++) {
   const k = j * nx + i;
   out[k * 2] = (heights[k + 1] - heights[k - 1]) / 2;
   out[k * 2 + 1] = (heights[k + nx] - heights[k - nx]) / 2;
  }
 }
 return out;
}

// A box blur of src (nx × ny) of half-width r texels along one axis (stride 1 for rows, nx for columns) into dst.
function boxBlur(src, dst, nx, ny, r, alongRows) {
 const lines = alongRows ? ny : nx;
 const len = alongRows ? nx : ny;
 const step = alongRows ? 1 : nx;
 for (let l = 0; l < lines; l++) {
  const base = alongRows ? l * nx : l;
  let sum = 0;
  for (let t = -r; t <= r; t++) sum += src[base + Math.min(len - 1, Math.max(0, t)) * step];
  for (let t = 0; t < len; t++) {
   dst[base + t * step] = sum / (2 * r + 1);
   sum += src[base + Math.min(len - 1, t + r + 1) * step] - src[base + Math.max(0, t - r) * step];
  }
 }
}

/**
 * The relief (m) at every grid point: the mean height within CAVITY_RADIUS_M minus the height, so + in a hollow and
 * - on a ridge or a bump. Float32Array nx × ny.
 */
export function bakeRelief(heights, nx, ny) {
 const a = new Float32Array(nx * ny);
 const b = new Float32Array(nx * ny);
 boxBlur(heights, a, nx, ny, CAVITY_RADIUS_M, true);
 boxBlur(a, b, nx, ny, CAVITY_RADIUS_M, false);
 for (let k = 0; k < b.length; k++) b[k] -= heights[k];
 return b;
}

/** A relief (m) as a byte: 128 flat, more in a hollow. */
export const reliefByte = (m) => Math.max(0, Math.min(255, Math.round(128 + m * CAVITY_BYTE_PER_M)));

/** The relief (m) a byte stands for (the shader's inverse of reliefByte). */
export const RELIEF_M_PER_BYTE = 1 / CAVITY_BYTE_PER_M;

/** 0..255: how much a colour map texel (col0) differs from plain snow (snow), as a feature weight. */
export function featureWeight(col0, snow, o) {
 const d = Math.max(Math.abs(col0[o] - snow[o]), Math.abs(col0[o + 1] - snow[o + 1]),
  Math.abs(col0[o + 2] - snow[o + 2]));
 if (d < FEATURE_MIN_DIFF) return 0;
 return Math.min(255, Math.round((d - FEATURE_MIN_DIFF) / (FEATURE_FULL_DIFF - FEATURE_MIN_DIFF) * 255));
}

/**
 * The painted features, RGBA bytes: the colour map as built (col0, RGBA) with a = featureWeight against its plain
 * snow (snow, RGBA, the same size). A new array; col0 is left as it is.
 */
export function bakePaint(col0, snow) {
 const out = new Uint8Array(col0.length);
 out.set(col0);
 for (let o = 0; o < out.length; o += 4) out[o + 3] = featureWeight(col0, snow, o);
 return out;
}

/**
 * The aux texture, RGBA bytes nx × ny: r relief (reliefByte), g groomed (0..255, terrain.groomed at the texel's
 * centre), b ski-track brightness (255: untouched; trackRows() rewrites it), a sun visibility (255 lit, 0 in the
 * shadow of a ridge or a tree; sun-shadow.js; 255 everywhere if sunVisibility is left out).
 */
export function bakeAux(relief, terrain, frame, nx, ny, sunVisibility = null) {
 const out = new Uint8Array(nx * ny * 4);
 const at = { x: 0, y: 0 };
 for (let j = 0; j < ny; j++) {
  for (let i = 0; i < nx; i++) {
   const k = j * nx + i;
   frame.toWorld(i + 0.5, j + 0.5, at);
   out[k * 4] = reliefByte(relief[k]);
   out[k * 4 + 1] = Math.round(terrain.groomed(at.x, at.y) * 255);
   out[k * 4 + 2] = 255;
   out[k * 4 + 3] = sunVisibility === null ? 255 : sunVisibility[k];
  }
 }
 return out;
}

/**
 * Rewrites the ski-track brightness (aux b) of rows v0..v1 (inclusive) from the live colour map col against col0 (red
 * channel, 255 = no track; ski-tracks.js darkens col). Allocates nothing.
 */
export function trackRows(aux, col, col0, nx, v0, v1) {
 for (let k = v0 * nx; k < (v1 + 1) * nx; k++) {
  const base = col0[k * 4];
  aux[k * 4 + 2] = base > 0 ? Math.min(255, Math.round(col[k * 4] / base * 255)) : 255;
 }
}

/**
 * The piste's across coordinate d (m, course.project) every PISTE_STEP_M m of the grid, where the snow is groomed
 * (or within PISTE_MARGIN samples of it); 0 elsewhere. Returns {data (Float32Array w × h), w, h}. The shader's
 * corduroy runs along the piste, so it reads d between samples (linear: d is smooth across a piste).
 */
export function bakePiste(course, terrain, frame, nx, ny) {
 const w = Math.ceil(nx / PISTE_STEP_M) + 1;
 const h = Math.ceil(ny / PISTE_STEP_M) + 1;
 const groomed = new Uint8Array(w * h);
 const at = { x: 0, y: 0 };
 for (let j = 0; j < h; j++) {
  for (let i = 0; i < w; i++) {
   frame.toWorld(i * PISTE_STEP_M, j * PISTE_STEP_M, at);
   groomed[j * w + i] = terrain.groomed(at.x, at.y) > 0 ? 1 : 0;
  }
 }
 const data = new Float32Array(w * h);
 const where = { s: 0, d: 0, tx: 0, ty: 0 };
 for (let j = 0; j < h; j++) {
  for (let i = 0; i < w; i++) {
   if (!nearGroomed(groomed, w, h, i, j)) continue;
   frame.toWorld(i * PISTE_STEP_M, j * PISTE_STEP_M, at);
   data[j * w + i] = course.project(at.x, at.y, where).d;
  }
 }
 return { data, w, h };
}

// True if a sample within PISTE_MARGIN of (i, j) is groomed.
function nearGroomed(groomed, w, h, i, j) {
 for (let b = Math.max(0, j - PISTE_MARGIN); b <= Math.min(h - 1, j + PISTE_MARGIN); b++) {
  for (let a = Math.max(0, i - PISTE_MARGIN); a <= Math.min(w - 1, i + PISTE_MARGIN); a++) {
   if (groomed[b * w + a]) return true;
  }
 }
 return false;
}

// The IEEE half-float bits of the 32-bit float whose bits are b, rounded to nearest.
function halfBits(b) {
 const sign = (b >>> 16) & 0x8000;
 const e = (b >>> 23) & 0xff;
 const m = b & 0x7fffff;
 if (e === 0xff) return sign | 0x7c00 | (m ? 0x200 : 0);
 const he = e - 127 + 15;
 if (he >= 0x1f) return sign | 0x7c00;
 if (he <= 0) {
  if (he < -10) return sign;
  const mm = (m | 0x800000) >>> (1 - he);
  return sign | ((mm + 0x1000) >>> 13);
 }
 return sign | ((he << 10) + ((m + 0x1000) >>> 13));
}

/** The numbers of src as half-float bits (Uint16Array, same length): WebGL2 RG16F / R16F uploads. */
export function halfArray(src) {
 const f32 = new Float32Array(1);
 const u32 = new Uint32Array(f32.buffer);
 const out = new Uint16Array(src.length);
 for (let k = 0; k < src.length; k++) {
  f32[0] = src[k];
  out[k] = halfBits(u32[0]);
 }
 return out;
}
