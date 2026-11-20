// The test and debug façade, window.Gresca. Tests read and drive the game only through it, so the game's state can
// move into objects or modules without touching them. This file checks that rule and the façade itself.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

// The game's modules hold no top-level game state (ADR 0002): every game's state lives in the objects its
// createGame(env) call made, and the only way in is the façade that call returned. So the rules are:
// 1. A g.run('...') string evaluates in a scope with only the art modules and this game's storage stub in it. It may
//    name only these roots (and names it binds itself, such as an arrow function's parameter): no game state.
// 2. A test file imports nothing from src/ except the pure layers (core/, world/, sim/), which get direct unit tests.
//    Only the harness imports the game's wiring (src/app.js); nothing imports main.js, view/, ui/, input/ or debug.js.
const RUN_ROOTS = new Set(['HANGA', 'RiderAnim', 'localStorage', 'Math', 'globalThis']);
const PURE = /^src\/(core|world|sim)\//;
const HARNESS_ONLY = new Set(['src/app.js']);

// ---- a tiny scanner for JavaScript source: enough for this game script and the tests, no parser package ----

// Calls fn(i, 'code') for each index of `src` that is code, and fn(i, 'quote') at the opening and closing quote of
// each string or template literal; comments and the inside of literals are skipped. (No regex literals: the game
// script and the run() strings have none.)
function codeChars(src, fn) {
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      fn(i, 'quote');
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      fn(i, 'quote');
      i++;
      continue;
    }
    fn(i, 'code');
    i++;
  }
}

// Every .run( call in a test file (g.run, goofy.run, ...): the literal argument with ${...} parts blanked out (they
// are Node code), or null when the argument is not a string literal.
function runArgs(src) {
  const out = [];
  const re = /\.run\(\s*/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    const q = src[i];
    const line = src.slice(0, m.index).split('\n').length;
    if (q !== '"' && q !== "'" && q !== '`') { out.push({ line, code: null }); continue; }
    let code = '';
    for (i++; i < src.length && src[i] !== q; i++) {
      if (src[i] === '\\') { code += src[i + 1]; i++; continue; }
      if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
        let d = 1;
        for (i += 2; i < src.length && d; i++) { if (src[i] === '{') d++; else if (src[i] === '}') d--; }
        i--;
        code += ' 0 ';
        continue;
      }
      code += src[i];
    }
    out.push({ line, code });
  }
  return out;
}

// Root identifiers used by a code string: not property names after a dot, not inside its own string literals.
function rootIdentifiers(code) {
  const ids = new Set();
  let stripped = '';
  codeChars(code, (j, kind) => { stripped += kind === 'quote' ? ' ' : code[j]; });
  for (const m of stripped.matchAll(/(^|[^\w$.])\s*([A-Za-z_$][\w$]*)/g)) ids.add(m[2]);
  return ids;
}

const ROOT = path.join(import.meta.dirname, '..');
const TEST_DIR = import.meta.dirname;
// This file is left out: it holds planted bad run() strings and imports on purpose, and never runs code strings.
const testFiles = fs.readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.js') && f !== path.basename(import.meta.filename));

