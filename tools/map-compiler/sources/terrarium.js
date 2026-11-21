// The Terrarium DEM source: PNG tile decoding, Web Mercator tile maths, and a repaired, bicubic height sampler.
// Terrarium tiles (AWS Terrain Tiles, Mapterhorn) store height m = R * 256 + G + B / 256 - 32768 per pixel. Bytes in,
// heights out: fetching and caching live in cli.mjs. Pixel values sit at pixel centres (global pixel X + 0.5).
import { inflateSync } from 'node:zlib';
import { SPIKE_MIN_M, SPIKE_SLOPE, median8 } from '../format.js';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_TILE_PX = 1024; // px, the widest tile accepted (Terrarium tiles are 256 or 512)
const TERRARIUM_OFFSET_M = 32768; // m, subtracted from R * 256 + G + B / 256
/** m, a pixel lower than this is a void (an all-zero pixel decodes to -32768 m). */
export const VOID_BELOW_M = -1000;
const MAX_FILL_PASSES = 64; // neighbour-averaging passes to fill voids before giving up
const EARTH_CIRCUMFERENCE_M = 40075016.686; // m, the Web Mercator sphere's equator

/** {width, height, channels, pixels: Uint8Array} of an 8-bit, non-interlaced RGB or RGBA PNG. Throws otherwise. */
export function decodePng(bytes) {
 for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('decodePng: not a PNG');
 const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
 let header = null;
 const idat = [];
 for (let at = 8; at + 8 <= bytes.length;) {
  const length = view.getUint32(at);
  const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
  const body = bytes.subarray(at + 8, at + 8 + length);
  if (body.length !== length) throw new Error('decodePng: chunk ' + type + ' is cut short');
  if (type === 'IHDR') header = readHeader(new DataView(body.buffer, body.byteOffset, body.byteLength));
  if (type === 'IDAT') idat.push(body);
  if (type === 'IEND') break;
  at += 12 + length;
 }
 if (!header) throw new Error('decodePng: no IHDR chunk');
 const { width, height, channels } = header;
 const raw = inflateSync(concat(idat), { maxOutputLength: (width * channels + 1) * height });
 return { width, height, channels, pixels: unfilter(raw, width, height, channels) };
}

function readHeader(view) {
 const width = view.getUint32(0);
 const height = view.getUint32(4);
 const depth = view.getUint8(8);
 const colour = view.getUint8(9);
 const interlace = view.getUint8(12);
 if (!(width > 0 && height > 0 && width <= MAX_TILE_PX && height <= MAX_TILE_PX)) {
  throw new Error('decodePng: size ' + width + ' x ' + height + ' is outside 1..' + MAX_TILE_PX);
 }
 if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) {
  throw new Error('decodePng: only 8-bit RGB or RGBA without interlace (got depth ' + depth + ', colour ' + colour +
   ', interlace ' + interlace + ')');
 }
 return { width, height, channels: colour === 2 ? 3 : 4 };
}

function concat(parts) {
 const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
 let at = 0;
 for (const p of parts) {
  out.set(p, at);
  at += p.length;
 }
 return out;
}

// Undoes the PNG row filters (none, sub, up, average, Paeth) into tightly packed pixels.
function unfilter(raw, width, height, channels) {
 const stride = width * channels;
 if (raw.length !== (stride + 1) * height) throw new Error('decodePng: image data has the wrong length');
 const out = new Uint8Array(stride * height);
 for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  const src = y * (stride + 1) + 1;
  const row = y * stride;
  for (let i = 0; i < stride; i++) {
   const left = i >= channels ? out[row + i - channels] : 0;
   const up = y > 0 ? out[row - stride + i] : 0;
   const upLeft = y > 0 && i >= channels ? out[row - stride + i - channels] : 0;
   out[row + i] = (raw[src + i] + predict(filter, left, up, upLeft)) & 255;
  }
 }
 return out;
}

function predict(filter, left, up, upLeft) {
 if (filter === 0) return 0;
 if (filter === 1) return left;
 if (filter === 2) return up;
 if (filter === 3) return (left + up) >> 1;
 if (filter === 4) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
 }
 throw new Error('decodePng: unknown row filter ' + filter);
}

