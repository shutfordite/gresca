// @areas shared world view
// A real map in the game (C4b): El Tarter's baked files (maps/), loaded as main.js does for ?map=el-tarter, drawn in
// a window along the run (view/paint-window.js) and ridden start to finish by a centreline autopilot. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadMap } from '../src/world/map-loader.js';
import { paintWindow } from '../src/view/paint-window.js';
import { pistePoles, DIFFICULTY_TONE } from '../src/view/piste-poles.js';
import { buildParkMesh } from '../src/view/gl/park-mesh.js';
import { createHangaLook } from '../src/view/look/hanga.js';
import { createRequire } from 'node:module';
import { load } from './harness.js';

const read = (kind) => fs.readFileSync(new URL('../maps/el-tarter.' + kind + '.json', import.meta.url), 'utf8');
const TERRAIN = read('terrain');
const COURSE = read('course');
const WINDOW_W = 1000; // m, the colour map's size (world/course.js W0, H0)
const WINDOW_L = 2450;
const WORLD = loadMap(TERRAIN, COURSE); // about 5 s: shared by both tests (the game only reads it)

test('the paint window holds the run, its +v from start to finish, with the terrain\'s heights', () => {
 const world = WORLD;
 const area = paintWindow(world, WINDOW_W, WINDOW_L);
 assert.equal(area.fits, true);
 const c = world.course;
 const g = { u: 0, v: 0 };
 for (let s = c.startS; s <= c.finishS; s += 50) {
  const p = c.point(s, 0, {});
  area.frame.toGrid(p.x, p.y, g);
  assert.ok(g.u > 0 && g.u < WINDOW_W && g.v > 0 && g.v < WINDOW_L, 's ' + s + ' is outside the window');
 }
 const top = c.point(c.startS, 0, {});
 const bottom = c.point(c.finishS, 0, {});
 const along = area.frame.vecToGrid(bottom.x - top.x, bottom.y - top.y, { u: 0, v: 0 });
 assert.ok(Math.abs(along.u) < 1e-6 && along.v > 0, 'start to finish is grid +v');
 const w = area.frame.toWorld(400.5, 1200.5, { x: 0, y: 0 });
 assert.equal(area.heights[1200 * WINDOW_W + 400], Math.fround(world.terrain.height(w.x, w.y)));
 const centre = c.point((c.startS + c.finishS) / 2, 0, {});
 area.frame.toGrid(centre.x, centre.y, g);
 assert.equal(area.groomed[Math.floor(g.v) * WINDOW_W + Math.floor(g.u)], 255, 'the piste is groomed');
 const off = c.point((c.startS + c.finishS) / 2, c.widthAt((c.startS + c.finishS) / 2) / 2 + 10, {});
 area.frame.toGrid(off.x, off.y, g);
 assert.equal(area.groomed[Math.floor(g.v) * WINDOW_W + Math.floor(g.u)], 0, 'past the eased edge is not');
});

test('Àliga, a black run, is marked by black poles on both edges, orange-topped on the right going down', () => {
 assert.equal(WORLD.piste.difficulty, 'advanced');
 const poles = pistePoles(WORLD.course, WORLD.piste.difficulty);
 const c = WORLD.course;
 assert.ok(poles.length > 2 * (c.finishS - c.startS) / 30, poles.length + ' poles');
 assert.ok(poles.every((p) => p.tone === 'black'));
 for (const p of poles.slice(0, 40)) {
  const at = c.project(p.x, p.y, {});
  assert.ok(Math.abs(Math.abs(at.d) - (c.widthAt(at.s) / 2 + 1)) < 0.5, 'just outside the edge');
  // right going down: the tangent turned clockwise (core/contracts.js: d > 0 is counter-clockwise of it)
  assert.equal(p.right, at.d < 0);
 }
 assert.equal(poles.filter((p) => p.right).length, poles.length / 2);
 assert.deepEqual(pistePoles(c, undefined), [], 'no poles where the difficulty is unknown (the procedural maps)');
 assert.equal(DIFFICULTY_TONE.easy, 'blue');
 assert.equal(DIFFICULTY_TONE.intermediate, 'red');
 assert.equal(DIFFICULTY_TONE.novice, 'green');
 const require = createRequire(import.meta.url);
 const look = createHangaLook(require('../art/gresca-hanga-spec.js'), require('../art/gresca-rider-anim.js'));
 const mesh = buildParkMesh(c, WORLD.terrain, look, WORLD.frame, poles);
 assert.equal(mesh.poles, poles.length, 'the GPU park mesh has a feature per pole');
});

test('El Tarter loads into the game, shows its credits, and the autopilot rides Àliga to the finish', async () => {
 const g = await load({ world: WORLD });
 assert.equal(g.raw.world.map, 'el-tarter');
 assert.match(g.el('t').textContent, /^Ride Àliga from the top to the finish\./);
 assert.doesNotMatch(g.el('t').textContent, /OpenStreetMap/, 'the credits show once, in the map line');
 assert.match(g.el('map-line').textContent, /OpenStreetMap contributors \(ODbL\)/);
 g.start();
 g.frames(1);
 assert.ok(g.debug.polesDrawn() > 4, 'edge poles are drawn ahead (CPU renderer)');
 const c = g.raw.world.course;
 const dt = 1 / 120;
 let s = g.raw.state();
 let n = 0;
 while (s.phase === 'run' && n < 120 * 300) {
  const p = c.project(s.x, s.y);
  const aim = c.point(Math.min(c.finishS, p.s + 25), 0);
  let turn = Math.atan2(aim.y - s.y, aim.x - s.x) - s.heading;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  const air = s.z > 0.05;
  g.raw.input({ left: !air && turn > 0.03 ? 1 : 0, right: !air && turn < -0.03 ? 1 : 0, brake: s.speed > 22 ? 1 : 0 });
  g.raw.step(dt);
  s = g.raw.state();
  n++;
 }
 assert.equal(s.phase, 'done', 'the run finishes (s ' + Math.round(c.project(s.x, s.y).s) + ' of ' + c.finishS + ')');
 assert.equal(s.crashes, 0);
});
