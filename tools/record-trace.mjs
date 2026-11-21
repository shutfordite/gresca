// Records RiderState traces: short fixed-seed, fixed-dt rides through the façade, written to
// test/fixtures/traces/<name>.json for tests and tools that need real rider motion (the rider animation, the camera,
// the screenshots). Usage: node tools/record-trace.mjs [name ...]  (default: all). Imported by test/traces.test.js,
// which checks that recording again gives the same bytes. Always recorded with the map unrotated, in world metres
// (x east, y north, headings counter-clockwise from east: docs/adr/0005-enu-frame.md). Numbers are rounded to 4 decimals.
import fs from 'node:fs';
import path from 'node:path';
import { load } from '../test/harness.js';
import { RIDER_FIELDS } from '../src/core/contracts.js';

export const TRACE_DIR = path.join(import.meta.dirname, '..', 'test', 'fixtures', 'traces');
export const DT = 1 / 120;      // s per sim step
export const EVERY = 6;         // sim steps between recorded rows (20 rows per second)
export const SEED = 1;          // the simulation's random seed
const DECIMALS = 1e4;           // numbers are rounded to 4 decimals
const PRACTICE_S = 500;         // m along the piste: the empty practice stretch
const SMALL_KICKER = 3;         // index into course.kickers
const KICKER_BACK = 14;         // m before the lip the jump starts

/**
 * The traces: {about, start: {s | kicker, back, speed (m/s), turn (rad from the direction of travel), rig},
 * seconds, inputs: [[from s, {left, right, brake, jump}], ...] (each holds until the next)}.
 */
export const TRACES = Object.freeze({
 carve: {
  about: 'Snowboard carving right, then left, on the practice stretch.',
  start: { s: PRACTICE_S, speed: 12, turn: 0, rig: 'board' }, seconds: 3,
  inputs: [[0, { right: 1 }], [1, {}], [1.2, { left: 1 }], [2.2, {}]],
 },
 brake: {
  about: 'Skis at 14 m/s, brake held from 0.5 s to 1.5 s.',
  start: { s: PRACTICE_S, speed: 14, turn: 0, rig: 'ski' }, seconds: 3,
  inputs: [[0.5, { brake: 1 }], [1.5, {}]],
 },
 'switch-traverse': {
  about: 'Skis ridden switch (tail first), turning right then left.',
  start: { s: PRACTICE_S, speed: 10, turn: Math.PI, rig: 'ski' }, seconds: 3,
  inputs: [[0, { right: 1 }], [0.8, {}], [1.2, { left: 1 }], [2, {}]],
 },
 jump: {
  about: 'Snowboard straight off a small kicker, and the landing.',
  start: { kicker: SMALL_KICKER, speed: 15, turn: 0, rig: 'board' }, seconds: 3,
  inputs: [],
 },
});

// The row's columns: every RiderState field, in the contract's order (numbers, booleans, then the grind).
export const FIELDS = Object.freeze([...RIDER_FIELDS.number, ...RIDER_FIELDS.boolean, ...RIDER_FIELDS.object]);

const round = (v) => (typeof v === 'number' ? Math.round(v * DECIMALS) / DECIMALS : v);

// One row: the RiderState fields of the façade's state(), grind as null or {rail, t, dist} (grindDist is its dist).
function row(s) {
 return FIELDS.map((k) => {
  if (k === 'grind') return s.grind && { rail: s.grind.rail, t: round(s.grind.t), dist: round(s.grind.dist) };
  if (k === 'grindDist') return round(s.grind ? s.grind.dist : 0);
  return round(s[k]);
 });
}

// The rider's start on the course: the world position (m) and the direction of travel (rad).
function startOf(G, def) {
 const course = G.world.course;
 let s = def.s;
 if ('kicker' in def) s = course.kickers[def.kicker].s - KICKER_BACK;
 const at = course.point(s, 0, { x: 0, y: 0 });
 return { x: at.x, y: at.y, heading: G.world.frame.downhill };
}

/** Records the named trace: {name, about, dt, every, seed, rig, fields, rows}. Resolves in world metres. */
export async function recordTrace(name) {
 const def = TRACES[name];
 if (!def) throw new Error('record-trace: unknown trace ' + name + ' (known: ' + Object.keys(TRACES).join(', ') + ')');
 const G = (await load({ rotationDeg: 0 })).raw;
 G.seed(SEED);
 const at = startOf(G, def.start);
 const speed = def.start.speed;
 G.place({
  x: at.x, y: at.y, vx: Math.cos(at.heading) * speed, vy: Math.sin(at.heading) * speed,
  heading: at.heading + def.start.turn,
 });
 G.set({ rig: def.start.rig });
 const rows = [row(G.state())];
 const steps = Math.round(def.seconds / DT);
 let next = 0;
 for (let n = 1; n <= steps; n++) {
  const t = (n - 1) * DT;
  while (next < def.inputs.length && def.inputs[next][0] <= t + 1e-9) {
   G.input({ left: 0, right: 0, brake: 0, jump: 0, ...def.inputs[next][1] });
   next++;
  }
  G.sim(DT, DT);
  if (n % EVERY === 0) rows.push(row(G.state()));
 }
 return { name, about: def.about, dt: DT, every: EVERY, seed: SEED, rig: def.start.rig, fields: FIELDS, rows };
}

/** The trace as the text written to disk: one row per line, so a diff of two recordings reads. */
export function traceText(trace) {
 const { rows, ...head } = trace;
 const lines = rows.map((r) => '  ' + JSON.stringify(r));
 return JSON.stringify(head).slice(0, -1) + ',"rows":[\n' + lines.join(',\n') + '\n]}\n';
}

// node tools/record-trace.mjs [name ...]: writes the traces and prints their sizes.
if (process.argv[1] === import.meta.filename) {
 const names = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(TRACES);
 fs.mkdirSync(TRACE_DIR, { recursive: true });
 for (const name of names) {
  const text = traceText(await recordTrace(name));
  fs.writeFileSync(path.join(TRACE_DIR, name + '.json'), text);
  console.log(name + '.json', text.length, 'bytes');
 }
}
