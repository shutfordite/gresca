// The terrain interface (src/terrain.js, B3): a layer stack sampled as one smooth surface, the gradient physics reads,
// the renderer's fast path, and the rule that nothing else indexes the height arrays.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const ROOT = path.join(import.meta.dirname, '..');
const TERRAIN_FILE = path.join(ROOT, 'src', 'world', 'terrain.js');
const TERRAIN_SRC = fs.readFileSync(TERRAIN_FILE, 'utf8');

// world/terrain.js on its own, imported straight into Node: no document, window, canvas or HANGA, no stubs.
async function loadTerrain() {
  return (await import(pathToFileURL(TERRAIN_FILE).href)).Terrain;
}

// Seeded random numbers for the test grids and sample points (Park-Miller).
function rng(seed = 1) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// A rough synthetic grid: nx × ny samples of random heights (m) cellM apart.
function roughGrid(T, nx = 12, ny = 9, cellM = 2) {
  const r = rng(7), data = new Float32Array(nx * ny);
  for (let i = 0; i < data.length; i++) data[i] = 100 + r() * 20;
  return { data, nx, ny, cellM, base: T.grid(data, nx, ny, cellM) };
}

// Central finite differences of height (m/m).
const fd = (h, x, y, e = 1e-4) => ({ gx: (h(x + e, y) - h(x - e, y)) / (2 * e), gy: (h(x, y + e) - h(x, y - e)) / (2 * e) });

