// @areas world
// H1: loose snow on the terrain (world/snow.js, terrain.powder): none on the groomed piste, light powder off it, deep
// patches, deeper in hollows and thinner on ridges, and the same snow on a rotated map.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { POWDER, powderDepth, snowKind } from '../src/world/snow.js';

const GRID = 120; // samples across and down the map for the survey

// Every survey point of a façade's world: {a, b (m on the map's grid), x, y (world m), depth (m)}.
function survey(g) {
 const w = g.raw.world;
 const b = w.bounds;
 const out = [];
 for (let i = 0; i < GRID; i++) {
  for (let j = 0; j < GRID; j++) {
   const a = b.width * (i + 0.5) / GRID;
   const v = b.length * (j + 0.5) / GRID;
   const x = b.x0 + a * b.ax + v * b.bx;
   const y = b.y0 + a * b.ay + v * b.by;
   out.push({ a, b: v, x, y, depth: w.powder(x, y), groomed: w.groomed(x, y) });
  }
 }
 return out;
}

const share = (pts, kind) => pts.filter((p) => snowKind(p.depth) === kind).length / pts.length;

describe('H1 powder depth', () => {
 for (const map of ['test', 'play']) {
  it(`${map}: no loose snow on the groomed piste, light and deep powder off it`, async () => {
   const pts = survey(await load({ map }));
   for (const p of pts) {
    if (p.groomed === 255) assert.equal(p.depth, 0, `groomed snow at ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`);
    assert.ok(p.depth >= 0 && p.depth <= POWDER.MAX_M, `depth ${p.depth} m`);
   }
   assert.ok(share(pts, 'light') > 0.3, `light powder covers ${share(pts, 'light').toFixed(2)}`);
   assert.ok(share(pts, 'deep') > 0.1, `deep powder covers ${share(pts, 'deep').toFixed(2)}`);
  });
 }

 it('the same snow at the same place on the map grid, whatever the rotation', async () => {
  const ref = survey(await load({ rotationDeg: 0 }));
  const turned = survey(await load({ rotationDeg: 137 }));
  let most = 0;
  for (let k = 0; k < ref.length; k++) most = Math.max(most, Math.abs(ref[k].depth - turned[k].depth));
  assert.ok(most < 0.01, `differs by up to ${most.toFixed(4)} m`);
 });

 it('hollows hold more snow than ridges, steep faces shed it, grooming packs it', () => {
  const bounds = { x0: 0, y0: 0, ax: 1, ay: 0, bx: 0, by: 1 };
  const flat = () => 0;
  const none = (x, y, out) => {
   out.gx = 0;
   out.gy = 0;
   return out;
  };
  const bowl = (x, y) => (x * x + y * y) / 200; // a hollow at the origin
  const dome = (x, y) => -bowl(x, y);
  const at = (h, gr = none, groomed = flat) => powderDepth(h, gr, groomed, bounds)(0, 0);
  assert.ok(at(bowl) > at(flat) + 0.1, `hollow ${at(bowl).toFixed(2)} m, flat ${at(flat).toFixed(2)} m`);
  assert.ok(at(dome) < at(flat) - 0.05, `ridge ${at(dome).toFixed(2)} m`);
  const cliff = (x, y, out) => {
   out.gx = 2;
   out.gy = 0;
   return out;
  };
  assert.equal(at(flat, cliff), POWDER.MIN_M, "a 63 degree face holds only the thinnest snow");
  assert.equal(at(flat, none, () => 1), 0, 'groomed');
  assert.ok(Math.abs(at(flat, none, () => 0.5) - at(flat) / 2) < 1e-12, 'half groomed, half the depth');
 });

 it('snowKind names the depth bands', () => {
  assert.equal(snowKind(0), 'groomed');
  assert.equal(snowKind(0.1), 'light');
  assert.equal(snowKind(0.3), 'mid');
  assert.equal(snowKind(POWDER.DEEP_FROM), 'deep');
 });
});
