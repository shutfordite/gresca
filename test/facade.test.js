'use strict';
// The test and debug façade, window.Gresca. Tests read and drive the game only through it, so the game's state can
// move into objects or modules without touching them. This file checks that rule and the façade itself.
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, pageScripts } = require('./harness');

// Names that may appear in a g.run('...') string even though the game script (src/) declares them at top level.
// Each entry needs a one-line reason. Keep it empty: extend the façade instead.
const ALLOW = new Map([
]);
// Roots that a run() string may always use: the art modules (their own scripts) and the façade.
const ROOTS = new Set(['HANGA', 'RiderAnim', 'Gresca']);

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

// Top-level const/let/var/function names of a classic script.
function topLevelNames(src) {
  const names = new Set();
  let depth = 0, decl = false, want = false, lastSig = '';
  const isId = (ch) => /[\w$]/.test(ch);
  let i = 0;
  const marks = [];
  codeChars(src, (j, kind) => marks.push([j, kind]));
  for (let m = 0; m < marks.length; m++) {
    const [j, kind] = marks[m];
    if (kind === 'quote') { lastSig = 'q'; continue; }
    if (j < i) continue;
    const c = src[j];
    if ('([{'.includes(c)) { depth++; lastSig = c; continue; }
    if (')]}'.includes(c)) { depth--; lastSig = c; continue; }
    if (depth !== 0) { if (!/\s/.test(c)) lastSig = c; continue; }
    if (c === ';') { decl = false; want = false; lastSig = c; continue; }
    if (c === '\n') { if (decl && lastSig !== ',') { decl = false; want = false; } continue; }
    if (c === ',' && decl) { want = true; lastSig = c; continue; }
    if (isId(c) && (j === 0 || !isId(src[j - 1]))) {
      let e = j;
      while (e < src.length && isId(src[e])) e++;
      const word = src.slice(j, e);
      i = e;
      if (src[j - 1] === '.') { lastSig = 'w'; continue; }
      if (word === 'const' || word === 'let' || word === 'var') { decl = true; want = true; }
      else if (word === 'function' && !decl) {
        const name = /^\s*([A-Za-z_$][\w$]*)/.exec(src.slice(e));
        if (name) names.add(name[1]);
      } else if (want) { names.add(word); want = false; }
      lastSig = 'w';
      continue;
    }
    if (!/\s/.test(c)) lastSig = c;
  }
  return names;
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

// The game script is the src/ files the page loads; as classic scripts they share one set of top-level names.
const gameFiles = pageScripts().filter((s) => s.src && s.src.startsWith('src/'));
assert.ok(gameFiles.length, 'the page loads no src/ files');
const GAME_NAMES = new Set(gameFiles.flatMap((s) => [...topLevelNames(s.code)]));
const TEST_DIR = __dirname;
// This file is left out: it holds planted bad run() strings on purpose, and never runs code strings itself.
const testFiles = fs.readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.js') && f !== path.basename(__filename));

function lint(src) {
  const bad = [];
  for (const { line, code } of runArgs(src)) {
    if (code === null) { bad.push(`line ${line}: run() with a non-literal argument (cannot be checked)`); continue; }
    for (const id of rootIdentifiers(code)) {
      if (GAME_NAMES.has(id) && !ROOTS.has(id) && !ALLOW.has(id)) bad.push(`line ${line}: run('${code.trim()}') names game global \`${id}\``);
    }
  }
  return bad;
}

describe('tests use the façade, not game globals', () => {
  it('finds the game script\'s top-level names', () => {
    for (const n of ['x', 'y', 'a', 'jz', 'jv', 'crash', 'camA', 'cam', 'grind', 'state', 'KICK', 'RAILS', 'FIN', 'cx', 'H', 'M',
      'FAR', 'fogAt', 'MAP_ID', 'ptrs', 'kb', 'anim', 'riderList', 'draw', 'step', 'start', 'stepParts', 'animTick', 'last'])
      assert.ok(GAME_NAMES.has(n), `missed top-level name ${n}`);
    for (const n of ['Gresca', 'HANGA', 'RiderAnim', 'snapshot', 'dt', 'ix', 'o4', 'k'])
      assert.ok(!GAME_NAMES.has(n), `${n} is not a top-level name of the game script`);
    assert.ok(GAME_NAMES.size > 80, `only ${GAME_NAMES.size} names found`);
  });

  it('catches a test that names a game global', () => {
    for (const planted of ["g.run('jz')", 'g.run(`x=${1};crash=0`)', "g.run('HANGA.fogAmount(1,FAR)')", 'g.run(code)',
      "g.run(\"state='done'\")", "goofy.run('anim.pose')", "g.run('Math.hypot(vx,vy)')"])
      assert.ok(lint(planted).length > 0, `lint missed ${planted}`);
    assert.deepEqual(lint("g.run('HANGA.camera.slopeFollow.tilt=1');g.run(\"localStorage.getItem('gresca-rig')\")"), []);
    assert.deepEqual(lint("g.run(`HANGA.fogAmount(${far},2)`);g.run('Gresca.state().x')"), []);
  });

  for (const f of testFiles) {
    it(`${f} reads and writes the game only through Gresca`, () => {
      assert.deepEqual(lint(fs.readFileSync(path.join(TEST_DIR, f), 'utf8')), []);
    });
  }

  it('the harness drives the game only through Gresca too', () => {
    const src = fs.readFileSync(path.join(TEST_DIR, 'harness.js'), 'utf8');
    assert.ok(!/runInContext\(\s*['"`]/.test(src), 'harness evaluates a code string');
  });

  it('every ALLOW entry is still needed and has a reason', () => {
    const all = testFiles.map((f) => fs.readFileSync(path.join(TEST_DIR, f), 'utf8')).join('\n');
    for (const [id, why] of ALLOW) {
      assert.ok(typeof why === 'string' && why.length > 10, `ALLOW ${id} needs a reason`);
      assert.ok(runArgs(all).some(({ code }) => code && rootIdentifiers(code).has(id)), `ALLOW ${id} is unused`);
    }
  });
});

describe('Gresca façade', () => {
  const g = load();
  const G = g.game;

  it('is on window, frozen, and adds no top-level name to the game script', () => {
    assert.ok(G && Object.isFrozen(G) && Object.isFrozen(G.world) && Object.isFrozen(G.debug));
    assert.ok(!GAME_NAMES.has('Gresca'));
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
