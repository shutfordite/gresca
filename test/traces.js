// Loads the recorded RiderState traces (test/fixtures/traces/<name>.json, made by tools/record-trace.mjs).
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, 'fixtures', 'traces');

/** The names of the recorded traces, sorted. */
export function traceNames() {
 return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}

/**
 * Loads a trace: {name, about, dt (s per sim step), every (steps per row), seed, rig, fields, rows (arrays, by fields),
 * states (rows as RiderState-shaped objects, grindDist included), text (the file's bytes as text)}. Units: m, m/s, rad, s.
 */
export function loadTrace(name) {
 const text = fs.readFileSync(path.join(DIR, name + '.json'), 'utf8');
 const trace = JSON.parse(text);
 const states = trace.rows.map((r) => Object.fromEntries(trace.fields.map((k, i) => [k, r[i]])));
 return { ...trace, states, text };
}
