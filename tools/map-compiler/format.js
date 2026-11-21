// The gresca-map-1 terrain file's constants and codecs (docs/adr/0006-map-terrain-format.md): pure, no Node APIs.
// Shared by the compiler (core.js) and the validator (validate.js), which the game may import later (C4).

/** The format tag of a terrain file. */
export const FORMAT = 'gresca-map-1';
/** What kind of gresca-map-1 file this is (C3b adds 'course'). */
export const KIND_TERRAIN = 'terrain';
/** The horizontal projection: WGS84 lat/lon onto the tangent plane at the origin (core.js createProjection). */
export const PROJECTION = 'wgs84-tangent-plane';
/** How the heights are stored: little-endian Uint16 samples, base64; height m = baseM + sample * scaleM. */
export const HEIGHT_ENCODING = 'u16le-base64';
/** m, the height quantum (1 dm: well under the DEM's own vertical error of metres). */
export const HEIGHT_SCALE_M = 0.1;
/** The largest Uint16 sample: heights may span 6553.5 m above baseM. */
export const MAX_SAMPLE = 65535;
/** m, the rounding of polyline points and frame offsets in the file. */
export const POINT_ROUND_M = 0.1;

/** A sample this many cell widths above or below the median of its 8 neighbours is a spike or a pit (R5). */
export const SPIKE_SLOPE = 2.5;
/** m, the least deviation from the neighbours' median that counts as a spike, however small the cell. */
export const SPIKE_MIN_M = 20;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => {
 const index = new Int16Array(128).fill(-1);
 for (let i = 0; i < B64.length; i++) index[B64.charCodeAt(i)] = i;
 return index;
})();

/** Base64 (standard alphabet, padded) of a Uint8Array. */
export function encodeBase64(bytes) {
 const parts = [];
 let chunk = '';
 for (let i = 0; i < bytes.length; i += 3) {
  const b0 = bytes[i];
  const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
  const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
  const n = (b0 << 16) | (b1 << 8) | b2;
  chunk += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
  chunk += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
  chunk += i + 2 < bytes.length ? B64[n & 63] : '=';
  if (chunk.length >= 4096) {
   parts.push(chunk);
   chunk = '';
  }
 }
 parts.push(chunk);
 return parts.join('');
}

/** The bytes of a padded base64 string, or null if it is not valid base64. */
export function decodeBase64(text) {
 if (typeof text !== 'string' || text.length % 4 !== 0) return null;
 const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
 const out = new Uint8Array(text.length / 4 * 3 - pad);
 let o = 0;
 for (let i = 0; i < text.length; i += 4) {
  let n = 0;
  for (let k = 0; k < 4; k++) {
   const code = text.charCodeAt(i + k);
   const isPad = code === 61 && i + k >= text.length - pad;
   const v = isPad ? 0 : code < 128 ? B64_INDEX[code] : -1;
   if (v < 0) return null;
   n = n * 64 + v;
  }
  if (o < out.length) out[o++] = (n >> 16) & 255;
  if (o < out.length) out[o++] = (n >> 8) & 255;
  if (o < out.length) out[o++] = n & 255;
 }
 return out;
}

/** FNV-1a 32-bit hash of a Uint8Array, as 8 lower-case hex digits (an integrity check, not a security one). */
export function fnv1a32(bytes) {
 let h = 0x811c9dc5;
 for (let i = 0; i < bytes.length; i++) {
  h ^= bytes[i];
  h = Math.imul(h, 0x01000193) >>> 0;
 }
 return h.toString(16).padStart(8, '0');
}

/**
 * The file's heights block for heights (m, row-major, row 0 north): {encoding, baseM, scaleM, minM, maxM, fnv1a32,
 * data}. baseM is the whole metre at or below the lowest height. Throws if the span is over 6553.5 m or not finite.
 */
export function encodeHeights(heights) {
 let min = Infinity;
 let max = -Infinity;
 for (let i = 0; i < heights.length; i++) {
  const h = heights[i];
  if (!Number.isFinite(h)) throw new Error('encodeHeights: sample ' + i + ' is not a finite number');
  if (h < min) min = h;
  if (h > max) max = h;
 }
 const baseM = Math.floor(min);
 const samples = new Uint16Array(heights.length);
 for (let i = 0; i < heights.length; i++) {
  const q = Math.round((heights[i] - baseM) / HEIGHT_SCALE_M);
  if (q > MAX_SAMPLE) throw new Error('encodeHeights: heights span more than ' + MAX_SAMPLE * HEIGHT_SCALE_M + ' m');
  samples[i] = q;
 }
 const bytes = u16le(samples);
 return {
  encoding: HEIGHT_ENCODING,
  baseM,
  scaleM: HEIGHT_SCALE_M,
  minM: roundTo(baseM + quantise(min - baseM), HEIGHT_SCALE_M),
  maxM: roundTo(baseM + quantise(max - baseM), HEIGHT_SCALE_M),
  fnv1a32: fnv1a32(bytes),
  data: encodeBase64(bytes),
 };
}

/** The little-endian bytes of a Uint16Array (independent of the machine's byte order). */
function u16le(samples) {
 const bytes = new Uint8Array(samples.length * 2);
 for (let i = 0; i < samples.length; i++) {
  bytes[2 * i] = samples[i] & 255;
  bytes[2 * i + 1] = samples[i] >> 8;
 }
 return bytes;
}

const quantise = (h) => Math.round(h / HEIGHT_SCALE_M) * HEIGHT_SCALE_M;

/** v rounded to a multiple of step, printed without binary noise (roundTo(0.30000000000000004, 0.1) is 0.3). */
export function roundTo(v, step) {
 const decimals = Math.max(0, Math.round(-Math.log10(step)));
 const r = Number((Math.round(v / step) * step).toFixed(decimals));
 return r === 0 ? 0 : r; // no -0 in the file
}

/**
 * The raw Uint8Array bytes of a heights block's data, or null if it is not base64 or not count samples long.
 * Checks the length before decoding, so an oversized string costs nothing.
 */
export function heightBytes(block, count) {
 if (!block || typeof block.data !== 'string') return null;
 if (block.data.length !== Math.ceil(count * 2 / 3) * 4) return null;
 const bytes = decodeBase64(block.data);
 return bytes && bytes.length === count * 2 ? bytes : null;
}

/** Heights (m, Float32Array, row-major, row 0 north) of a terrain file that validateTerrain() accepted. */
export function decodeHeights(file) {
 const count = file.grid.nx * file.grid.ny;
 const bytes = heightBytes(file.heights, count);
 if (!bytes) throw new Error(file.id + '.terrain.json: heights.data is not ' + count + ' base64 samples');
 const out = new Float32Array(count);
 const { baseM, scaleM } = file.heights;
 for (let i = 0; i < count; i++) out[i] = baseM + (bytes[2 * i] | (bytes[2 * i + 1] << 8)) * scaleM;
 return out;
}

/** The median of 8 numbers (the mean of the 4th and 5th smallest); sorts a in place. */
export function median8(a) {
 for (let i = 1; i < 8; i++) {
  const v = a[i];
  let j = i - 1;
  while (j >= 0 && a[j] > v) {
   a[j + 1] = a[j];
   j--;
  }
  a[j + 1] = v;
 }
 return (a[3] + a[4]) / 2;
}
