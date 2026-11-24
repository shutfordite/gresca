// The gresca-map-1 course file (docs/adr/0010-map-course-format.md): compileCourse() makes it from a baked terrain
// file, validateCourse() accepts it and rejects each broken rule with a message naming the field, and the CLI writes
// it offline. Fixtures: test/fixtures/maps/ (the synthetic map of test/map-fixtures.js; no network).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileCourse, stringifyMap } from '../tools/map-compiler/core.js';
import { runCli } from '../tools/map-compiler/cli.mjs';
import { MEAN_SLOPE_TOLERANCE_DEG } from '../tools/map-compiler/course-format.js';
import { validateCourse, validateTerrain, widthAtS } from '../tools/map-compiler/validate.js';

const DIR = path.join(import.meta.dirname, 'fixtures', 'maps');
const read = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');
const TERRAIN_TEXT = read('test-map.terrain.json');
const COURSE_TEXT = read('test-map.course.json');
const CONFIG = JSON.parse(read('test-map.config.json'));
const terrain = () => JSON.parse(TERRAIN_TEXT);
const fresh = () => JSON.parse(COURSE_TEXT);

// The errors for a copy of the course after change(file) edits it (and of the terrain, if change returns one).
function errorsAfter(change, against = terrain()) {
 const file = fresh();
 const edited = change(file, against) || against;
 const result = validateCourse(file, edited);
 assert.equal(result.ok, false, 'expected the change to be rejected');
 return result.errors.join('\n');
}

describe('compileCourse', () => {
 it('round-trips: the compiled course validates against its terrain, with the measured slope', () => {
  const file = compileCourse({ ...CONFIG.course, terrain: terrain() });
  const result = validateCourse(stringifyMap(file), terrain());
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.ok(Math.abs(result.stats.measuredMeanSlopeDeg - file.meanSlopeDeg) < 0.01);
  assert.ok(result.stats.lengthM > 400);
 });

 it('writes the committed fixture byte for byte (deterministic), and the fixture terrain validates', () => {
  assert.equal(validateTerrain(TERRAIN_TEXT).ok, true);
  const file = compileCourse({ ...CONFIG.course, terrain: terrain() });
  assert.equal(stringifyMap(file), COURSE_TEXT);
 });

 it('picks the run by OSM id or by name, to the same course', () => {
  const byId = compileCourse({ terrain: terrain(), run: { osm: ['way/8'] } });
  const byName = compileCourse({ terrain: terrain(), run: { name: 'Run zz-cross' } });
  assert.equal(byId.finishS, byName.finishS);
  assert.deepEqual(byName.run.osm, ['way/8']);
  assert.throws(() => compileCourse({ terrain: terrain(), run: { osm: ['way/999'] } }), /way\/999.*not a piste/);
  assert.throws(() => compileCourse({ terrain: terrain(), run: { name: 'Nowhere' } }), /no piste is called "Nowhere"/);
 });

 it('takes the width from the difficulty and the sun from the run: side light, in compass degrees', () => {
  const file = fresh();
  assert.deepEqual(file.widths, [[0, 30]]); // intermediate
  assert.ok(file.sun.azimuthDeg >= 0 && file.sun.azimuthDeg < 360);
  assert.equal(file.sun.elevationDeg, 16);
 });

 it('measures a horizon that rises uphill: the plane climbs east, so east is higher than west', () => {
  const { near } = fresh().horizon;
  assert.equal(near.length, 360);
  assert.ok(near[90] > near[270] + 20, 'east ' + near[90] + ', west ' + near[270]);
 });
});

