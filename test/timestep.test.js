// @areas sim
// The real game loop (requestAnimationFrame) runs the simulation at a fixed 120 Hz whatever the frame rate, caps the
// steps per frame, draws the rider interpolated between steps, and takes all its randomness from a seeded RNG (A3).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const g = await load();
// The loop draws every frame. The terrain raycast cost scales with the canvas width; a narrow canvas keeps these
// tests quick and changes nothing in the simulation.
g.el('c').clientWidth = 40;
const st = () => g.state();
const W = g.world;
const STEP = g.config.fixedStep, MAXN = g.config.maxStepsPerFrame;
const clone = (v) => JSON.parse(JSON.stringify(v)); // copy out of the vm realm

// A browser clock: each frame() is one requestAnimationFrame callback, fps frames per second of wall time.
let clock = 1000; // ms
const frame = (ms) => { clock += ms; g.raf(clock); };

// Input script: [time s, input]. Every time is a multiple of 1/6 s, which is a whole number of frames at 30, 60, 120
// and 144 fps, so a player at any of those rates presses at the same moment.
const SCRIPT = [
  [0, { left: 0, right: 0, brake: 0 }],
  [1 / 6, { left: 1 }],           // carve left
  [1 / 3, { left: 0, right: 1 }], // carve right
  [1 / 2, { right: 0, jump: 1 }], // jump from the snow
  [2 / 3, { left: 1 }],           // spin left in the air (a 180)
  [1, { left: 0 }],               // land, then ride into the kicker at y 260
];

// Ride `sec` seconds at `fps` through the real loop. Samples the rider every 1/6 s of wall time.
function ride(fps, sec, place, script) {
  frame(1000 / fps); // the loop is already running before the drop
  g.place(place);
  const l0 = st().landings, n = Math.round(sec * fps), every = fps / 6, path = [];
  let si = 0;
  for (let i = 0; i < n; i++) {
    while (si < script.length && script[si][0] * fps <= i + 1e-6) g.input(script[si++][1]);
    frame(1000 / fps);
    if ((i + 1) % every === 0) { const s = st(); path.push({ t: s.time, x: s.x, y: s.y, z: s.z }); }
  }
  const s = st();
  return { path, score: s.score, crashes: s.crashes, landings: s.landings - l0, time: s.time, popup: s.popup.text,
    parts: clone(g.game.particles()) };
}

const maxDev = (p, q) => {
  assert.equal(p.length, q.length);
  return Math.max(...p.map((a, i) => Math.hypot(a.x - q[i].x, a.y - q[i].y, a.z - q[i].z)));
};

