// @areas world
// Lint for the course seam (B2c) and the world frame (C2): nothing outside the procedural map knows cx(y), the park
// constants, the height array, "+y is downhill" or which way the map lies in the world. Everything else asks the
// Course (core/contracts.js), the Terrain and the map frame (world/map-frame.js, docs/adr/0005-enu-frame.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');

// The procedural map: these files may use its internals freely.
const PROCEDURAL = ['world/course.js', 'world/build.js', 'world/play-slope.js', 'view/colour-map.js'];
// What only the procedural map may import from world/course.js.
const BANNED = ['cx', 'KICK', 'KBIG', 'FIN', 'RAILS', 'RAIL_DEF', 'bump', 'W0', 'H0'];
// Files outside the procedural map that may still import one of BANNED, and why.
const IMPORT_EXCEPTIONS = {
 'view/view-state.js': { names: ['W0', 'H0'], why: 'the colour map canvas is one px per map metre (D2 removes it)' },
 'world/fields.js': { names: ['bump'], why: 'Gresca.world.rampHeight reports the ramp stamp (C2: features layer)' },
};

// "+y is downhill" idioms found while moving the game onto the course. Each catches one way of using map y as the
// distance down the piste:
const DOWNHILL_Y = [
 // a rider, drawn pose or camera y compared with a threshold (the finish line, a kicker's y)
 { re: /\b(?:rider|pose|drawn|camera)\.y\s*[<>]/, what: 'a y position compared with a y threshold' },
 // metres left or ahead as a constant y minus a position's y (FIN - pose.y)
 { re: /\b[A-Z][A-Z0-9_]*\s*-\s*(?:rider|pose|drawn|camera)\.y\b/, what: 'metres down the piste as a y difference' },
 // a feature culled or entered by its y span (r.y0 .. r.y1)
 { re: /\.y[01]\s*[<>]|[<>]=?\s*\w+\.y[01]\b/, what: 'a rail culled by its y span' },
 // a kicker found by comparing y with its lip y (KICK.find((k) => y >= k ...))
 { re: /\by\s*[<>]=?\s*k\b/, what: 'a kicker found by its lip y' },
];
// The axis assumptions C2 removed (ADR 0004 "Consequences"): each fixed a direction to the map's old axes.
const MAP_AXES = [
 // the run start, place() and the camera pointed at a fixed angle (PI/2, 1.57: "straight down +y")
 { re: /\bheading\s*[:=]\s*(?:Math\.PI\s*\/\s*2|1\.57)\b/, what: 'a heading fixed to the map\'s old downhill' },
 // a speed put straight into vy (rider.vy = START_SPEED)
 { re: /\.vy\s*=\s*[A-Z][A-Z0-9_]*\s*;/, what: 'a speed along map y' },
 // a view direction fixed to +y
 { re: /\bdirY\s*:\s*1\b/, what: 'a view direction fixed to map y' },
 // keepOnMap clamping y, or the axis-aligned box used as the map's edge
 { re: /\.y\s*<\s*EDGE|\bbounds\.max[XY]\b/, what: 'the map edge as an axis-aligned box' },
 // the big kickers' ramp flags placed up map y from the lip
 { re: /\bk\.y\s*[-+]\s*(?:[A-Z][A-Z0-9_]+\b|\d)/, what: 'a feature offset along map y' },
 // camCompass()'s special case for the procedural map (world y = -game y)
 { re: /atan2\(\s*Math\.cos\([^)]*\)\s*,\s*-\s*Math\.sin/, what: 'the procedural map\'s compass special case' },
];
// Lines outside the procedural map that may match DOWNHILL_Y or MAP_AXES, and why (none today).
const DOWNHILL_EXCEPTIONS = [];

// Every .js file under src/, as a path relative to src/.
function sources(dir = SRC) {
 return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return sources(p);
  return e.name.endsWith('.js') ? [path.relative(SRC, p).split(path.sep).join('/')] : [];
 });
}

// The names a file imports from world/course.js.
function courseImports(src) {
 const names = [];
 for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][./]*(?:world\/)?course\.js['"]/g)) {
  names.push(...m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));
 }
 return names;
}

