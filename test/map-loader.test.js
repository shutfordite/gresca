// The map loader (C4a, world/map-loader.js): a validated terrain file and course file become the world the game uses.
// The pair is synthetic and built here through the map compiler: an inclined plane with a bump, and a curving piste.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileTerrain, compileCourse, createProjection } from '../tools/map-compiler/core.js';
import { loadMap, loadMapSteps, LOAD_PHASES, CORRIDOR_MARGIN_M } from '../src/world/map-loader.js';
import { TILE_BYTES, TILE_M, DEFAULT_MAX_TILES } from '../src/world/corridor-layer.js';
import { TREE_CLEAR_M } from '../src/world/map-trees.js';
import { selectParts, runCourse } from '../src/world/map-file/course-run.js';
import { checkCourse } from '../src/core/contracts.js';
import { createRider, createSession } from '../src/sim/state.js';
import { createInput } from '../src/input/input.js';
import { step } from '../src/sim/step.js';
import { SIM_DT } from '../src/core/config.js';

const CENTRE = Object.freeze({ lat: 42.58, lon: 1.65 });
const CONFIG = Object.freeze({ id: 'slope-map', name: 'Slope Map', centre: CENTRE, widthM: 1400, lengthM: 2600,
 cellM: 14 });
const PROJECTION = createProjection(CENTRE.lat, CENTRE.lon);
const SURFACE_TOL_M = 0.15; // m: the file's 0.1 m rounding (half of it) plus the bicubic's error on the bump

// The synthetic ground (m): a plane falling 0.28 m per m to the south and rising 0.05 m per m east, with a 3 m bump.
const pisteX = (y) => 180 * Math.sin(y / 330); // m east of the piste's centreline at north y
const BUMP = Object.freeze({ x: pisteX(-200), y: -200, sigma: 20, height: 3 });
const surface = (x, y) => 2300 + 0.28 * y + 0.05 * x +
 BUMP.height * Math.exp(-((x - BUMP.x) ** 2 + (y - BUMP.y) ** 2) / (2 * BUMP.sigma ** 2));

const SOURCES = [
 { role: 'elevation', name: 'Synthetic', url: 'https://example.invalid/', licence: 'test only',
  attribution: 'Synthetic elevation', retrieved: '2026-11-25', files: 1, sha256: '' },
 { role: 'pistes', name: 'Synthetic pistes', url: 'https://example.invalid/', licence: 'ODbL-1.0',
  attribution: '(c) OpenStreetMap contributors', retrieved: '2026-11-25', files: 1, sha256: '' },
];

// The piste from the north end (y 1100) to the south (y -1100), as lon/lat lines the compiler places.
function pisteLine() {
 const ll = {};
 const line = [];
 for (let y = 1100; y >= -1100; y -= 25) {
  PROJECTION.toLatLon(pisteX(y), y, ll);
  line.push([ll.lon, ll.lat]);
 }
 return line;
}

// {terrain, course}: fresh parsed objects every call, so a test may break them.
function makePair() {
 const dem = { heightAt: (lat, lon) => surface(...enuOf(lat, lon)), fixes: { voids: 0, spikes: 0 } };
 const piste = { id: 'run-1', osm: ['way/1'], name: 'Curve', difficulty: 'intermediate', grooming: 'classic',
  area: false, lines: [pisteLine()] };
 const terrain = compileTerrain({ config: CONFIG, dem, pistes: [piste], sources: SOURCES });
 const run = { osm: ['way/1'] };
 const length = runCourse(terrain, selectParts(terrain, run).parts).length;
 const course = compileCourse({
  terrain, run, finishS: Math.floor(length - 40), sun: { azimuthDeg: 200, elevationDeg: 20 }, treeSet: 'pine',
  kickers: [{ s: 600, d: -9, halfWidth: 3, depth: 6, big: false }],
  rails: [{ s0: 900, s1: 915, d: 9, h: 0.4, t: 'rail' }],
 });
 return { terrain: JSON.parse(JSON.stringify(terrain)), course: JSON.parse(JSON.stringify(course)), length };
}

function enuOf(lat, lon) {
 const p = { x: 0, y: 0 };
 PROJECTION.toEnu(lat, lon, p);
 return [p.x, p.y];
}

const PAIR = makePair();
const fresh = () => ({ terrain: structuredClone(PAIR.terrain), course: structuredClone(PAIR.course) });
const world = loadMap(PAIR.terrain, PAIR.course);