describe('Terrain (src/world/terrain.js on its own)', async () => {
  const T = await loadTerrain();
  const { data, nx, ny, cellM, base } = roughGrid(T);
  const t = T.create({ base });

  it('loads in Node with no DOM or art globals, and names no browser or art API', () => {
    assert.deepEqual([...T.LAYERS], ['base', 'sculpt', 'features', 'detail']);
    for (const word of ['document', 'window', 'canvas', 'HANGA', 'getContext', 'Math.random'])
      assert.ok(!codeOnly(TERRAIN_SRC).includes(word), `terrain.js uses ${word}`);
  });

  it('reports its bounds, cell size and layers', () => {
    assert.deepEqual({ ...t.bounds }, { minX: 0, minY: 0, maxX: nx * cellM, maxY: ny * cellM });
    assert.equal(t.cellM, cellM);
    assert.deepEqual([...t.layers], ['base']);
    assert.throws(() => T.create({ base, rocks: {} }), /unknown layer rocks/);
    assert.throws(() => T.grid(data, nx + 1, ny), /expected/);
  });

  it('passes through every sample, and cellHeight is the raw sample', () => {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = data[j * nx + i];
      assert.ok(Math.abs(t.height(i * cellM, j * cellM) - v) < 1e-9, `height at sample ${i},${j}`);
      assert.equal(t.cellHeight(i * cellM + 0.7 * cellM, j * cellM + 0.2 * cellM), v);
    }
  });

  it('height and gradient are continuous across cell edges (C1)', () => {
    const e = 1e-7, r = rng(3);
    let worstH = 0, worstG = 0;
    for (let k = 0; k < 400; k++) {
      // a point on a vertical cell edge (x = i·cellM) and one on a horizontal edge, anywhere along it
      const i = 1 + Math.floor(r() * (nx - 2)), j = 1 + Math.floor(r() * (ny - 2));
      const pts = [[i * cellM, r() * (ny - 1) * cellM, e, 0], [r() * (nx - 1) * cellM, j * cellM, 0, e]];
      for (const [x, y, ex, ey] of pts) {
        worstH = Math.max(worstH, Math.abs(t.height(x - ex, y - ey) - t.height(x + ex, y + ey)));
        const a = t.gradient(x - ex, y - ey), b = t.gradient(x + ex, y + ey);
        worstG = Math.max(worstG, Math.abs(a.gx - b.gx), Math.abs(a.gy - b.gy));
      }
    }
    assert.ok(worstH < 1e-5, `height jumps ${worstH} m at a cell edge`);
    assert.ok(worstG < 1e-5, `gradient jumps ${worstG} m/m at a cell edge`);
  });

  it('a bilinear surface would fail that check (the test can see a kink)', () => {
    const x = 3 * cellM, y = 2.5 * cellM, e = 1e-7, h = (px, py) => base.heightFast(px, py);
    const left = (h(x - e, y) - h(x - 1e-3, y)) / (1e-3 - e), right = (h(x + 1e-3, y) - h(x + e, y)) / (1e-3 - e);
    assert.ok(Math.abs(left - right) > 1e-2, 'expected the bilinear slope to jump at the edge');
  });

  it('gradient is the derivative of height (finite differences)', () => {
    const r = rng(11), h = (x, y) => t.height(x, y);
    let worst = 0;
    for (let k = 0; k < 2000; k++) {
      const x = 0.01 + r() * ((nx - 1) * cellM - 0.02), y = 0.01 + r() * ((ny - 1) * cellM - 0.02);
      const g = t.gradient(x, y), f = fd(h, x, y);
      worst = Math.max(worst, Math.abs(g.gx - f.gx), Math.abs(g.gy - f.gy));
    }
    assert.ok(worst < 1e-5, `gradient differs from finite differences by ${worst} m/m`);
  });

  it('gradient writes into a given object and allocates none', () => {
    const out = { gx: 9, gy: 9 };
    assert.equal(t.gradient(5.3, 4.1, out), out);
    assert.deepEqual(out, { ...t.gradient(5.3, 4.1) });
  });

  it('normal and slopeDeg agree with the gradient', () => {
    const g = t.gradient(7.2, 3.9), n = t.normal(7.2, 3.9);
    assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-12);
    assert.ok(Math.abs(n.x / n.z + g.gx) < 1e-12 && Math.abs(n.y / n.z + g.gy) < 1e-12);
    assert.ok(Math.abs(t.slopeDeg(7.2, 3.9) - Math.atan(Math.hypot(g.gx, g.gy)) * 180 / Math.PI) < 1e-12);
    const flat = T.create({ base: T.grid(new Float32Array(16).fill(5), 4, 4, 1) });
    assert.equal(flat.slopeDeg(1.5, 1.5), 0);
    const nf = flat.normal(1.5, 1.5);
    assert.ok(nf.x === 0 && nf.y === 0 && nf.z === 1);
  });

  it('holds the edge value outside the grid, with no slope across the edge', () => {
    const maxX = (nx - 1) * cellM;
    assert.equal(t.height(-5, 4), t.height(0, 4));
    assert.equal(t.height(maxX + 3, 4), t.height(maxX, 4));
    assert.equal(t.gradient(-5, 4).gx, 0);
    assert.equal(t.gradient(maxX + 3, 4).gx, 0);
    assert.ok(Number.isFinite(t.height(NaN, 4)));
  });

  it('extra layers add to height, gradient and the fast path', () => {
    // a test-only "detail" layer: a gentle wave across x plus a tilt down +y, with its exact gradient
    const detail = {
      height: (x, y) => 0.3 * Math.sin(x / 1.7) - 0.05 * y,
      gradient(x, y, o) { o.gx += 0.3 / 1.7 * Math.cos(x / 1.7); o.gy += -0.05; return o; },
    };
    const sculpt = { height: () => 2, gradient: (x, y, o) => o, heightFast: () => 2.5 };
    const s = T.create({ base, sculpt, detail });
    assert.deepEqual([...s.layers], ['base', 'sculpt', 'detail']);
    const r = rng(5);
    for (let k = 0; k < 200; k++) {
      const x = 0.5 + r() * 18, y = 0.5 + r() * 14;
      assert.ok(Math.abs(s.height(x, y) - (t.height(x, y) + 2 + detail.height(x, y))) < 1e-9);
      const g = s.gradient(x, y), g0 = t.gradient(x, y);
      assert.ok(Math.abs(g.gx - (g0.gx + 0.3 / 1.7 * Math.cos(x / 1.7))) < 1e-9);
      assert.ok(Math.abs(g.gy - (g0.gy - 0.05)) < 1e-9);
      const f = fd((px, py) => s.height(px, py), x, y);
      assert.ok(Math.abs(g.gx - f.gx) < 1e-5 && Math.abs(g.gy - f.gy) < 1e-5);
      // the fast path uses a layer's own heightFast when it has one, else its height
      assert.ok(Math.abs(s.heightFast(x, y) - (base.heightFast(x, y) + 2.5 + detail.height(x, y))) < 1e-9);
      assert.equal(s.cellHeight(x, y), t.cellHeight(x, y), 'cellHeight is the raw base sample only');
    }
  });
});