const FILES = sources().filter((f) => !PROCEDURAL.includes(f));
// A file's source without its comments (line structure kept), so prose about y doesn't count.
const code = (f) => fs.readFileSync(path.join(SRC, f), 'utf8')
 .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
 .replace(/(^|[^:'"])\/\/.*$/gm, '$1');

test('only the procedural map imports cx, the park constants and the map size from world/course.js', () => {
 const bad = [];
 for (const f of FILES) {
  const allowed = (IMPORT_EXCEPTIONS[f] || { names: [] }).names;
  for (const n of courseImports(code(f))) if (BANNED.includes(n) && !allowed.includes(n)) bad.push(f + ': ' + n);
 }
 assert.deepEqual(bad, []);
});

test('only world/ and the colour map index the height array', () => {
 const bad = FILES.filter((f) => !f.startsWith('world/') && /\bH\[/.test(code(f)));
 assert.deepEqual(bad, []);
});

test('no "+y is downhill" outside the procedural map', () => {
 const bad = [];
 for (const f of FILES) {
  const lines = code(f).split('\n');
  lines.forEach((line, i) => {
   const ok = DOWNHILL_EXCEPTIONS.some((e) => e.file === f && line.includes(e.has));
   for (const { re, what } of DOWNHILL_Y) if (!ok && re.test(line)) bad.push(f + ':' + (i + 1) + ' ' + what);
  });
 }
 assert.deepEqual(bad, []);
});

test('no axis of the map\'s old placement outside the procedural map (C2)', () => {
 const bad = [];
 for (const f of FILES) {
  const lines = code(f).split('\n');
  lines.forEach((line, i) => {
   const ok = DOWNHILL_EXCEPTIONS.some((e) => e.file === f && line.includes(e.has));
   for (const { re, what } of MAP_AXES) if (!ok && re.test(line)) bad.push(f + ':' + (i + 1) + ' ' + what);
  });
 }
 assert.deepEqual(bad, []);
});

test('the lint catches what it says', () => {
 assert.deepEqual(courseImports("import { FIN, cx as c } from '../world/course.js';"), ['FIN', 'cx']);
 const hits = (line) => DOWNHILL_Y.filter(({ re }) => re.test(line)).length;
 assert.equal(hits(' if (rider.y > FIN) {'), 1);
 assert.equal(hits(" Math.round(FIN - pose.y) + ' m to go'"), 1);
 assert.equal(hits(' if (r.y1 < cy || r.y0 > cy + DRAW_AHEAD_M) continue;'), 1);
 assert.equal(hits(' KICK.find((k) => y >= k && y < k + 5)'), 1);
 assert.equal(hits(' const oy = wy - camera.y;'), 0);
 assert.equal(hits(' rider.y += rider.vy * dt;'), 0);
 const axes = (line) => MAP_AXES.filter(({ re }) => re.test(line)).length;
 assert.equal(axes('  rider.heading = Math.PI / 2;'), 1);
 assert.equal(axes("const PLACE = Object.freeze({ y: 500, heading: Math.PI / 2 });"), 1);
 assert.equal(axes('  heading: 1.57, height: 0,'), 1);
 assert.equal(axes('  rider.vy = START_SPEED;'), 1);
 assert.equal(axes('  heading: START_HEADING, x: 0, dirX: 0, dirY: 1, renderW: 1,'), 1);
 assert.equal(axes(' if (rider.y < EDGE_M) {'), 1);
 assert.equal(axes(' if (rider.x > bounds.maxX - EDGE_M) {'), 1);
 assert.equal(axes('   n += pole(ctx, camera, terrain, k.x - KICKER_FLAG_D, k.y - RAMP_FLAG_BACK_M, h, F);'), 1);
 assert.equal(axes(' return ((Math.atan2(Math.cos(camera.heading), -Math.sin(camera.heading)) * 180 / Math.PI)'), 1);
 assert.equal(axes('  rider.heading = frame.downhill;'), 0);
 assert.equal(axes('  rider.vy = startVelocity.y;'), 0);
 assert.equal(axes('   n += pole(ctx, camera, terrain, k.x + P.x, k.y + P.y, h, BIG_KICKER_FLAG);'), 0);
});
