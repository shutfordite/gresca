// Golden trace: a fixed-seed, fixed-dt ride through the façade, dumped per step, to prove a refactor changes nothing.
// Usage: node tools/golden-trace.mjs [out.json] [rotationDeg]  (prints the sha256 of the trace; writes the trace if
// out is given; places the map at rotationDeg, default 0). Imported by test/golden.test.js, which checks the hash
// against the one recorded before the B2c course seam. The trace is read through the test harness's map view
// (test/map-view.js), so it is in the procedural map's own grid frame whatever the placement: the same ride at any
// rotation gives the same numbers up to rounding (docs/adr/0005-enu-frame.md).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { load } from '../test/harness.js';

const DT = 1 / 120;      // s per sim step
const FRAME_EVERY = 48;  // steps between drawn frames (2.5 Hz of sim time, to keep the test under 2 s)
const FRAME_DT = 1 / 30; // s, the frame time each drawn frame advances the camera and animation
const RUN_STEPS = 120 * 45; // steps, the most one ride takes

// Steer toward the piste centreline 15 m ahead, offset to hit a rail line now and then (s: Gresca.state(), W: world).
function aim(s, W, off) {
 const ty = s.y + 15;
 const ang = Math.atan2(ty - s.y, W.centre(ty) + off - s.x);
 if (s.z > 0.05) return { left: 0, right: 0 };
 if (ang > s.heading + 0.03) return { left: 0, right: 1 };
 if (ang < s.heading - 0.03) return { left: 1, right: 0 };
 return { left: 0, right: 0 };
}

// The rails' offsets (m) by the y range they cover, so the pilot rides onto every rail it passes.
function railOffset(s, W) {
 for (const r of W.rails) if (s.y > r.y0 - 30 && s.y < r.y1 + 10) return r.x0 - W.centre(r.y0);
 return 0;
}

// One step's input from the step count n: aim down the piste (onto each rail), a short carve, a brake and a jump now
// and then.
function pilot(s, W, n) {
 let steer = aim(s, W, railOffset(s, W));
 if (n % 900 > 600 && n % 900 < 615) steer = { left: 0, right: 1 }; // a short hard carve right
 const brake = n % 1200 > 1000 && n % 1200 < 1030 ? 1 : 0;
 const jump = n % 300 === 150 ? 1 : 0;
 return { ...steer, brake, jump };
}

// Numbers are kept at full precision: JSON numbers round-trip, so equal traces are bitwise equal.

// One step's record: the rider, the score and the step's new events (and the HUD and draw counts on frame steps).
function record(g, n, evStart) {
 const s = g.state();
 const row = [n, s.x, s.y, s.z, s.vx, s.vy, s.vz, s.heading, s.score, s.crashes, s.phase, s.fromKicker, s.grinding];
 const ev = g.game.events.list().slice(evStart);
 const out = { r: row };
 if (ev.length) out.e = ev.map((e) => JSON.stringify(e));
 return out;
}

function frameRecord(g, out) {
 g.frames(1, FRAME_DT);
 out.hud = g.el('info').textContent;
 out.dot = g.el('dot').style.left + ',' + g.el('dot').style.top;
 out.drawn = g.debug.drawn();
 out.yaw = g.debug.riderYaw();
 const a = g.debug.anim();
 out.anim = a && JSON.stringify(a);
}

// Rides one run from place() options until the finish or RUN_STEPS; returns the per-step records.
function ride(g, seed, placeOpts, start) {
 g.game.seed(seed);
 if (start) g.start();
 else g.place(placeOpts);
 g.game.events.clear();
 const rows = [];
 for (let n = 0; g.state().phase === 'run' && n < RUN_STEPS; n++) {
  const evStart = g.game.events.list().length;
  g.input(pilot(g.state(), g.world, n));
  g.sim(DT);
  const row = record(g, n, evStart);
  if (n % FRAME_EVERY === 0) frameRecord(g, row);
  rows.push(row);
 }
 return rows;
}

// The fields of a row each hash covers (X1): the sim hash the ride, its events and what the HUD shows of it; the anim
// hash what the view makes of it on drawn frames (rider yaw, pose, draw counts), keyed by the step. An animation
// change re-records only the anim hash, so the sim hash keeps proving the ride is the same.
const SIM_FIELDS = Object.freeze(['r', 'e', 'hud', 'dot']);
const ANIM_FIELDS = Object.freeze(['drawn', 'yaw', 'anim']);

function pick(row, fields) {
 const out = {};
 for (const f of fields) if (f in row) out[f] = row[f];
 return out;
}

function sha256(text) {
 return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * The golden trace from three fixed rides: {rides: [{name, rows}], text, hash (sha256 hex of the whole trace), simHash,
 * animHash (of SIM_FIELDS and ANIM_FIELDS of every row)}. opts.rotationDeg: see load().
 */
export async function goldenTrace(opts = {}) {
 const g = await load({ rotationDeg: opts.rotationDeg ?? 0 });
 const rides = [
  { name: 'from the top', rows: ride(g, 3, null, true) },
  { name: 'park from y 1960', rows: ride(g, 7, { y: 1960, vy: 15 }, false) },
  { name: 'park from y 740', rows: ride(g, 11, { y: 740, vy: 12 }, false) },
 ];
 const text = JSON.stringify(rides);
 const sim = rides.map((r) => r.rows.map((x) => pick(x, SIM_FIELDS)));
 const anim = rides.map((r) => r.rows.filter((x) => 'drawn' in x).map((x) => ({ n: x.r[0], ...pick(x, ANIM_FIELDS) })));
 return {
  rides,
  text,
  hash: sha256(text),
  simHash: sha256(JSON.stringify(sim)),
  animHash: sha256(JSON.stringify(anim)),
 };
}

if (import.meta.url === 'file://' + process.argv[1]) {
 const t = await goldenTrace({ rotationDeg: Number(process.argv[3] || 0) });
 if (process.argv[2]) fs.writeFileSync(process.argv[2], t.text);
 const steps = t.rides.map((r) => r.name + ': ' + r.rows.length + ' steps, ' +
  r.rows.filter((x) => x.e).flatMap((x) => x.e).length + ' events, last ' + JSON.stringify(r.rows.at(-1).r));
 console.log(steps.join('\n') + '\nsim  ' + t.simHash + '\nanim ' + t.animHash + '\nall  ' + t.hash);
}