describe('the game\'s terrain (through Gresca.world)', async () => {
  const g = await load();
  const W = g.world, D = g.debug, FIN = W.finishY;

  it('is the procedural map as one base layer', () => {
    assert.deepEqual([...W.layers], ['base']);
    assert.deepEqual({ ...W.size }, { x: 1000, y: 2450 });
  });

  it('height passes through the raw cells, kicker ramps included', () => {
    const r = rng(17);
    for (let k = 0; k < 500; k++) {
      const x = 2 + Math.floor(r() * 996), y = 2 + Math.floor(r() * 2446);
      assert.ok(Math.abs(W.height(x, y) - W.cellHeight(x, y)) < 1e-3, `at ${x},${y}`);
    }
    const k = W.kickers[2], c = Math.round(W.centre(k));
    assert.ok(W.cellHeight(c, k) - W.height(c, k + 9) > 2, 'the big kicker lip stands above the snow past it');
  });

  it('is smooth across cell edges near the piste, kickers included', () => {
    const e = 1e-6, r = rng(19);
    let worstH = 0, worstG = 0;
    for (let k = 0; k < 3000; k++) {
      const y0 = 60 + r() * (FIN - 60), x = Math.round(W.centre(y0) + (r() * 2 - 1) * 30), y = Math.round(y0);
      for (const [px, py, ex, ey] of [[x, y0, e, 0], [W.centre(y0), y, 0, e]]) {
        worstH = Math.max(worstH, Math.abs(W.height(px - ex, py - ey) - W.height(px + ex, py + ey)));
        const a = W.gradient(px - ex, py - ey), b = W.gradient(px + ex, py + ey);
        worstG = Math.max(worstG, Math.abs(a.gx - b.gx), Math.abs(a.gy - b.gy));
      }
    }
    assert.ok(worstH < 1e-3, `height jumps ${worstH} m`);
    assert.ok(worstG < 1e-3, `gradient jumps ${worstG} m/m`);
  });

  it('gradient matches finite differences of height, and slopeDeg matches the gradient', () => {
    const r = rng(23);
    let worst = 0;
    for (let k = 0; k < 2000; k++) {
      const y = 60 + r() * (FIN - 60), x = W.centre(y) + (r() * 2 - 1) * 60;
      const gr = W.gradient(x, y), f = fd(W.height, x, y, 1e-3);
      worst = Math.max(worst, Math.abs(gr.gx - f.gx), Math.abs(gr.gy - f.gy));
      assert.ok(Math.abs(W.slopeDeg(x, y) - Math.atan(Math.hypot(gr.gx, gr.gy)) * 180 / Math.PI) < 1e-9);
    }
    // float32 heights of about 2000 m differenced over 2 mm: allow for that rounding, not for a wrong derivative
    assert.ok(worst < 2e-3, `gradient differs from finite differences by ${worst} m/m`);
  });

  it('the renderer\'s fast path stays within a few cm of height on the piste', () => {
    // Sample the groomed corridor (within 18 m of the centreline) from the start to the finish, kickers included.
    const r = rng(29), d = [];
    for (let k = 0; k < 40000; k++) {
      const y = 60 + r() * (FIN - 60), x = W.centre(y) + (r() * 2 - 1) * 18;
      d.push(Math.abs(W.height(x, y) - D.heightFast(x, y)));
    }
    d.sort((a, b) => a - b);
    const mean = d.reduce((s, v) => s + v, 0) / d.length, p99 = d[Math.floor(d.length * 0.99)], max = d[d.length - 1];
    assert.ok(mean < 0.01, `mean difference ${mean.toFixed(4)} m`);
    assert.ok(p99 < 0.035, `99th percentile ${p99.toFixed(4)} m`);
    // The largest gap, found by sampling the corridor every 10 cm, is 0.122 m, at the lip of the big kicker at y 1250.
    assert.ok(max < 0.13, `largest difference ${max.toFixed(4)} m (the sharpest kicker lips)`);
  });
});

