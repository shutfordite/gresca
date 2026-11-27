// Input recorded per sim step, so a run can be replayed exactly: a fixed-size Float32 buffer of InputState fields.
import { INPUT_FIELDS } from './contracts.js';

const NF = INPUT_FIELDS.length;
const DEFAULT_STEPS = 120 * 300; // steps, 5 min at 120 Hz: 36000 × 9 fields × 4 bytes ≈ 1.3 MB while recording

/** A new, idle log: on (recording?), n (steps recorded), data (Float32Array, made by startRecording). */
export function createInputLog() {
 return { on: false, n: 0, data: null };
}

/** Starts a fresh recording with room for steps sim steps (default 5 min); a full log stops recording. */
export function startRecording(log, steps = DEFAULT_STEPS) {
 if (!log.data || log.data.length !== steps * NF) log.data = new Float32Array(steps * NF);
 log.n = 0;
 log.on = true;
}

/** Stops recording; the steps recorded so far stay readable. */
export function stopRecording(log) {
 log.on = false;
}

/** Appends the InputState the next sim step will see. No allocation. */
export function recordInput(log, input) {
 if (!log.on) return;
 if ((log.n + 1) * NF > log.data.length) {
  log.on = false;
  return;
 }
 const o = log.n * NF;
 for (let k = 0; k < NF; k++) log.data[o + k] = +input[INPUT_FIELDS[k]];
 log.n++;
}

/** Writes recorded step i into out (an InputState), as the sim saw it. */
export function readInput(log, i, out) {
 const o = i * NF;
 for (let k = 0; k < NF; k++) {
  const f = INPUT_FIELDS[k];
  const v = log.data[o + k];
  out[f] = typeof out[f] === 'boolean' ? v !== 0 : v;
 }
}
