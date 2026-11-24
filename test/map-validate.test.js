// The gresca-map-1 terrain validator (tools/map-compiler/validate.js): it accepts what the compiler writes, rejects
// broken or hostile files with a message naming the field, warns about DEM defects (R5), and is pure enough for the
// game to import. Also: every terrain file committed under maps/ validates.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compileTerrain, stringifyMap } from '../tools/map-compiler/core.js';
import { createTerrariumDem, decodeTerrarium } from '../tools/map-compiler/sources/terrarium.js';
import { parseOpenSkiMapLifts, parseOpenSkiMapRuns } from '../tools/map-compiler/sources/openskimap.js';
import { decodeHeights, encodeHeights } from '../tools/map-compiler/format.js';
import { VALIDATE_LIMITS, validateTerrain } from '../tools/map-compiler/validate.js';
import { CONFIG, SOURCES, TILE, ZOOM, plane, skiMapFor, tilesFor } from './map-fixtures.js';

const ROOT = path.join(import.meta.dirname, '..');

// One compiled file (the tilted plane with the synthetic pistes); each test gets a fresh deep copy.
const TEXT = (() => {
 const tiles = tilesFor(CONFIG, plane).map((t) => ({ x: t.x, y: t.y, heights: decodeTerrarium(t.png).heights }));
 const dem = createTerrariumDem({ z: ZOOM, tileSize: TILE, tiles, latitude: CONFIG.centre.lat });
 const skiMap = skiMapFor(CONFIG);
 return stringifyMap(compileTerrain({ config: CONFIG, dem, pistes: parseOpenSkiMapRuns(skiMap.runs),
  lifts: parseOpenSkiMapLifts(skiMap.lifts), sources: SOURCES }));
})();
const fresh = () => JSON.parse(TEXT);

// The errors for a copy of the file after change(file) edits it.
function errorsAfter(change) {
 const file = fresh();
 change(file);
 const result = validateTerrain(file);
 assert.equal(result.ok, false, 'expected the change to be rejected');
 return result.errors.join('\n');
}

describe('validateTerrain accepts', () => {
 it('the compiler\'s output, as text or parsed, with slope stats and no warnings', () => {
  for (const input of [TEXT, fresh()]) {
   const result = validateTerrain(input);
   assert.deepEqual(result.errors, []);
   assert.deepEqual(result.warnings, []);
   assert.equal(result.ok, true);
  }
  const { stats } = validateTerrain(TEXT);
  const planeSlope = Math.atan(Math.hypot(0.312, 0.207)) * 180 / Math.PI;
  assert.ok(Math.abs(stats.meanSlopeDeg - planeSlope) < 0.05, 'mean slope ' + stats.meanSlopeDeg);
  assert.equal(stats.spikes, 0);
  assert.equal(stats.noGoShare, 0);
 });

 it('every terrain file in maps/', () => {
  const dir = path.join(ROOT, 'maps');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.terrain.json')) : [];
  for (const f of files) {
   const text = fs.readFileSync(path.join(dir, f), 'utf8');
   assert.deepEqual(validateTerrain(text).errors, [], f);
   assert.equal(JSON.parse(text).id + '.terrain.json', f, 'the file is named after its id');
  }
 });
});