/** {size px, heights: Float32Array m, row-major from the tile's north-west pixel} of a square Terrarium PNG tile. */
export function decodeTerrarium(bytes) {
 const { width, height, channels, pixels } = decodePng(bytes);
 if (width !== height) throw new Error('decodeTerrarium: tile is ' + width + ' x ' + height + ', not square');
 const heights = new Float32Array(width * height);
 for (let i = 0; i < heights.length; i++) {
  const p = i * channels;
  heights[i] = pixels[p] * 256 + pixels[p + 1] + pixels[p + 2] / 256 - TERRARIUM_OFFSET_M;
 }
 return { size: width, heights };
}

/** Global Web Mercator pixel x (px, from the antimeridian) of longitude lon (deg) at zoom z, tileSize px tiles. */
export const mercatorX = (lon, z, tileSize) => (lon + 180) / 360 * 2 ** z * tileSize;
/** Global Web Mercator pixel y (px, from the north edge) of latitude lat (deg) at zoom z, tileSize px tiles. */
export function mercatorY(lat, z, tileSize) {
 const phi = lat * Math.PI / 180;
 return (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2 * 2 ** z * tileSize;
}

/** m, the ground width of one pixel at latitude lat (deg), zoom z, tileSize px tiles. */
export const pixelSizeM = (lat, z, tileSize) => EARTH_CIRCUMFERENCE_M * Math.cos(lat * Math.PI / 180) / (2 ** z * tileSize);

/**
 * The tiles {z, x, y} (sorted by y, then x) whose pixels a bicubic sampler needs to cover the lat/lon box {south,
 * west, north, east} (deg) at zoom z: the box plus two pixels on every side.
 */
export function tilesCovering(box, z, tileSize) {
 const margin = 2; // px: a bicubic tap reaches 2 pixels past the sample
 const x0 = Math.floor((mercatorX(box.west, z, tileSize) - margin) / tileSize);
 const x1 = Math.floor((mercatorX(box.east, z, tileSize) + margin) / tileSize);
 const y0 = Math.floor((mercatorY(box.north, z, tileSize) - margin) / tileSize);
 const y1 = Math.floor((mercatorY(box.south, z, tileSize) + margin) / tileSize);
 const tiles = [];
 for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ z, x, y });
 return tiles;
}

/** A tile URL from a template with {z}, {x} and {y}. */
export const tileUrl = (template, { z, x, y }) => template.replace('{z}', z).replace('{x}', x).replace('{y}', y);

/**
 * A DEM source over the decoded tiles {x, y, heights} (all at zoom z, tileSize px, a full rectangle): voids filled
 * and spikes replaced by their neighbours' median (R5). Returns {heightAt(lat, lon) m, bicubic (Catmull-Rom); fixes:
 * {voids, spikes}, the pixels repaired}. Throws if a tile of the rectangle is missing.
 */
export function createTerrariumDem({ z, tileSize, tiles, latitude }) {
 const mosaic = assemble(tiles, tileSize);
 const voids = fillVoids(mosaic);
 const spikes = removeSpikes(mosaic, Math.max(SPIKE_MIN_M, SPIKE_SLOPE * pixelSizeM(latitude, z, tileSize)));
 const wx = new Float64Array(4);
 const wy = new Float64Array(4);
 function heightAt(lat, lon) {
  const fx = mercatorX(lon, z, tileSize) - 0.5 - mosaic.x0;
  const fy = mercatorY(lat, z, tileSize) - 0.5 - mosaic.y0;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  if (ix < 1 || iy < 1 || ix + 2 >= mosaic.w || iy + 2 >= mosaic.h) {
   throw new Error('terrarium: ' + lat + ', ' + lon + ' is outside the tiles (need tilesCovering())');
  }
  catmullRom(fx - ix, wx);
  catmullRom(fy - iy, wy);
  let h = 0;
  for (let j = 0; j < 4; j++) {
   const row = (iy - 1 + j) * mosaic.w + ix - 1;
   h += wy[j] * (wx[0] * mosaic.data[row] + wx[1] * mosaic.data[row + 1] + wx[2] * mosaic.data[row + 2] +
    wx[3] * mosaic.data[row + 3]);
  }
  return h;
 }
 return { heightAt, fixes: { voids, spikes } };
}