describe('validateCourse accepts', () => {
 it('the committed course as text or parsed, and checks it alone without a terrain', () => {
  assert.deepEqual(validateCourse(COURSE_TEXT, terrain()).errors, []);
  assert.deepEqual(validateCourse(fresh(), terrain()).errors, []);
  assert.deepEqual(validateCourse(fresh()).errors, []);
 });

 it('a re-baked terrain with a warning, not an error', () => {
  const file = fresh();
  file.terrain.heightsFnv1a32 = '00000000';
  const result = validateCourse(file, terrain());
  assert.equal(result.ok, true);
  assert.match(result.warnings.join('\n'), /re-baked/);
 });
});

describe('validateCourse rejects', () => {
 it('a wrong format, kind, id or licence', () => {
  assert.match(errorsAfter((f) => { f.format = 'gresca-map-2'; }), /format: must be "gresca-map-1"/);
  assert.match(errorsAfter((f) => { f.kind = 'terrain'; }), /kind: must be "course"/);
  assert.match(errorsAfter((f) => { f.id = 'Bad Id'; }), /id: must be lower-case kebab-case/);
  assert.match(errorsAfter((f) => { f.licence = 'CC0'; }), /licence: must be "ODbL-1.0"/);
 });

 it('a course for another terrain', () => {
  assert.match(errorsAfter((f) => { f.terrain.id = 'other'; }), /terrain\.id: must be "test-map"/);
  assert.match(errorsAfter((f) => { f.id = 'other'; f.terrain.id = 'other'; }), /id: is "other" but the terrain/);
 });

 it('missing ODbL attribution: no pistes source, a source without ODbL, or without the OpenStreetMap credit', () => {
  const needs = /ODbL attribution/;
  assert.match(errorsAfter((f) => { f.sources = f.sources.filter((s) => s.role !== 'pistes'); }), needs);
  assert.match(errorsAfter((f) => { f.sources[1].licence = 'CC-BY'; }), needs);
  assert.match(errorsAfter((f) => { f.sources[1].attribution = 'a ski map'; }), needs);
  assert.match(errorsAfter((f) => { delete f.sources; }), /sources: must list at least one source/);
 });

 it('a run that is not in the terrain, or names nothing', () => {
  assert.match(errorsAfter((f) => { f.run.osm = ['way/999']; }), /"way\/999" is not a piste/);
  assert.match(errorsAfter((f) => { f.run.osm = []; f.run.name = 'Nowhere'; }), /no piste is called "Nowhere"/);
  assert.match(errorsAfter((f) => { f.run.osm = []; f.run.name = ''; }), /run\.name: must not be empty/);
  assert.match(errorsAfter((f) => { f.run.osm = ['way 1']; }), /run\.osm: must be at most/);
  assert.match(errorsAfter((f) => { f.run.difficulty = 'hard'; }), /run\.difficulty: must be one of/);
 });

 it('widths out of range, out of order or not starting at 0', () => {
  assert.match(errorsAfter((f) => { f.widths = [[0, 2]]; }), /widths\[0\]: width 2 m is outside 4\.\.200 m/);
  assert.match(errorsAfter((f) => { f.widths = [[0, 30], [0, 20]]; }), /widths\[1\]: s 0 m must be greater/);
  assert.match(errorsAfter((f) => { f.widths = [[10, 30]]; }), /widths\[0\]: must start at s 0/);
  assert.match(errorsAfter((f) => { f.widths = []; }), /widths: must be 1\.\./);
 });

 it('a finish before the start, a start below zero, or a finish past the end of the run', () => {
  assert.match(errorsAfter((f) => { f.startS = 300; f.finishS = 200; }), /finishS: finish \(200 m\) must be after the start/);
  assert.match(errorsAfter((f) => { f.startS = -1; }), /startS: .*startS >= 0/);
  assert.match(errorsAfter((f) => { f.finishS = 5000; }), /finishS: 5000 m is past the end of the run/);
  assert.match(errorsAfter((f) => { f.startS = 0; f.finishS = 10; }), /at least 50 m/);
 });

 it('park items outside the piste width, out of order, or outside start and finish', () => {
  assert.match(errorsAfter((f) => { f.kickers[0].d = 14; }), /kickers\[0\]\.d: the kicker .* outside the piste width \(\+-15 m\)/);
  assert.match(errorsAfter((f) => { f.rails[0].d = 16; }), /rails\[0\]\.d: the rail .* outside the piste width/);
  assert.match(errorsAfter((f) => { f.widths = [[0, 8]]; }), /kickers\[1\]\.d: .*outside the piste width \(\+-4 m\)/);
  assert.match(errorsAfter((f) => { f.kickers.reverse(); }), /kickers\[1\]\.s: 100 m is not after the previous kicker/);
  assert.match(errorsAfter((f) => { f.rails.push({ s0: 150, s1: 160, d: 0, h: 0.4, t: 'box' }); }),
   /rails\[1\]\.s0: 150 m is before the previous rail/);
  assert.match(errorsAfter((f) => { f.kickers[1].s = 430; }), /kickers\[1\]\.s: the kicker .* between the start and the finish/);
  assert.match(errorsAfter((f) => { f.finishS = 120; }), /kickers\[1\]\.s: the kicker .* between the start and the finish/);
 });

 it('malformed park items', () => {
  assert.match(errorsAfter((f) => { f.kickers[0].big = 'yes'; }), /kickers\[0\]: must be \{s, d, halfWidth, depth/);
  assert.match(errorsAfter((f) => { f.kickers[0].launchGain = 9; }), /kickers\[0\]\.launchGain: must be 0\.5\.\.3/);
  assert.match(errorsAfter((f) => { f.kickers[0].depth = 0; }), /kickers\[0\]\.depth: must be 1\.\.40 m/);
  assert.match(errorsAfter((f) => { f.rails[0].t = 'wall'; }), /rails\[0\]: must be \{s0, s1, d, h \(m\), t: "rail" or "box"\}/);
  assert.match(errorsAfter((f) => { f.rails[0].s1 = 100; }), /rails\[0\]\.s1: must be after s0/);
  assert.match(errorsAfter((f) => { f.kickers = {}; }), /kickers: must be an array/);
 });

 it('a mean slope that does not match the run measured on the terrain (within the tolerance, it passes)', () => {
  const real = fresh().meanSlopeDeg;
  assert.match(errorsAfter((f) => { f.meanSlopeDeg = real + MEAN_SLOPE_TOLERANCE_DEG + 0.5; }),
   /meanSlopeDeg: .* does not match the run measured on the terrain \(20\.14 deg, tolerance 1 deg\)/);
  assert.match(errorsAfter((f) => { f.meanSlopeDeg = real - MEAN_SLOPE_TOLERANCE_DEG - 0.5; }), /meanSlopeDeg/);
  assert.match(errorsAfter((f) => { f.meanSlopeDeg = 70; }), /meanSlopeDeg: must be 0\.\.45 deg/);
  const near = fresh();
  near.meanSlopeDeg = real + MEAN_SLOPE_TOLERANCE_DEG - 0.1;
  assert.equal(validateCourse(near, terrain()).ok, true);
 });

 it('a run that leaves the terrain bounds', () => {
  const shrunk = (f, t) => {
   t.bounds = { ...t.bounds, maxX: 100 };
   return t;
  };
  assert.match(errorsAfter(shrunk), /run: leaves the terrain's bounds/);
 });

 it('a bad sun, tree set or horizon', () => {
  assert.match(errorsAfter((f) => { f.sun.azimuthDeg = 360; }), /sun\.azimuthDeg: must be 0\.\.360/);
  assert.match(errorsAfter((f) => { f.sun.elevationDeg = 0; }), /sun\.elevationDeg: must be 1\.\.89/);
  assert.match(errorsAfter((f) => { f.sun = { azimuthDeg: 'east' }; }), /sun: must be \{azimuthDeg, elevationDeg\}/);
  assert.match(errorsAfter((f) => { f.treeSet = 'palm'; }), /treeSet: must be one of sugi, pine/);
  assert.match(errorsAfter((f) => { f.horizon.near.pop(); }), /horizon\.near: must be 360 angles/);
  assert.match(errorsAfter((f) => { f.horizon.far[7] = 80; }), /horizon\.far\[7\]: must be -60\.\.60 deg/);
  assert.match(errorsAfter((f) => { f.horizon.stepDeg = 7; }), /horizon\.stepDeg: must be a whole number/);
 });
});

describe('validateCourse on untrusted data', () => {
 it('rejects non-JSON, non-objects, forbidden keys, non-finite numbers and oversized text, never throwing', () => {
  assert.match(validateCourse('{nope').errors.join(), /not JSON/);
  assert.match(validateCourse('[]').errors.join(), /must be an object/);
  assert.match(validateCourse('{"a": {"__proto__": {}}}').errors.join(),
   /forbidden key/);
  assert.match(validateCourse('x'.repeat(1024 * 1024 + 1)).errors.join(), /over the limit/);
  const infinite = fresh();
  infinite.startS = Infinity;
  assert.match(validateCourse(infinite, terrain()).errors.join(), /not a finite number/);
  for (const junk of [null, 7, 'text', undefined]) assert.equal(validateCourse(junk).ok, false);
 });

 it('warns about unknown fields and ignores them', () => {
  const file = fresh();
  file.extra = 1;
  const result = validateCourse(file, terrain());
  assert.equal(result.ok, true);
  assert.match(result.warnings.join(), /unknown field "extra"/);
 });
});

describe('widthAtS', () => {
 it('joins the stops with straight lines and holds the end values', () => {
  const stops = [[0, 20], [100, 40]];
  assert.equal(widthAtS(stops, -5), 20);
  assert.equal(widthAtS(stops, 50), 30);
  assert.equal(widthAtS(stops, 500), 40);
 });
});

describe('the course CLI', () => {
 function tempCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gresca-course-'));
  for (const name of ['test-map.terrain.json', 'test-map.config.json']) fs.copyFileSync(path.join(DIR, name), path.join(dir, name));
  return dir;
 }
 const quiet = () => {};

 it('writes the course from a terrain file and the config, and never overwrites without --overwrite', async () => {
  const dir = tempCopy();
  try {
   const args = ['--course', '--terrain', path.join(dir, 'test-map.terrain.json'), '--config',
    path.join(dir, 'test-map.config.json')];
   assert.equal(await runCli(args, quiet), 0);
   assert.equal(fs.readFileSync(path.join(dir, 'test-map.course.json'), 'utf8'), COURSE_TEXT);
   await assert.rejects(runCli(args, quiet), /exists and may hold authored level design/);
   assert.equal(await runCli([...args, '--overwrite'], quiet), 0);
  } finally {
   fs.rmSync(dir, { recursive: true });
  }
 });

 it('takes the run from --run or --run-name, and refuses a terrain that does not validate', async () => {
  const dir = tempCopy();
  try {
   const terrainPath = path.join(dir, 'test-map.terrain.json');
   const out = path.join(dir, 'a.course.json');
   assert.equal(await runCli(['--course', '--terrain', terrainPath, '--run', 'way/8', '--out', out], quiet), 0);
   assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).run.osm[0], 'way/8');
   const named = path.join(dir, 'b.course.json');
   assert.equal(await runCli(['--course', '--terrain', terrainPath, '--run-name', 'Run zz-cross', '--out', named], quiet), 0);
   const broken = JSON.parse(TERRAIN_TEXT);
   broken.format = 'nope';
   fs.writeFileSync(terrainPath, JSON.stringify(broken));
   assert.equal(await runCli(['--course', '--terrain', terrainPath, '--run', 'way/8'], quiet), 1);
  } finally {
   fs.rmSync(dir, { recursive: true });
  }
 });
});
