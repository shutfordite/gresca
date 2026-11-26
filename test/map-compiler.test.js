// @areas world tools
// The map compiler (tools/map-compiler, docs/adr/0006-map-terrain-format.md): Terrarium decoding, tile maths, the
// ENU projection, resampling against analytic surfaces, piste clipping, determinism and the CLI with its cache.
// All offline: tiles and GeoJSON are synthesised in memory (test/map-fixtures.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 compileTerrain, createProjection, clipPolyline, gridFor, stringifyMap,
} from '../tools/map-compiler/core.js';
import {
 createTerrariumDem, decodePng, decodeTerrarium, mercatorX, mercatorY, tilesCovering, tileUrl,
} from '../tools/map-compiler/sources/terrarium.js';
import {
 parseOpenSkiMapLifts, parseOpenSkiMapRuns, parseOverpass,
} from '../tools/map-compiler/sources/openskimap.js';
import { decodeHeights } from '../tools/map-compiler/format.js';
import { validateTerrain } from '../tools/map-compiler/validate.js';
import { runCli } from '../tools/map-compiler/cli.mjs';
import { Terrain } from '../src/world/terrain.js';
import { createMapFrame } from '../src/world/map-frame.js';
import {
 CONFIG, CONE_APEX, SOURCES, TILE, ZOOM, cone, encodePng, plane, skiMapFor, terrariumRgb, terrariumTile, tilesFor,
} from './map-fixtures.js';

const QUANTUM_M = 0.05; // m, half the file's 0.1 m height step
const TERRARIUM_M = 1 / 512; // m, half the Terrarium encoding's 1/256 m step

function demOf(tiles, latitude = CONFIG.centre.lat) {
 const decoded = tiles.map((t) => ({ x: t.x, y: t.y, heights: decodeTerrarium(t.png).heights }));
 return createTerrariumDem({ z: ZOOM, tileSize: TILE, tiles: decoded, latitude });
}

function compile(surface, { config = CONFIG, tiles = tilesFor(config, surface), skiMap = skiMapFor(config) } = {}) {
 return compileTerrain({ config, dem: demOf(tiles), pistes: parseOpenSkiMapRuns(skiMap.runs),
  lifts: parseOpenSkiMapLifts(skiMap.lifts), sources: SOURCES });
}

// The largest |file height - surface| over the grid's samples where keep(x, y) holds.
function worstError(file, surface, keep = () => true) {
 const heights = decodeHeights(file);
 let worst = 0;
 for (let j = 0; j < file.grid.ny; j++) for (let i = 0; i < file.grid.nx; i++) {
  const x = file.frame.originX + i * file.grid.cellM;
  const y = file.frame.originY - j * file.grid.cellM;
  if (keep(x, y)) worst = Math.max(worst, Math.abs(heights[j * file.grid.nx + i] - surface(x, y)));
 }
 return worst;
}