// The Catmull-Rom weights of the 4 taps around a sample t (0..1) past the second tap, into w.
function catmullRom(t, w) {
 const t2 = t * t;
 const t3 = t2 * t;
 w[0] = (-t3 + 2 * t2 - t) / 2;
 w[1] = (3 * t3 - 5 * t2 + 2) / 2;
 w[2] = (-3 * t3 + 4 * t2 + t) / 2;
 w[3] = (t3 - t2) / 2;
}

// One Float64Array mosaic {x0, y0 (global px of its first pixel), w, h, data} of a full rectangle of tiles.
function assemble(tiles, tileSize) {
 if (tiles.length === 0) throw new Error('terrarium: no tiles');
 const xs = tiles.map((t) => t.x);
 const ys = tiles.map((t) => t.y);
 const tx0 = Math.min(...xs);
 const ty0 = Math.min(...ys);
 const cols = Math.max(...xs) - tx0 + 1;
 const rows = Math.max(...ys) - ty0 + 1;
 const w = cols * tileSize;
 const data = new Float64Array(w * rows * tileSize).fill(NaN);
 const seen = new Set();
 for (const t of tiles) {
  if (t.heights.length !== tileSize * tileSize) throw new Error('terrarium: tile ' + t.x + '/' + t.y + ' is not ' +
   tileSize + ' px');
  seen.add(t.x + '/' + t.y);
  const left = (t.x - tx0) * tileSize;
  const top = (t.y - ty0) * tileSize;
  for (let py = 0; py < tileSize; py++) {
   for (let px = 0; px < tileSize; px++) data[(top + py) * w + left + px] = t.heights[py * tileSize + px];
  }
 }
 for (let y = ty0; y < ty0 + rows; y++) for (let x = tx0; x < tx0 + cols; x++) {
  if (!seen.has(x + '/' + y)) throw new Error('terrarium: tile ' + x + '/' + y + ' is missing');
 }
 return { x0: tx0 * tileSize, y0: ty0 * tileSize, w, h: rows * tileSize, data };
}

// Fills void pixels with the mean of their filled 8-neighbours, pass by pass; returns how many were voids.
function fillVoids(m) {
 const isVoid = (v) => !(v >= VOID_BELOW_M);
 let count = 0;
 for (let i = 0; i < m.data.length; i++) if (isVoid(m.data[i])) count++;
 let left = count;
 for (let pass = 0; left > 0; pass++) {
  if (pass === MAX_FILL_PASSES) throw new Error('terrarium: a void is wider than ' + MAX_FILL_PASSES + ' pixels');
  const next = m.data.slice();
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
   const i = y * m.w + x;
   if (!isVoid(m.data[i])) continue;
   let sum = 0;
   let n = 0;
   forNeighbours(m, x, y, (v) => {
    if (!isVoid(v)) {
     sum += v;
     n++;
    }
   });
   if (n > 0) {
    next[i] = sum / n;
    left--;
   }
  }
  m.data = next;
 }
 return count;
}

// Replaces each pixel further than limitM from the median of its 8 neighbours by that median; returns how many.
function removeSpikes(m, limitM) {
 const around = new Float64Array(8);
 const next = m.data.slice();
 let count = 0;
 for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
  let n = 0;
  forNeighbours(m, x, y, (v) => {
   around[n++] = v;
  });
  const median = median8(around);
  if (Math.abs(m.data[y * m.w + x] - median) > limitM) {
   next[y * m.w + x] = median;
   count++;
  }
 }
 m.data = next;
 return count;
}

function forNeighbours(m, x, y, fn) {
 for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
  if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < m.w && y + dy < m.h) fn(m.data[(y + dy) * m.w + x + dx]);
 }
}
