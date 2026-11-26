// @areas tools
// Test areas from tags (tools/test-area.mjs, X1): every test file names known areas on its first line, and the
// per-area scripts in package.json list no files, so adding a test never touches a shared list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, filesForArea, parseAreas, tagProblem } from '../tools/test-area.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = fs.readdirSync(path.join(ROOT, 'test')).filter((f) => f.endsWith('.test.js'));

test('a tag names its areas; anything else on the first line is no tag', () => {
 assert.deepEqual(parseAreas('// @areas sim view\n// The brake.'), ['sim', 'view']);
 assert.equal(parseAreas('// The brake.\n// @areas sim'), null);
 assert.equal(parseAreas('// @areas\n'), null);
 assert.equal(tagProblem('// @areas sim\n'), '');
 assert.match(tagProblem('// @areas sim flips\n'), /unknown area flips/);
 assert.match(tagProblem('import x from "y";\n'), /first line is not/);
});

test('every test file names known areas on its first line', () => {
 for (const f of TESTS) {
  const problem = tagProblem(fs.readFileSync(path.join(ROOT, 'test', f), 'utf8'));
  assert.equal(problem, '', `test/${f}: ${problem}`);
 }
});

test('every area has tests and a script that lists no files', () => {
 const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
 for (const a of AREAS) {
  assert.ok(filesForArea(a, ROOT).length > 0, a + ' has tests');
  assert.equal(scripts['test:' + a], 'node tools/test-area.mjs ' + a);
 }
 assert.ok(filesForArea('sim', ROOT).includes('test/golden.test.js'));
 assert.ok(!Object.values(scripts).some((v) => /test\/\w[\w-]*\.test\.js/.test(v)), 'no script lists a test file');
});