describe('Terrarium tiles', () => {
 it('decodes PNG pixels through every row filter, RGB and RGBA', () => {
  for (const channels of [3, 4]) {
   const pixels = Uint8Array.from({ length: 7 * 5 * channels }, (_, i) => (i * 37 + 11) % 256);
   const png = decodePng(encodePng(7, 5, channels, pixels, [0, 1, 2, 3, 4]));
   assert.equal(png.width, 7);
   assert.equal(png.channels, channels);
   assert.deepEqual([...png.pixels], [...pixels]);
  }
 });

 it('decodes height = R * 256 + G + B / 256 - 32768', () => {
  const values = [0, 2000.5, -10.25, 8848.0078125, 1234.99609375];
  const tile = decodeTerrarium(terrariumTile(2, (px, py) => values[py * 2 + px] ?? 0));
  assert.equal(tile.size, 2);
  assert.deepEqual([...tile.heights], values.slice(0, 4));
  assert.deepEqual(terrariumRgb(2000.5), [135, 208, 128]);
 });

 it('rejects what is not an 8-bit RGB(A) PNG', () => {
  assert.throws(() => decodePng(new Uint8Array(32)), /not a PNG/);
  const grey = encodePng(2, 2, 3, new Uint8Array(12));
  grey[8 + 8 + 9] = 0; // IHDR colour type: greyscale
  assert.throws(() => decodePng(grey), /only 8-bit RGB or RGBA/);
 });

 it('does the Web Mercator tile maths', () => {
  assert.equal(mercatorX(0, 0, 256), 128);
  assert.ok(Math.abs(mercatorY(0, 0, 256) - 128) < 1e-9);
  assert.equal(Math.floor(mercatorX(1.65, 13, 256) / 256), 4133); // El Tarter's tile column at z13
  const tiles = tilesCovering({ south: 42.578, west: 1.646, north: 42.582, east: 1.654 }, ZOOM, TILE);
  assert.ok(tiles.length >= 2);
  assert.deepEqual(tiles, [...tiles].sort((a, b) => a.y - b.y || a.x - b.x));
  assert.equal(tileUrl('https://t.example/{z}/{x}/{y}.png', { z: 3, x: 4, y: 5 }), 'https://t.example/3/4/5.png');
 });

 it('fills voids and replaces spikes with their neighbours (R5), and says how many', () => {
  const tiles = tilesFor(CONFIG, plane, (t, px, py, h) => {
   if (px === 100 && py === 100) return -32768; // an all-zero pixel: a void
   if (px === 120 && py === 60) return h + 300; // a spike
   return h;
  });
  const dem = demOf(tiles);
  assert.deepEqual(dem.fixes, { voids: tiles.length, spikes: tiles.length });
  const file = compileTerrain({ config: CONFIG, dem, sources: SOURCES.slice(0, 1) });
  assert.ok(worstError(file, plane) < 0.2, 'the repaired surface is the plane again');
  assert.deepEqual(file.sources[0].fixes, dem.fixes);
 });

 it('refuses an incomplete set of tiles', () => {
  const tiles = tilesFor(CONFIG, plane);
  const gappy = tiles.length > 2 ? [tiles[0], tiles.at(-1)] : tiles.slice(1); // a hole in the rectangle, or one short
  assert.throws(() => compileTerrain({ config: CONFIG, dem: demOf(gappy), sources: SOURCES }), /missing|outside/);
 });
});

describe('the ENU projection', () => {
 const proj = createProjection(CONFIG.centre.lat, CONFIG.centre.lon);

 it('puts the origin at (0, 0) and round-trips to 1e-6 m within 5 km', () => {
  const p = proj.toEnu(CONFIG.centre.lat, CONFIG.centre.lon, {});
  assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9);
  for (let a = 0; a < 16; a++) for (const r of [10, 1000, 5000]) {
   const x = r * Math.cos(a * Math.PI / 8);
   const y = r * Math.sin(a * Math.PI / 8);
   const ll = proj.toLatLon(x, y, {});
   const back = proj.toEnu(ll.lat, ll.lon, {});
   assert.ok(Math.hypot(back.x - x, back.y - y) < 1e-6, 'round trip at ' + r + ' m, ' + a);
  }
 });

 it('measures 5 km north as the meridian arc, to 5 mm', () => {
  // The WGS84 meridian arc from the origin to 5 km north, integrated numerically (deg -> m).
  const a = 6378137;
  const e2 = (1 / 298.257223563) * (2 - 1 / 298.257223563);
  const north = proj.toLatLon(0, 5000, {});
  const steps = 1000;
  let arc = 0;
  for (let k = 0; k < steps; k++) {
   const phi = (CONFIG.centre.lat + (north.lat - CONFIG.centre.lat) * (k + 0.5) / steps) * Math.PI / 180;
   arc += a * (1 - e2) / (1 - e2 * Math.sin(phi) ** 2) ** 1.5 * (north.lat - CONFIG.centre.lat) / steps * Math.PI / 180;
  }
  assert.ok(Math.abs(arc - 5000) < 0.005, 'arc ' + arc + ' m');
  assert.ok(Math.abs(north.lon - CONFIG.centre.lon) < 1e-12, 'north stays on the meridian');
 });

 it('puts east along +x and north along +y', () => {
  const p = proj.toEnu(CONFIG.centre.lat + 0.001, CONFIG.centre.lon + 0.001, {});
  assert.ok(p.x > 80 && p.y > 100, JSON.stringify(p));
 });
});