// Names a code string binds itself: arrow function parameters (s=>..., (a,b)=>...) and declarations.
function boundNames(code) {
  const out = new Set();
  for (const m of code.matchAll(/\(([\w$\s,]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    for (const n of (m[1] || m[2] || m[3] || '').split(',')) if (n.trim()) out.add(n.trim());
  }
  return out;
}

const KEYWORDS = new Set(['typeof', 'void', 'new', 'true', 'false', 'null', 'undefined', 'return', 'const', 'let', 'var']);

// Problems with the run() strings of a test file: each may name only RUN_ROOTS and what it binds itself.
function lint(src) {
  const bad = [];
  for (const { line, code } of runArgs(src)) {
    if (code === null) { bad.push(`line ${line}: run() with a non-literal argument (cannot be checked)`); continue; }
    const own = boundNames(code);
    for (const id of rootIdentifiers(code)) {
      if (!RUN_ROOTS.has(id) && !own.has(id) && !KEYWORDS.has(id)) bad.push(`line ${line}: run('${code.trim()}') names \`${id}\`, which is not an art module or storage`);
    }
  }
  return bad;
}

// The module specifiers a file imports or requires (static import, dynamic import(), require()).
function specifiers(src) {
  return [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

// Problems with what a test file (at test/<name>) imports from src/: see rule 2 above.
function importLint(name, src) {
  const bad = [];
  for (const spec of specifiers(src)) {
    if (!spec.startsWith('.')) continue;
    const target = path.posix.normalize(path.posix.join('test', spec));
    if (!target.startsWith('src/')) continue;
    if (name === 'harness.js' && HARNESS_ONLY.has(target)) continue;
    if (!PURE.test(target)) bad.push(`imports ${spec}: tests import only the pure layers (core/, world/, sim/)`);
  }
  // A src/ path built with path.join(ROOT, 'src', ...) (for import(pathToFileURL(...))) follows the same rule.
  if (name !== 'harness.js') {
    for (const m of src.matchAll(/path\.join\(\s*ROOT,\s*'src',\s*((?:'[\w.-]+',?\s*)+)\)/g)) {
      const target = 'src/' + m[1].split(',').map((p) => p.trim().replace(/'/g, '')).filter(Boolean).join('/');
      if (!PURE.test(target)) bad.push(`imports ${target}: tests import only the pure layers (core/, world/, sim/)`);
    }
  }
  return bad;
}

describe('tests use the façade, not game state', () => {
  it('catches a run() string that reaches for anything but the art modules and storage', () => {
    for (const planted of ["g.run('jz')", 'g.run(`x=${1};crash=0`)', "g.run('HANGA.fogAmount(1,FAR)')", 'g.run(code)',
      "g.run(\"state='done'\")", "goofy.run('anim.pose')", "g.run('Math.hypot(vx,vy)')", "g.run('Gresca.state().x')",
      "g.run('rider.x')", "g.run('createGame({})')", "g.run('window.Gresca')", "g.run('document.title')"])
      assert.ok(lint(planted).length > 0, `lint missed ${planted}`);
    assert.deepEqual(lint("g.run('HANGA.camera.slopeFollow.tilt=1');g.run(\"localStorage.getItem('gresca-rig')\")"), []);
    assert.deepEqual(lint("g.run(`HANGA.fogAmount(${far},2)`);g.run('HANGA.sky.stops.map(s=>[s[0],HANGA.colour(s[1])])')"), []);
    assert.deepEqual(lint("g.run('globalThis.__m=Math.random;Math.random=()=>{globalThis.__n++;return globalThis.__m()}')"), []);
  });

  it('catches a test that imports the game\'s modules other than the pure layers', () => {
    for (const planted of ["import { createGame } from '../src/app.js';", "await import('../src/view/draw.js')",
      "const d = require('../src/debug.js');", "import '../src/main.js';", "import { x } from '../src/ui/hud.js';"])
      assert.ok(importLint('x.test.js', planted).length > 0, `import lint missed ${planted}`);
    assert.deepEqual(importLint('x.test.js', "import { Terrain } from '../src/world/terrain.js';\nimport fs from 'node:fs';" +
      "\nimport { rnd } from '../src/core/rng.js';\nimport { load } from './harness.js';"), []);
    assert.deepEqual(importLint('harness.js', "const APP = '../src/app.js'; import('../src/app.js');"), []);
    assert.ok(importLint('harness.js', "import('../src/view/draw.js')").length > 0);
  });

  for (const f of testFiles) {
    it(`${f} reads and writes the game only through Gresca`, () => {
      const src = fs.readFileSync(path.join(TEST_DIR, f), 'utf8');
      assert.deepEqual(lint(src), []);
      assert.deepEqual(importLint(f, src), []);
    });
  }

  it('the harness imports only the game\'s entry and hands tests nothing but the façade', async () => {
    const src = fs.readFileSync(path.join(TEST_DIR, 'harness.js'), 'utf8');
    assert.deepEqual(importLint('harness.js', src), []);
    assert.ok(!/runInContext|vm\./.test(src), 'the harness runs code in a vm context');
    assert.ok(/path\.join\(ROOT, 'src', 'app\.js'\)/.test(src), 'the harness loads src/app.js');
    const g = await load();
    // the run() scope holds the art modules and storage, and nothing of the game
    for (const name of ['Gresca', 'createGame', 'rider', 'session', 'camera', 'view', 'world', 'input', 'env', 'game'])
      assert.equal(g.run(`typeof ${name}`), 'undefined', `${name} is visible to run()`);
    assert.equal(g.run('typeof HANGA.colour'), 'function');
    assert.equal(g.run('typeof RiderAnim.create'), 'function');
    assert.equal(globalThis.Gresca, undefined, 'the game put itself on the Node global');
    assert.ok(!('ctx' in g), 'the harness exposes a game context');
  });
});

describe('Gresca façade', async () => {
  const g = await load();
  const G = g.game;

  it('is frozen, and createGame() returns it rather than putting it on a global', () => {
    assert.ok(G && Object.isFrozen(G) && Object.isFrozen(G.world) && Object.isFrozen(G.debug));
    assert.equal(globalThis.Gresca, undefined);
  });

  it('set(state()) changes nothing, riding or grinding', () => {
    const same = () => {
      const before = JSON.stringify(G.state());
      G.set(G.state());
      assert.equal(JSON.stringify(G.state()), before);
    };
    G.place({ vy: 12 });
    g.frames(10);
    G.sim(0.5);
    same();
    const r = G.world.rails[0];
    G.place({ x: r.x0 + r.dx * 0.3, y: r.y0 + r.dy * 0.3, vx: r.dx * 12, vy: r.dy * 12, heading: Math.atan2(r.dy, r.dx) });
    G.sim(0.1);
    assert.ok(G.state().grinding);
    assert.equal(G.state().grind.rail, 0);
    same();
    // and the simulation carries on exactly as if nothing had been written
    const a = G.state();
    G.set(a);
    G.sim(0.2);
    const once = JSON.stringify(G.state());
    G.place({ x: r.x0 + r.dx * 0.3, y: r.y0 + r.dy * 0.3, vx: r.dx * 12, vy: r.dy * 12, heading: Math.atan2(r.dy, r.dx) });
    G.sim(0.1);
    G.sim(0.2);
    const s1 = JSON.parse(once), s2 = G.state();
    for (const k of ['x', 'y', 'vx', 'vy', 'heading', 'z', 'grinding']) assert.equal(s2[k], s1[k], k);
  });

  it('place then state() reports what was placed', () => {
    const o = { x: 480.5, y: 612.25, vx: 1.5, vy: 9.75, heading: 1.2, z: 0.4, vz: 2 };
    G.set({ crashTimer: 1, crashes: 3, input: { left: 1, right: 1, brake: 1, jump: 1 } });
    G.place(o);
    const s = G.state();
    for (const k in o) assert.equal(s[k], o[k], k);
    assert.equal(s.phase, 'run');
    assert.equal(s.crashTimer, 0);
    assert.equal(s.crashed, false);
    assert.equal(s.crashes, 0);
    assert.deepEqual({ ...s.input }, { left: 0, right: 0, brake: 0, jump: 0 });
    assert.equal(s.speed, Math.hypot(1.5, 9.75));
    G.place({ y: 700 });
    assert.equal(G.state().x, G.world.centre(700));
    assert.equal(G.state().heading, Math.PI / 2);
  });

  it('state() and the world helpers return copies', () => {
    G.place({ vy: 5 });
    const s = G.state();
    s.x = -1; s.camera.heading = 99; s.input.left = 1; s.popup.text = 'x';
    const t = G.state();
    assert.notEqual(t.x, -1);
    assert.notEqual(t.camera.heading, 99);
    assert.equal(t.input.left, 0);
    assert.notEqual(t.popup.text, 'x');
    const k = G.world.kickers, r = G.world.rails, tr = G.world.trees;
    k[0] = -5; r[0].x0 = -5; tr[0].x = -5;
    assert.notEqual(G.world.kickers[0], -5);
    assert.notEqual(G.world.rails[0].x0, -5);
    assert.notEqual(G.world.trees[0].x, -5);
  });

  it('set() writes by the state() names and refuses unknown ones', () => {
    G.place({ vy: 5 });
    G.set({ x: 510, vz: 3, score: 7, popup: { text: 'hi' }, camera: { heading: 2 }, input: { brake: true } });
    const s = G.state();
    assert.equal(s.x, 510);
    assert.equal(s.vz, 3);
    assert.equal(s.score, 7);
    assert.equal(s.popup.text, 'hi');
    assert.equal(s.camera.heading, 2);
    assert.equal(s.input.brake, 1);
    G.set({ speed: 99, crashed: true, grinding: true, particles: 5 }); // read only: ignored
    assert.equal(G.state().crashed, false);
    assert.throws(() => G.set({ jz: 1 }), /unknown field jz/);
    assert.throws(() => G.set({ camera: { camA: 1 } }), /unknown field camera.camA/);
    assert.throws(() => G.place({ a: 1 }), /unknown field a/);
  });
});