describe('fixed timestep', () => {
  it('runs at 120 Hz with at most 8 steps a frame', () => {
    assert.equal(STEP, 1 / 120);
    assert.equal(MAXN, 8);
  });

  const FPS = [30, 60, 120, 144];

  it('the same input gives the same ride at 30, 60, 120 and 144 fps', () => {
    const place = { y: 236, vy: 12 };
    const runs = FPS.map((f) => ride(f, 3.5, place, SCRIPT));
    const ref = runs[0];
    // the script really does carve, jump, spin, hit the kicker and land twice
    assert.equal(ref.landings, 2, 'a jump from the snow and a kicker');
    assert.ok(ref.score > 0);
    assert.ok(Math.max(...ref.path.map((p) => p.z)) > 0.5, 'in the air');
    assert.ok(ref.path.at(-1).y > 262, 'past the kicker');
    assert.ok(Math.abs(ref.time - 3.5) < 1e-9, `simulated ${ref.time} s`);
    for (let k = 1; k < runs.length; k++) {
      const r = runs[k], f = FPS[k];
      assert.ok(maxDev(r.path, ref.path) < 0.01, `${f} fps strays ${maxDev(r.path, ref.path)} m from 30 fps`);
      assert.equal(r.score, ref.score, `${f} fps score`);
      assert.equal(r.crashes, ref.crashes, `${f} fps crashes`);
      assert.equal(r.landings, ref.landings, `${f} fps landings`);
      assert.equal(r.popup, ref.popup, `${f} fps popup`);
      assert.ok(Math.abs(r.time - ref.time) < 1e-9, `${f} fps simulated time`);
      // the spray is part of the simulation too: same particles, same places
      assert.equal(r.parts.length, ref.parts.length, `${f} fps particles`);
      r.parts.forEach((p, i) => assert.ok(Math.hypot(p.x - ref.parts[i].x, p.y - ref.parts[i].y, p.z - ref.parts[i].z) < 0.01));
    }
  });

  it('a tree crash happens the same way at every frame rate', () => {
    const T = W.trees[0];
    const runs = FPS.map((f) => ride(f, 1.5, { x: T.x, y: T.y - 4, vy: 8 }, [[0, { left: 0, right: 0 }]]));
    assert.equal(runs[0].crashes, 1);
    for (let k = 1; k < runs.length; k++) {
      assert.equal(runs[k].crashes, 1, `${FPS[k]} fps`);
      assert.ok(maxDev(runs[k].path, runs[0].path) < 0.01, `${FPS[k]} fps`);
    }
  });

  it('the loop matches Gresca.sim at the same fixed step', () => {
    const place = { y: 236, vy: 12 };
    const looped = ride(60, 1.5, place, SCRIPT);
    g.place(place);
    const path = [];
    let si = 0;
    for (let i = 0; i < 9; i++) { // 9 sixths of a second
      while (si < SCRIPT.length && SCRIPT[si][0] * 6 <= i + 1e-6) g.input(SCRIPT[si++][1]);
      g.sim(1 / 6);
      const s = st(); path.push({ t: s.time, x: s.x, y: s.y, z: s.z });
    }
    assert.ok(maxDev(path, looped.path) < 0.01, `loop strays ${maxDev(path, looped.path)} m from sim()`);
  });

  it('a 2 s stall runs at most 8 steps, then drops the rest', () => {
    frame(16);
    g.place({ vy: 10 });
    const t0 = st().time;
    frame(2000);
    assert.ok(Math.abs(st().time - t0 - MAXN * STEP) < 1e-9, `stall simulated ${st().time - t0} s`);
    // nothing carried over: the next 1/60 s frame runs just its own two steps
    const t1 = st().time;
    frame(1000 / 60);
    assert.ok(Math.abs(st().time - t1 - 2 * STEP) < 1e-9, `next frame simulated ${st().time - t1} s`);
  });

  it('a frame of exactly 8 steps (15 fps) loses no time', () => {
    frame(16);
    g.place({ vy: 10 });
    const t0 = st().time;
    for (let i = 0; i < 15; i++) frame(1000 / 15);
    assert.ok(Math.abs(st().time - t0 - 1) < 1e-9, `simulated ${st().time - t0} s in 1 s`);
  });

  it('runs no steps outside a run, and none bank up for later', () => {
    frame(16);
    g.place({ vy: 10 });
    g.set({ phase: 'ready' });
    const t0 = st().time, y0 = st().y;
    for (let i = 0; i < 30; i++) frame(1000 / 60);
    assert.equal(st().time, t0);
    assert.equal(st().y, y0);
    g.set({ phase: 'run' });
    frame(1000 / 60);
    assert.ok(Math.abs(st().time - t0 - 2 * STEP) < 1e-9);
  });

  it('the trick popup counts down in simulated time', () => {
    frame(16);
    g.place({ vy: 10 });
    g.set({ popup: { text: '+10p Air', t: 1 } });
    for (let i = 0; i < 30; i++) frame(1000 / 30); // 1 s at 30 fps
    assert.ok(Math.abs(st().popup.t) < 1e-9, `popup left ${st().popup.t} s`);
    g.set({ popup: { t: 1 } });
    for (let i = 0; i < 72; i++) frame(1000 / 144); // 0.5 s at 144 fps
    assert.ok(Math.abs(st().popup.t - 0.5) < 1e-9, `popup left ${st().popup.t} s`);
  });
});