describe('validateTerrain rejects', () => {
 it('grid sizes that do not match the heights or the bounds', () => {
  assert.match(errorsAfter((f) => {
   f.grid.nx = 60;
   f.bounds.maxX = 290;
  }), /heights\.data: must be 2460 samples/);
  assert.match(errorsAfter((f) => {
   f.bounds.maxY = 0;
  }), /bounds\.maxY/);
  assert.match(errorsAfter((f) => {
   f.grid.nx = 5000;
  }), /grid: nx and ny/);
 });

 it('damaged heights: truncated, edited, or with the wrong min and max', () => {
  assert.match(errorsAfter((f) => {
   f.heights.data = f.heights.data.slice(4);
  }), /heights\.data/);
  assert.match(errorsAfter((f) => {
   f.heights.data = (f.heights.data[0] === 'A' ? 'B' : 'A') + f.heights.data.slice(1);
  }), /fnv1a32/);
  assert.match(errorsAfter((f) => {
   f.heights.minM -= 5;
  }), /minM and maxM/);
  assert.match(errorsAfter((f) => {
   f.heights.baseM = 9000;
   f.heights.minM += 9000 - 1870;
  }), /outside -450\.\.8900/);
 });

 it('NaN and infinity anywhere', () => {
  assert.match(errorsAfter((f) => {
   f.heights.baseM = NaN;
  }), /heights\.baseM: NaN is not a finite number/);
  assert.match(errorsAfter((f) => {
   f.pistes[0].points[1][0] = Infinity;
  }), /pistes\[0\]\.points\[1\]\[0\]/);
 });

 it('missing attribution or licence, and OSM data without ODbL', () => {
  assert.match(errorsAfter((f) => {
   f.sources[0].attribution = '';
  }), /sources\[0\]\.attribution: must not be empty/);
  assert.match(errorsAfter((f) => {
   f.sources = f.sources.filter((s) => s.role !== 'elevation');
  }), /no elevation source/);
  assert.match(errorsAfter((f) => {
   f.licence = 'CC0';
  }), /licence: must be "ODbL-1\.0"/);
  assert.match(errorsAfter((f) => {
   f.sources[1].attribution = 'someone';
  }), /crediting OpenStreetMap/);
  assert.match(errorsAfter((f) => {
   delete f.sources;
  }), /sources: must list/);
 });

 it('bad pistes: points outside the bounds, too few points, bad OSM ids', () => {
  assert.match(errorsAfter((f) => {
   f.pistes[0].points[0] = [5000, 0];
  }), /pistes\[0\]\.points\[0\]: is outside the bounds/);
  assert.match(errorsAfter((f) => {
   f.lifts[0].points = [[0, 0]];
  }), /lifts\[0\]\.points: must be 2/);
  assert.match(errorsAfter((f) => {
   f.pistes[0].osm = ['way/1; drop'];
  }), /pistes\[0\]\.osm/);
 });

 it('the wrong format, kind, id or projection, and a turned frame', () => {
  const errors = errorsAfter((f) => {
   f.format = 'gresca-terrain-1';
   f.kind = 'course';
   f.id = '../etc';
   f.projection = 'mercator';
   f.frame.rotation = 0.5;
  });
  for (const field of ['format', 'kind', 'id', 'projection', 'frame\\.rotation']) {
   assert.match(errors, new RegExp(' ' + field + ': '));
  }
 });

 it('hostile input: oversized text, prototype keys, deep nesting, non-JSON values, not an object', () => {
  const huge = ' '.repeat(VALIDATE_LIMITS.fileChars + 1);
  assert.match(validateTerrain(huge).errors[0], /over the limit/);
  assert.match(validateTerrain('{"__proto__": {"polluted": 1}}').errors[0], /forbidden key "__proto__"/);
  assert.equal({}.polluted, undefined);
  assert.match(validateTerrain(TEXT.replace('"pistes": [', '"constructor": {}, "pistes": [')).errors[0],
   /forbidden key "constructor"/);
  assert.match(validateTerrain('['.repeat(50) + ']'.repeat(50)).errors[0], /nested deeper/);
  assert.match(validateTerrain('{oops').errors[0], /not JSON/);
  assert.match(validateTerrain(null).errors[0], /must be an object/);
  assert.match(validateTerrain([1, 2]).errors[0], /must be an object/);
  const withFunction = fresh();
  withFunction.name = () => 'x';
  assert.match(validateTerrain(withFunction).errors[0], /function is not JSON data/);
  const withDate = fresh();
  withDate.origin = new Date(0);
  assert.match(validateTerrain(withDate).errors[0], /not a plain object/);
 });

 it('too many points in one line', () => {
  assert.match(errorsAfter((f) => {
   f.pistes[0].points = Array.from({ length: VALIDATE_LIMITS.points + 1 }, () => [0, 0]);
  }), /must be 2\.\.100000 points/);
 });
});

describe('validateTerrain warns', () => {
 it('about spikes and pits left in the heights (R5), and unknown fields', () => {
  const file = fresh();
  const heights = decodeHeights(file);
  const nx = file.grid.nx;
  heights[10 * nx + 10] += 200;
  heights[20 * nx + 30] -= 200;
  file.heights = encodeHeights(heights);
  file.extra = true;
  const result = validateTerrain(file);
  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.spikes, 1);
  assert.equal(result.stats.pits, 1);
  const warnings = result.warnings.join('\n');
  assert.match(warnings, /1 spike/);
  assert.match(warnings, /1 pit/);
  assert.match(warnings, /slopes up to .* deg/);
  assert.match(warnings, /unknown field "extra"/);
 });
});

describe('the validator and format modules', () => {
 it('are pure: they import only each other and name no Node or browser API', () => {
  // The course half (ADR 0010) adds its sibling modules and the pure src/world/ modules the game also loads.
  const allowed = (s) => ['./format.js', './course-format.js', './course-run.js'].includes(s) ||
   /^\.\.\/\.\.\/src\/world\/[a-z-]+\.js$/.test(s);
  for (const f of ['validate.js', 'format.js', 'course-format.js', 'course-run.js']) {
   const src = fs.readFileSync(path.join(ROOT, 'tools', 'map-compiler', f), 'utf8');
   const imports = [...src.matchAll(/^import[^;]*from\s+'([^']+)'/gm)].map((m) => m[1]);
   assert.ok(imports.every(allowed), f + ' imports ' + imports);
   const code = src.replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\]|\\.)*'/g, "''");
   for (const api of ['process', 'Buffer', 'require', 'window', 'document', 'fetch', 'Date', 'Math.random']) {
    assert.ok(!new RegExp('\\b' + api.replace('.', '\\.') + '\\b').test(code), f + ' names ' + api);
   }
  }
 });
});
