// @areas tools
// The QA reporter (tools/qa/test-times.mjs): file and test times, suites counted once, and coverage per src/ folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import testTimes from '../tools/qa/test-times.mjs';

const file = (f) => path.join(process.cwd(), f);
const pass = (name, nesting, f, ms, type = 'test') =>
 ({ type: 'test:pass', data: { name, nesting, file: file(f), details: { duration_ms: ms, type } } });

async function report(events) {
 async function* source() {
  yield* events;
 }
 let out = '';
 for await (const chunk of testTimes(source())) out += chunk;
 return out;
}

test('times are summed per file from top-level tests and suites, and tests over 1 s are marked slow', async () => {
 const out = await report([
  pass('leaf a', 1, 'test/a.test.js', 1500),
  pass('suite a', 0, 'test/a.test.js', 1600, 'suite'),
  pass('b', 0, 'test/b.test.js', 400),
  { type: 'test:fail', data: { name: 'c', nesting: 0, file: file('test/b.test.js'), details: { duration_ms: 100 } } },
 ]);
 assert.match(out, /2 files, 3 tests, 2\.10 s summed .* 1 failed/);
 assert.match(out, /\| `test\/a\.test\.js` \| 1 \| 1\.60 s \| 76% \|/);
 assert.match(out, /\| leaf a \(slow\) \| `test\/a\.test\.js` \| 1\.50 s \|/);
 assert.doesNotMatch(out, /suite a/);
 assert.doesNotMatch(out, /Coverage/);
});

test('coverage is reported per src/ folder, least covered file first, and leaves out files outside src/', async () => {
 const f = (p, lines, covered) => ({
  path: file(p), totalLineCount: lines, coveredLineCount: covered, totalBranchCount: 2, coveredBranchCount: 1,
  totalFunctionCount: 4, coveredFunctionCount: 4, coveredLinePercent: 100 * covered / lines,
  coveredFunctionPercent: 100,
 });
 const summary = {
  files: [f('src/sim/a.js', 100, 90), f('src/sim/b.js', 100, 50), f('test/harness.js', 10, 0)],
  totals: { coveredLinePercent: 70, coveredBranchPercent: 50, coveredFunctionPercent: 100 },
 };
 const out = await report([pass('x', 0, 'test/a.test.js', 10), { type: 'test:coverage', data: { summary } }]);
 assert.match(out, /Lines 70\.0%, branches 50\.0%, functions 100\.0%/);
 assert.match(out, /\| `src\/sim\/` \| 70% \| 50% \| 100% \|/);
 assert.ok(out.indexOf('src/sim/b.js') < out.indexOf('src/sim/a.js'), 'least covered first');
 assert.doesNotMatch(out, /harness/);
});
