// @areas shared world view
// A real map in the game (C4b): El Tarter's baked files (maps/), loaded as main.js does for ?map=el-tarter, drawn in
// a window along the run (view/paint-window.js) and ridden start to finish by a centreline autopilot. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadMap } from '../src/world/map-loader.js';
import { paintWindow } from '../src/view/paint-window.js';
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
});

test('El Tarter loads into the game, shows its credits, and the autopilot rides Àliga to the finish', async () => {
 const g = await load({ world: WORLD });
 assert.equal(g.raw.world.map, 'el-tarter');
 assert.match(g.el('t').textContent, /Àliga[\s\S]*OpenStreetMap contributors \(ODbL\)/);
 g.start();
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