describe('compiling a terrain file', () => {
 it('lays out the grid around the origin, rows north to south', () => {
  const g = gridFor(CONFIG);
  assert.deepEqual([g.nx, g.ny, g.cellM], [61, 41, 10]);
  assert.deepEqual(g.frame, { originX: -300, originY: 200, rotation: 0 });
  assert.deepEqual(g.bounds, { minX: -300, minY: -200, maxX: 300, maxY: 200 });
  assert.throws(() => gridFor({ ...CONFIG, cellM: 0.5 }), /cellM/);
  assert.throws(() => gridFor({ ...CONFIG, id: 'Bad Id' }), /id/);
 });

 it('resamples a tilted plane to within the height quantum', () => {
  const file = compile(plane);
  assert.ok(worstError(file, plane) <= QUANTUM_M + TERRARIUM_M + 1e-6, 'error ' + worstError(file, plane));
 });

 it('resamples a cone to 0.1 m away from its apex, and 1.5 m at it', () => {
  const file = compile(cone);
  const far = (x, y) => Math.hypot(x - CONE_APEX.x, y - CONE_APEX.y) > 30;
  assert.ok(worstError(file, cone, far) < 0.1, 'away from the apex ' + worstError(file, cone, far));
  assert.ok(worstError(file, cone) < 1.5, 'at the apex ' + worstError(file, cone));
 });

 it('samples the same surface through Terrain.grid and the file\'s MapFrame (ADR 0005)', () => {
  const file = compile(plane);
  const frame = createMapFrame(file.frame);
  const terrain = Terrain.grid(decodeHeights(file), file.grid.nx, file.grid.ny, file.grid.cellM, frame);
  for (const [x, y] of [[0, 0], [-123.4, 56.7], [250, -180], [-290, 190]]) {
   assert.ok(Math.abs(terrain.height(x, y) - plane(x, y)) < 0.06, 'at ' + x + ', ' + y);
  }
 });

 it('keeps downhill runs and lifts in ENU metres, clipped to the bounds, with their OSM ids', () => {
  const file = compile(plane);
  assert.deepEqual(file.pistes.map((p) => p.id), ['aa-area', 'zz-cross']);
  const cross = file.pistes[1];
  assert.deepEqual(cross.points[0], [-100, 150]);
  assert.deepEqual(cross.points.at(-1)[0], 300, 'cut at the east edge');
  assert.equal(file.pistes[0].area, true);
  assert.deepEqual(file.lifts[0], { id: 'lift-1', part: 0, osm: ['way/77'], name: 'Chair 1', kind: 'chair_lift',
   points: [[-200, -150], [-150, 150]] });
  assert.equal(file.licence, 'ODbL-1.0');
 });

 it('clips a polyline that leaves and comes back into two parts', () => {
  const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const parts = clipPolyline([[5, 5], [15, 5], [15, 8], [5, 8]], box);
  assert.deepEqual(parts, [[[5, 5], [10, 5]], [[10, 8], [5, 8]]]);
  assert.deepEqual(clipPolyline([[20, 20], [30, 30]], box), []);
 });

 it('is deterministic: the same inputs in any order give the same bytes', () => {
  const tiles = tilesFor(CONFIG, cone);
  const a = stringifyMap(compile(cone, { tiles }));
  const skiMap = skiMapFor(CONFIG);
  skiMap.runs.features.reverse();
  const b = stringifyMap(compile(cone, { tiles: [...tiles].reverse(), skiMap }));
  assert.equal(a, b);
  assert.ok(a.endsWith('}\n'));
 });

 it('reads Overpass ways as pistes and lifts', () => {
  const geometry = [{ lat: 42.58, lon: 1.65 }, { lat: 42.581, lon: 1.651 }];
  const got = parseOverpass({ elements: [
   { type: 'way', id: 9, tags: { 'piste:type': 'downhill', 'piste:difficulty': 'easy', name: 'Blue' }, geometry },
   { type: 'way', id: 3, tags: { aerialway: 'gondola' }, geometry },
   { type: 'way', id: 4, tags: { aerialway: 'station' }, geometry },
   { type: 'node', id: 5, tags: { 'piste:type': 'downhill' } },
  ] });
  assert.deepEqual(got.pistes.map((p) => [p.id, p.osm, p.name, p.difficulty]), [['way/9', ['way/9'], 'Blue', 'easy']]);
  assert.deepEqual(got.lifts.map((l) => [l.id, l.kind]), [['way/3', 'gondola']]);
 });

 it('ignores malformed features instead of trusting them', () => {
  const runs = parseOpenSkiMapRuns({ type: 'FeatureCollection', features: [null, 7, { properties: {} },
   { properties: { type: 'run', id: 'x', uses: ['downhill'], sources: [{ type: 'openstreetmap', id: 'way/1;x' }] },
    geometry: { type: 'LineString', coordinates: [[1.65, 42.58], ['a', 1], [1.651, 42.581]] } }] });
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].osm, [], 'a bad OSM id is dropped');
  assert.equal(runs[0].lines[0].length, 2, 'a bad point is dropped');
  assert.throws(() => parseOpenSkiMapRuns({ type: 'Feature' }), /FeatureCollection/);
 });
});

