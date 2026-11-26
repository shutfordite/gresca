// @areas sim
// The recorded RiderState traces (test/fixtures/traces): they load, hold every RiderState field, are small, and
// recording again reproduces them bit for bit (the sim is deterministic at a fixed dt and seed).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RIDER_FIELDS } from '../src/core/contracts.js';
import { TRACES, recordTrace, traceText } from '../tools/record-trace.mjs';
import { loadTrace, traceNames } from './traces.js';

const MAX_BYTES = 12000; // bytes a trace file may take (about 8 KB each today)
const ALL_FIELDS = [...RIDER_FIELDS.number, ...RIDER_FIELDS.boolean, ...RIDER_FIELDS.object];

describe('rider traces', () => {
 it('every trace in TRACES has a file, and every file has a trace', () => {
  assert.deepEqual(traceNames(), Object.keys(TRACES).sort());
 });

 for (const name of Object.keys(TRACES)) {
  it(`${name}: loads with every RiderState field, finite numbers, and is small`, () => {
   const t = loadTrace(name);
   assert.deepEqual([...t.fields].sort(), [...ALL_FIELDS].sort());
   assert.ok(t.rows.length >= 40, 'a few seconds of rows');
   assert.ok(t.text.length < MAX_BYTES, `${t.text.length} bytes`);
   for (const s of t.states) {
    for (const k of RIDER_FIELDS.number) assert.ok(Number.isFinite(s[k]), `${k} is finite`);
    for (const k of RIDER_FIELDS.boolean) assert.equal(typeof s[k], 'boolean', k);
    assert.ok(s.grind === null || typeof s.grind === 'object');
   }
   assert.equal(t.states.length, t.rows.length);
  });

  it(`${name}: recording again reproduces the file bit for bit`, async () => {
   const again = traceText(await recordTrace(name));
   assert.equal(again, loadTrace(name).text, 'run node tools/record-trace.mjs if the sim changed on purpose');
  });
 }

 it('the traces show what they are named for', () => {
  const kind = (name, f) => loadTrace(name).states.some(f);
  assert.ok(kind('brake', (s) => s.isBraking));
  assert.ok(kind('switch-traverse', (s) => s.isSwitch));
  assert.ok(kind('jump', (s) => s.z > 0.5 && s.fromKicker));
  assert.ok(kind('carve', (s) => s.skid > 0 || s.heading !== loadTrace('carve').states[0].heading));
 });
});
