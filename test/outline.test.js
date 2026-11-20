// Tests for tools/outline.mjs, the line-range outline agents use instead of reading the art spec whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { outline } from '../tools/outline.mjs';

const require = createRequire(import.meta.url);
const HANGA = require('../art/gresca-hanga-spec.js');
const SPEC_PATH = new URL('../art/gresca-hanga-spec.js', import.meta.url);

test('outline lists nested keys and functions with closed line ranges', () => {
 const text = '{\n "a": {\n  "b": 1\n },\n "c": 2\n}\nX.f = function () {};\nfunction g(x) {}\n';
 const entries = outline(text, 2);
 assert.deepEqual(entries.map((entry) => [entry.name, entry.start, entry.end]), [
  ['a', 2, 4],
  ['b', 3, 4], // the last child runs on to its parent's end
  ['c', 5, 6],
  ['f()', 7, 7],
  ['g()', 8, 9],
 ]);
});

test('every top-level art spec key appears, in order, with its line range', () => {
 const text = readFileSync(SPEC_PATH, 'utf8');
 const lines = text.split('\n');
 const entries = outline(text, 1).filter((entry) => entry.depth === 1);
 const dataKeys = Object.keys(HANGA).filter((key) => typeof HANGA[key] !== 'function');
 assert.deepEqual(entries.map((entry) => entry.name), dataKeys);
 for (const entry of entries) {
  assert.ok(lines[entry.start - 1].startsWith(` "${entry.name}"`), entry.name);
  assert.ok(entry.end >= entry.start, entry.name);
 }
});