describe('the CLI', () => {
 it('compiles from the cache with no network, validates, and writes the same file twice', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gresca-map-'));
  try {
   const cache = path.join(dir, 'cache');
   fs.mkdirSync(cache);
   const elevation = { source: 'terrarium', name: 'Synthetic', url: 'https://tiles.example/{z}/{x}/{y}.png',
    zoom: ZOOM, tileSize: TILE, licence: 'test only', attribution: 'Synthetic elevation' };
   const pistes = { source: 'openskimap', name: 'Synthetic OpenSkiMap', runsUrl: 'https://ski.example/runs.geojson',
    liftsUrl: 'https://ski.example/lifts.geojson', licence: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors, OpenSkiMap' };
   const config = { ...CONFIG, elevation, pistes };
   const manifest = {};
   const put = (key, bytes, n) => {
    fs.writeFileSync(path.join(cache, n + '.bin'), bytes);
    manifest[key] = { file: n + '.bin', retrieved: '2026-11-0' + (n % 9 + 1), sha256: 'f'.repeat(63) + (n % 10) };
   };
   tilesFor(CONFIG, cone).forEach((t, n) => put(tileUrl(elevation.url, t), t.png, n));
   const skiMap = skiMapFor(CONFIG);
   put(pistes.runsUrl, JSON.stringify(skiMap.runs), 100);
   put(pistes.liftsUrl, JSON.stringify(skiMap.lifts), 101);
   fs.writeFileSync(path.join(cache, 'manifest.json'), JSON.stringify(manifest));
   const configPath = path.join(dir, 'test-map.json');
   fs.writeFileSync(configPath, JSON.stringify(config));
   const out = path.join(dir, 'out', 'test-map.terrain.json');
   const args = ['--config', configPath, '--cache', cache, '--out', out];
   const quiet = () => {};
   assert.equal(await runCli(args, quiet), 0);
   const first = fs.readFileSync(out, 'utf8');
   assert.equal(await runCli(args, quiet), 0);
   assert.equal(fs.readFileSync(out, 'utf8'), first, 'a re-run from the cache is byte-identical');
   const result = validateTerrain(first);
   assert.deepEqual(result.errors, []);
   const file = JSON.parse(first);
   assert.deepEqual(file.sources.map((s) => s.role), ['elevation', 'pistes', 'lifts']);
   assert.match(file.sources[0].sha256, /^[0-9a-f]{64}$/);
   delete manifest[pistes.liftsUrl];
   fs.writeFileSync(path.join(cache, 'manifest.json'), JSON.stringify(manifest));
   await assert.rejects(runCli(args, quiet), /not in the cache.*--fetch/);
  } finally {
   fs.rmSync(dir, { recursive: true, force: true });
  }
 });
});