describe('loading a pair', () => {
 it('refuses a terrain file that does not validate, naming the file and field', () => {
  const { terrain, course } = fresh();
  terrain.heights.fnv1a32 = '00000000';
  assert.throws(() => loadMap(terrain, course), /the terrain file is not valid[\s\S]*slope-map\.terrain\.json/);
 });

 it('refuses a course file that does not validate against its terrain', () => {
  const { terrain, course } = fresh();
  course.finishS = course.startS - 1;
  assert.throws(() => loadMap(terrain, course), /the course file is not valid[\s\S]*slope-map\.course\.json finishS/);
 });

 it('accepts JSON text as well as parsed objects', () => {
  const { terrain, course } = fresh();
  const fromText = loadMap(JSON.stringify(terrain), JSON.stringify(course));
  assert.equal(fromText.course.length, world.course.length);
 });

 it('builds in chunks: nothing runs before next(), progress rises through the phases to 1', () => {
  const { terrain, course } = fresh();
  const steps = loadMapSteps(terrain, course);
  const seen = [];
  for (let s = steps.next(); !s.done; s = steps.next()) seen.push(s.value);
  assert.ok(seen.length >= 10, 'only ' + seen.length + ' chunks');
  assert.deepEqual([...new Set(seen.map((s) => s.phase))], [...LOAD_PHASES]);
  assert.ok(seen.every((s, i) => i === 0 || s.fraction >= seen[i - 1].fraction));
  assert.equal(seen[seen.length - 1].fraction, 1);
  const lazy = loadMapSteps(terrain, { broken: true });
  assert.doesNotThrow(() => lazy, 'a generator does no work until the first next()');
  assert.throws(() => lazy.next(), /course file is not valid/);
 });

 it('is deterministic: the same files give the same trees and heights', () => {
  const again = loadMap(PAIR.terrain, PAIR.course);
  assert.deepEqual(again.treeArr, world.treeArr);
  assert.equal(again.terrain.height(10, 20), world.terrain.height(10, 20));
 });
});

describe('the ground', () => {
 it('matches the analytic surface at grid nodes and between them', () => {
  const { bounds } = world.terrain;
  let worst = 0;
  for (let x = bounds.minX + 30; x < bounds.maxX - 30; x += 7.3) {
   for (let y = bounds.minY + 30; y < bounds.maxY - 30; y += 11.1) {
    worst = Math.max(worst, Math.abs(world.terrain.height(x, y) - surface(x, y)));
   }
  }
  assert.ok(worst < SURFACE_TOL_M, 'worst error ' + worst + ' m');
  const grid = PAIR.terrain.grid;
  const node = world.frame.toWorld(40 * grid.cellM, 90 * grid.cellM, { x: 0, y: 0 });
  assert.ok(Math.abs(world.terrain.height(node.x, node.y) - surface(node.x, node.y)) < 0.06);
 });

 it('is a layer stack: the coarse base and the corridor detail, with a gradient that matches the height', () => {
  assert.deepEqual([...world.terrain.layers], ['base', 'detail']);
  assert.equal(world.terrain.cellM, PAIR.terrain.grid.cellM);
  const p = world.course.point(1000, 0, {});
  const e = 0.01;
  const g = world.terrain.gradient(p.x, p.y, { gx: 0, gy: 0 });
  const gx = (world.terrain.height(p.x + e, p.y) - world.terrain.height(p.x - e, p.y)) / (2 * e);
  const gy = (world.terrain.height(p.x, p.y + e) - world.terrain.height(p.x, p.y - e)) / (2 * e);
  assert.ok(Math.abs(g.gx - gx) < 1e-6 && Math.abs(g.gy - gy) < 1e-6);
 });

 it('is groomed on the piste, eases off the edge, and is not groomed off it', () => {
  const p = world.course.point(1000, 0, {});
  const half = world.course.widthAt(1000) / 2;
  const edge = world.course.point(1000, half + 3, {});
  const off = world.course.point(1000, half + 40, {});
  assert.equal(world.terrain.groomed(p.x, p.y), 1);
  const easing = world.terrain.groomed(edge.x, edge.y);
  assert.ok(easing > 0 && easing < 1, 'easing ' + easing);
  assert.equal(world.terrain.groomed(off.x, off.y), 0);
 });
});

