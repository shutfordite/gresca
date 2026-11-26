// Test areas from tags: each test file names its areas on its first line (`// @areas sim view`), so adding a test
// never touches a shared list. Usage: node tools/test-area.mjs <area>  (runs the files tagged with that area, quietly).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The known areas: one per stream's folders, plus shared (app, façade, page) and tools. */
export const AREAS = Object.freeze(['sim', 'view', 'input', 'ui', 'world', 'shared', 'tools']);

const TAG = /^\/\/ @areas((?: [a-z]+)+)\s*$/;

/** The areas a test file's source names on its first line, or null when the first line is not an `@areas` tag. */
export function parseAreas(source) {
 const m = TAG.exec(source.split('\n')[0]);
 return m ? m[1].trim().split(' ') : null;
}

/** What is wrong with a test file's tag ('' when nothing): no tag, or an area not in AREAS. */
export function tagProblem(source) {
 const areas = parseAreas(source);
 if (!areas) return 'its first line is not `// @areas <area> …`';
 const unknown = areas.filter((a) => !AREAS.includes(a));
 return unknown.length ? `unknown area ${unknown.join(', ')} (known: ${AREAS.join(', ')})` : '';
}

/** The test files (paths relative to root) tagged with area, sorted. root: the repo folder. */
export function filesForArea(area, root) {
 const dir = path.join(root, 'test');
 return fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort()
  .filter((f) => (parseAreas(fs.readFileSync(path.join(dir, f), 'utf8')) || []).includes(area))
  .map((f) => 'test/' + f);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
 const area = process.argv[2];
 if (!AREAS.includes(area)) {
  console.error(`usage: node tools/test-area.mjs <area>  (areas: ${AREAS.join(', ')})`);
  process.exit(2);
 }
 const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
 const files = filesForArea(area, root);
 const run = spawnSync(process.execPath, ['--test', '--test-reporter=dot', ...files], { cwd: root, stdio: 'inherit' });
 process.exit(run.status ?? 1);
}