describe('render interpolation', () => {
  it('draws the rider between the last two physics states', () => {
    frame(16);
    g.place({ vy: 10, vz: 4, z: 0.5 }); // moving down the slope and up into the air
    // 240 fps: a step every other frame. After two frames one step has run, with nothing left over.
    frame(1000 / 240); frame(1000 / 240);
    const before = st();
    frame(1000 / 240); frame(1000 / 240); // one more step, nothing left over
    const after = st();
    let v = g.debug.view();
    assert.ok(Math.abs(v.alpha) < 1e-6, `alpha ${v.alpha}`);
    assert.ok(Math.abs(v.from.y - before.y) < 1e-9 && Math.abs(v.y - before.y) < 1e-6, 'alpha 0 shows the earlier state');
    frame(1000 / 240); // half a step: no physics, alpha 0.5
    const same = st();
    assert.deepEqual([same.x, same.y, same.z, same.time], [after.x, after.y, after.z, after.time], 'drawing changed the simulation');
    v = g.debug.view();
    assert.ok(Math.abs(v.alpha - 0.5) < 1e-6, `alpha ${v.alpha}`);
    assert.ok(after.y > before.y + 0.05, 'the rider moved in that step');
    const between = (p, a, b) => p > Math.min(a, b) - 1e-9 && p < Math.max(a, b) + 1e-9;
    assert.ok(between(v.y, before.y, after.y) && between(v.x, before.x, after.x) && between(v.z, before.z, after.z),
      `drawn ${JSON.stringify(clone(v))} not between ${before.y} and ${after.y}`);
    assert.ok(Math.abs(v.y - (before.y + after.y) / 2) < 1e-6, 'halfway');
    assert.ok(Math.abs(v.z - (before.z + after.z) / 2) < 1e-6, 'halfway up');
  });

  it('a frame drawn outside the loop shows the current state', () => {
    g.place({ vy: 10 });
    g.sim(0.5);
    g.frames(1);
    const v = g.debug.view(), s = st();
    assert.deepEqual([v.x, v.y, v.z, v.alpha], [s.x, s.y, s.z, 1]);
  });

  it('does not interpolate across a new run', () => {
    frame(16);
    g.place({ y: 900, vy: 10 });
    for (let i = 0; i < 5; i++) frame(1000 / 60);
    g.place({ y: 500 });
    const v = g.debug.view(); // drawn before the new run started
    frame(1000 / 240); // half a step: interpolated, but from the new start, not from y 900
    const w = g.debug.view();
    assert.ok(v.y > 890 && Math.abs(w.y - 500) < 0.1, `drawn at y ${w.y}`);
  });
});

describe('seeded randomness', () => {
  // spray from a grind and a hard carve, then let it fly
  const spray = (seed) => {
    if (seed !== undefined) g.game.seed(seed);
    g.place({ vy: 12, heading: Math.PI / 2 + 0.8 }); // skidding sideways: carve spray
    g.emitParticles(20, st().x, st().y, 0.2, 3, 2.5, 0, 0);
    g.sim(0.3);
    return clone(g.game.particles());
  };

  it('the same seed gives the same particles', () => {
    const a = spray(7), b = spray(7);
    assert.ok(a.length > 20);
    assert.deepEqual(a, b);
  });

  it('a different seed gives different particles', () => {
    const a = spray(7), b = spray(8);
    assert.notDeepEqual(a, b);
  });

  it('every new run reseeds, so runs replay', () => {
    g.game.seed(3);
    const a = spray(), b = spray();
    assert.deepEqual(a, b);
    assert.equal(g.game.seed(), 3);
  });

  it('nothing in the run uses Math.random', () => {
    g.run('globalThis.__mr=Math.random;globalThis.__mrN=0;Math.random=()=>{globalThis.__mrN++;return globalThis.__mr()}');
    try {
      spray(5);
      const R = clone(W.rails)[0];
      g.place({ x: R.x0 + R.dx * 0.3, y: R.y0 + R.dy * 0.3, vx: R.dx * 12, vy: R.dy * 12, heading: Math.atan2(R.dy, R.dx) });
      g.sim(1);
      for (let i = 0; i < 30; i++) frame(1000 / 60);
      assert.equal(g.run('globalThis.__mrN'), 0);
    } finally {
      g.run('Math.random=globalThis.__mr');
    }
  });
});