describe('the corridor detail', () => {
 it('makes no tile while loading: tiles are built on demand', () => {
  const loaded = loadMap(PAIR.terrain, PAIR.course);
  assert.equal(loaded.corridor.stats().built, 0);
  assert.ok(loaded.corridor.stats().members > 0);
 });

 const WAVE_M = 0.5; // m, a test refinement: a ripple the base does not have
 const ripple = (x, y) => WAVE_M * Math.sin(x / 9) * Math.cos(y / 7);
 const rippled = loadMap(PAIR.terrain, PAIR.course, { refiners: [ripple] });
 const { terrain, course, corridor } = rippled;

 it('applies inside the corridor and not outside it', () => {
  const half = course.widthAt(1000) / 2;
  const inside = course.point(1000, half + CORRIDOR_MARGIN_M - 40, {});
  const outside = course.point(1000, half + CORRIDOR_MARGIN_M + TILE_M * 2, {});
  assert.equal(corridor.contains(inside.x, inside.y), true);
  assert.equal(corridor.contains(outside.x, outside.y), false);
  const builtBefore = corridor.stats().built;
  assert.equal(terrain.height(outside.x, outside.y), world.terrain.height(outside.x, outside.y));
  assert.equal(corridor.stats().built, builtBefore, 'a query outside the corridor must not build a tile');
  const gain = terrain.height(inside.x, inside.y) - world.terrain.height(inside.x, inside.y);
  assert.ok(Math.abs(gain - ripple(inside.x, inside.y)) < 0.05, 'the 2 m tile follows the refinement: ' + gain);
  assert.ok(corridor.stats().built > builtBefore);
 });

 it('covers a small part of the map, not all of it', () => {
  const { nx, ny, cellM } = PAIR.terrain.grid;
  const mapTiles = Math.ceil(nx * cellM / TILE_M) * Math.ceil(ny * cellM / TILE_M);
  assert.ok(corridor.stats().members < mapTiles * 0.6, corridor.stats().members + ' of ' + mapTiles + ' tiles');
 });

 it('is continuous across tile edges, in height and gradient', () => {
  const p = course.point(1000, 0, {});
  const at = world.frame.toGrid(p.x, p.y, { u: 0, v: 0 });
  const edgeU = Math.round(at.u / TILE_M) * TILE_M;
  const eps = 1e-6;
  const left = world.frame.toWorld(edgeU - eps, at.v, { x: 0, y: 0 });
  const right = world.frame.toWorld(edgeU + eps, at.v, { x: 0, y: 0 });
  assert.ok(Math.abs(terrain.height(left.x, left.y) - terrain.height(right.x, right.y)) < 1e-4);
  const gl = terrain.gradient(left.x, left.y, { gx: 0, gy: 0 });
  const gr = terrain.gradient(right.x, right.y, { gx: 0, gy: 0 });
  assert.ok(Math.abs(gl.gx - gr.gx) < 1e-4 && Math.abs(gl.gy - gr.gy) < 1e-4);
 });

 it('keeps the tile cache inside its budget riding s from the start to the finish', () => {
  const small = 24; // tiles: far fewer than the corridor holds, to force the LRU to drop
  for (const maxTiles of [small, DEFAULT_MAX_TILES]) {
   const w = loadMap(PAIR.terrain, PAIR.course, { maxTiles });
   const c = w.course;
   const out = { x: 0, y: 0 };
   let peak = 0;
   for (let s = c.startS; s <= c.finishS; s += 1.5) {
    c.point(s, 0, out);
    w.terrain.height(out.x, out.y);
    c.point(s, 12, out);
    w.terrain.height(out.x, out.y);
    peak = Math.max(peak, w.corridor.stats().cached);
   }
   const stats = w.corridor.stats();
   assert.ok(peak <= maxTiles, 'cached ' + peak + ' over ' + maxTiles);
   assert.ok(stats.bytes <= maxTiles * TILE_BYTES);
   if (maxTiles === small) assert.ok(stats.evicted > 0, 'the small cache should have dropped tiles');
   else assert.equal(stats.evicted, 0);
  }
  assert.ok(DEFAULT_MAX_TILES * TILE_BYTES < 2.1e6, 'the default cache is about 2 MB');
 });
});

