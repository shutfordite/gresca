// Synthetic map compiler inputs for the tests: PNG and Terrarium tile encoders, a small ENU-defined world, GeoJSON.
// Everything is built in memory from analytic surfaces, so the tests need no downloads and no committed binaries.
import { deflateSync } from 'node:zlib';
import { createProjection, latLonBox, gridFor } from '../tools/map-compiler/core.js';
import { tilesCovering } from '../tools/map-compiler/sources/terrarium.js';

/** A small test map: 600 m east-west by 400 m north-south at 10 m, in the Pyrenees. */
export const CONFIG = Object.freeze({
 id: 'test-map', name: 'Test Map', centre: Object.freeze({ lat: 42.58, lon: 1.65 }),
 widthM: 600, lengthM: 400, cellM: 10,
});
export const ZOOM = 15; // about 3.5 m pixels
export const TILE = 256; // px

/** PNG bytes of 8-bit RGB (channels 3) or RGBA (4) pixels; row y uses filter filters[y % filters.length]. */
export function encodePng(width, height, channels, pixels, filters = [0]) {
 const stride = width * channels;
 const raw = new Uint8Array((stride + 1) * height);
 for (let y = 0; y < height; y++) {
  const filter = filters[y % filters.length];
  raw[y * (stride + 1)] = filter;
  for (let i = 0; i < stride; i++) {
   const at = y * stride + i;
   const left = i >= channels ? pixels[at - channels] : 0;
   const up = y > 0 ? pixels[at - stride] : 0;
   const upLeft = y > 0 && i >= channels ? pixels[at - stride - channels] : 0;
   raw[y * (stride + 1) + 1 + i] = (pixels[at] - predict(filter, left, up, upLeft)) & 255;
  }
 }
 const ihdr = new Uint8Array(13);
 const view = new DataView(ihdr.buffer);
 view.setUint32(0, width);
 view.setUint32(4, height);
 ihdr.set([8, channels === 3 ? 2 : 6, 0, 0, 0], 8);
 const signature = [137, 80, 78, 71, 13, 10, 26, 10];
 return Buffer.concat([Buffer.from(signature), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)),
  chunk('IEND', new Uint8Array(0))]);
}

function predict(filter, left, up, upLeft) {
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
 return 0;
}

// A PNG chunk; the CRC is left 0 (the decoder does not check it, as zlib checks the data).
function chunk(type, body) {
 const out = Buffer.alloc(12 + body.length);
 out.writeUInt32BE(body.length, 0);
 out.write(type, 4, 'latin1');
 Buffer.from(body).copy(out, 8);
 return out;
}

/** The Terrarium RGB of a height (m), to 1/256 m. */
export function terrariumRgb(h) {
 const v = Math.round((h + 32768) * 256) / 256;
 return [Math.floor(v / 256), Math.floor(v) % 256, Math.round((v - Math.floor(v)) * 256)];
}

/** Terrarium PNG bytes of a tileSize tile whose pixel (px, py) has height heightOf(px, py) m. */
export function terrariumTile(tileSize, heightOf, filters = [0, 1, 2, 3, 4]) {
 const pixels = new Uint8Array(tileSize * tileSize * 3);
 for (let py = 0; py < tileSize; py++) for (let px = 0; px < tileSize; px++) {
  pixels.set(terrariumRgb(heightOf(px, py)), (py * tileSize + px) * 3);
 }
 return encodePng(tileSize, tileSize, 3, pixels, filters);
}

/** lat, lon (deg) of the centre of global Web Mercator pixel (X, Y) at zoom z. */
export function pixelCentreLatLon(X, Y, z, tileSize) {
 const world = 2 ** z * tileSize;
 const lon = (X + 0.5) / world * 360 - 180;
 const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (Y + 0.5) / world))) * 180 / Math.PI;
 return { lat, lon };
}