// ---- nothing outside the world code indexes the terrain arrays ----
// H (heights), M (groomed mask) and the grid size W0 × H0 belong to the files below. Everything else asks `terrain`.
// Each entry: the names that file may use, and why. Keep it short: every name listed must still be used there.
const OWNERS = new Map([
  ['src/world/course.js', { names: ['W0', 'H0'], why: 'declares the procedural map\'s grid size (cells across and down)' }],
  ['src/world/build.js', { names: ['H', 'M', 'W0', 'H0'], why: 'owns the height and groomed arrays, builds `terrain` from them and fills them' }],
  ['src/view/colour-map.js', { names: ['H', 'M', 'W0', 'H0'], why: 'paints the colour map from the built arrays (D2 removes the colour map)' }],
  ['src/view/view-state.js', { names: ['W0', 'H0'], why: 'sizes the colour map canvas, one pixel per map cell (D2 removes it)' }],
  ['src/sim/step.js', { names: ['W0'], why: 'row stride of the colour map col for ski tracks (B2b moves tracks out of the sim, D2 removes col)' }],
]);
// src/terrain.js may index its own grids, but it receives them as arguments and names none of these.

// Code with comments and the inside of string literals blanked out.
function codeOnly(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      out += c;
      for (i++; i < src.length && src[i] !== c; i++) { if (src[i] === '\\') i++; if (src[i] === '\n') out += '\n'; }
      out += c; i++; continue;
    }
    out += c; i++;
  }
  return out;
}
const USES = { H: /(?<![\w$.])H\s*\[/g, M: /(?<![\w$.])M\s*\[/g, W0: /(?<![\w$.])W0(?![\w$])/g, H0: /(?<![\w$.])H0(?![\w$])/g };
function terrainUses(src) {
  const code = codeOnly(src), found = [];
  for (const [name, re] of Object.entries(USES))
    for (const m of code.matchAll(re)) found.push({ name, line: code.slice(0, m.index).split('\n').length });
  return found;
}

describe('terrain arrays are read only through the terrain interface', () => {
  const srcFiles = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true }).filter((f) => f.endsWith('.js'))
    .map((f) => 'src/' + f.split(path.sep).join('/')).sort();

  it('the scanner finds direct access, and ignores comments, strings and other names', () => {
    const names = (s) => terrainUses(s).map((u) => u.name);
    assert.deepEqual(names('const g=H[(y|0)*W0+(x|0)],m=M [i];'), ['H', 'M', 'W0']);
    assert.deepEqual(names('if(x>H0-2)x=1'), ['H0']);
    assert.deepEqual(names("// H[i] W0\n/* M[i] */ const s='H[1] W0',o=a.H[2],HH=OH[1],W01=1,occ=Hh[0];"), []);
  });

  for (const f of srcFiles) {
    it(`${f} uses no terrain array or grid size it does not own`, () => {
      const allowed = new Set((OWNERS.get(f) || { names: [] }).names);
      const bad = terrainUses(fs.readFileSync(path.join(ROOT, f), 'utf8')).filter((u) => !allowed.has(u.name));
      assert.deepEqual(bad.map((u) => `line ${u.line}: ${u.name}`), [], 'use the terrain interface (src/terrain.js)');
    });
  }

  it('every owner entry has a reason and is still needed', () => {
    for (const [f, { names, why }] of OWNERS) {
      assert.ok(typeof why === 'string' && why.length > 20, `${f} needs a reason`);
      assert.ok(srcFiles.includes(f), `${f} does not exist`);
      const used = new Set(terrainUses(fs.readFileSync(path.join(ROOT, f), 'utf8')).map((u) => u.name));
      for (const n of names) assert.ok(used.has(n), `${f} no longer uses ${n}: remove it from OWNERS`);
    }
  });
});