describe('the course and the park', () => {
 it('has the run\'s length and the file\'s start and finish, and meets the Course contract', () => {
  const { course } = world;
  assert.deepEqual(checkCourse(course), []);
  assert.ok(Math.abs(course.length - PAIR.length) < 1e-6);
  assert.ok(course.length > 2200 && course.length < 2600, 'length ' + course.length);
  assert.equal(course.startS, PAIR.course.startS);
  assert.equal(course.finishS, PAIR.course.finishS);
  assert.equal(course.widthAt(500), PAIR.course.widths[0][1]);
  const start = course.point(course.startS, 0, {});
  assert.ok(Math.abs(start.x - pisteX(1100)) < 2 && Math.abs(start.y - 1100) < 2);
 });

 it('turns: it runs south-east, then back south-west', () => {
  const eastward = [];
  const where = { s: 0, d: 0, tx: 0, ty: 0 };
  for (let s = 100; s < world.course.finishS; s += 50) {
   const p = world.course.point(s, 0, {});
   eastward.push(world.course.project(p.x, p.y, where).tx);
  }
  assert.ok(Math.max(...eastward) > 0.3 && Math.min(...eastward) < -0.3, 'east then back west');
 });

 it('carries the park through, with rails finished into world geometry', () => {
  const { course } = world;
  assert.equal(course.kickers.length, 1);
  assert.equal(course.kickers[0].s, 600);
  const rail = course.rails[0];
  assert.ok(Math.abs(rail.len - 15) < 0.5 && Math.abs(Math.hypot(rail.dx, rail.dy) - 1) < 1e-9);
 });
});

describe('what the map brings with it', () => {
 it('passes the sun, the horizon, the tree set and the credits through', () => {
  assert.deepEqual(world.sky.sun, { azimuthDeg: 200, elevationDeg: 20 });
  assert.equal(world.sky.horizon.near.length, 360);
  assert.equal(world.sky.treeSet, 'pine');
  assert.ok(world.credits.includes('(c) OpenStreetMap contributors'));
  assert.equal(world.licence, 'ODbL-1.0');
  assert.equal(world.id, 'slope-map');
 });

 it('has trees off the piste inside the corridor, and none on it', () => {
  assert.ok(world.treeArr.length > 200, world.treeArr.length + ' trees');
  const where = { s: 0, d: 0 };
  for (const t of world.treeArr) {
   world.course.project(t.x, t.y, where);
   const off = Math.abs(where.d) - world.course.widthAt(where.s) / 2;
   assert.ok(off >= TREE_CLEAR_M && off <= CORRIDOR_MARGIN_M, 'a tree ' + off + ' m off the piste edge');
  }
  const near = new Array(world.trees.maxNear).fill(null);
  const t = world.treeArr[0];
  assert.ok(world.trees.near(t.x, t.y, near) >= 1 && near.includes(t));
 });
});

describe('riding it', () => {
 it('the centreline autopilot reaches the finish on the pure sim step, with no crash', () => {
  const rider = createRider();
  const session = createSession();
  const input = createInput();
  const state = { rider, session, spray: { particles: [] }, gradient: { gx: 0, gy: 0 },
   where: { s: 0, d: 0, tx: 0, ty: 1 }, near: new Array(world.trees.maxNear).fill(null) };
  const c = world.course;
  c.point(c.startS, 0, rider);
  const start = c.project(rider.x, rider.y, {});
  rider.heading = Math.atan2(start.ty, start.tx);
  rider.vx = Math.cos(rider.heading) * 2;
  rider.vy = Math.sin(rider.heading) * 2;
  session.phase = 'run';
  const RIDE_MAX_S = 240;
  const STEER_GAIN = 0.03; // rad per m off the centreline
  const STEER_MAX = 0.25;  // rad
  const p = { s: 0, d: 0, tx: 0, ty: 0 };
  let finished = false;
  for (let t = 0; t < RIDE_MAX_S && !finished; t += SIM_DT) {
   c.project(rider.x, rider.y, p);
   const correction = -Math.max(-STEER_MAX, Math.min(STEER_MAX, p.d * STEER_GAIN));
   rider.heading = Math.atan2(p.ty, p.tx) + correction;
   step(state, input, world, SIM_DT);
   finished = session.phase === 'done';
  }
  assert.ok(finished, 'did not finish: s ' + c.project(rider.x, rider.y, p).s + ' of ' + c.finishS);
  assert.equal(session.crashes, 0);
  assert.ok(session.time > 20 && session.time < RIDE_MAX_S, 'finished in ' + session.time + ' s');
 });
});