/**
 * The tiles [{z, x, y, png}] a compile of config needs, with heights from surface(x, y) (m, x east and y north in the
 * map's ENU metres). edit(tile, px, py, h) may change a pixel's height (to plant defects).
 */
export function tilesFor(config, surface, edit = (t, px, py, h) => h) {
 const projection = createProjection(config.centre.lat, config.centre.lon);
 const box = latLonBox(gridFor(config), projection);
 const p = {};
 return tilesCovering(box, ZOOM, TILE).map((t) => ({
  ...t,
  png: terrariumTile(TILE, (px, py) => {
   const ll = pixelCentreLatLon(t.x * TILE + px, t.y * TILE + py, ZOOM, TILE);
   projection.toEnu(ll.lat, ll.lon, p);
   return edit(t, px, py, surface(p.x, p.y));
  }),
 }));
}

/** A tilted plane (m): 2000.37 m at the origin, rising 0.312 m/m east and falling 0.207 m/m north. */
export const plane = (x, y) => 2000.37 + 0.312 * x - 0.207 * y;
/** A cone (m): 2500 m at (50, -30), falling 0.5 m/m in every direction. */
export const CONE_APEX = Object.freeze({ x: 50, y: -30 });
export const cone = (x, y) => 2500 - 0.5 * Math.hypot(x - CONE_APEX.x, y - CONE_APEX.y);

/**
 * OpenSkiMap-shaped runs and lifts FeatureCollections for config, with points given in ENU metres: a run crossing
 * the east edge (clipped), a polygon run, a nordic run (left out), a run wholly outside (left out), and a lift.
 */
export function skiMapFor(config) {
 const projection = createProjection(config.centre.lat, config.centre.lon);
 const ll = {};
 const lonLat = (pts) => pts.map(([x, y]) => {
  projection.toLatLon(x, y, ll);
  return [ll.lon, ll.lat];
 });
 const run = (id, uses, geometry, extra = {}) => ({ type: 'Feature', geometry, properties: {
  type: 'run', id, uses, name: 'Run ' + id, difficulty: 'intermediate', grooming: 'classic',
  sources: [{ type: 'openstreetmap', id: 'way/' + id.length }], ...extra } });
 const runs = { type: 'FeatureCollection', features: [
  run('zz-cross', ['downhill'], { type: 'LineString', coordinates: lonLat([[-100, 150], [100, 50], [400, -50]]) }),
  run('aa-area', ['downhill'], { type: 'Polygon', coordinates: [lonLat([[0, 0], [50, 0], [50, -50], [0, 0]])] },
   { difficulty: 'easy' }),
  run('mm-nordic', ['nordic'], { type: 'LineString', coordinates: lonLat([[0, 0], [10, 10]]) }),
  run('oo-outside', ['downhill'], { type: 'LineString', coordinates: lonLat([[1000, 0], [1100, 10]]) }),
 ] };
 const lifts = { type: 'FeatureCollection', features: [{ type: 'Feature',
  geometry: { type: 'LineString', coordinates: lonLat([[-200, -150], [-150, 150]]) },
  properties: { type: 'lift', id: 'lift-1', name: 'Chair 1', liftType: 'chair_lift',
   sources: [{ type: 'openstreetmap', id: 'way/77' }] } }] };
 return { runs, lifts };
}

/** The source records the CLI would write, for compiling in memory. */
export const SOURCES = Object.freeze([
 { role: 'elevation', name: 'Synthetic Terrarium', url: 'https://tiles.example/{z}/{x}/{y}.png',
  licence: 'test only', attribution: 'Synthetic elevation for tests', retrieved: '2026-11-21', files: 4, sha256: '' },
 { role: 'pistes', name: 'Synthetic OpenSkiMap', url: 'https://ski.example/runs.geojson', licence: 'ODbL-1.0',
  attribution: '© OpenStreetMap contributors, OpenSkiMap', retrieved: '2026-11-21', files: 1, sha256: '' },
]);
