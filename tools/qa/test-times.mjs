// A node:test reporter for the QA pass (.claude/skills/gresca-qa): the slowest test files and tests, so overtesting
// that slows the suite is measured, not guessed, and, when the run has coverage on, line, branch and function
// coverage per folder of src/ and the least covered files. Usage: npm run test:times, or npm run test:quality.
import path from 'node:path';

const TOP_FILES = 15; // rows
const TOP_TESTS = 20; // rows
const SLOW_TEST_MS = 1000; // a single test slower than this is listed as slow, milliseconds
const LOW_FILES = 15; // rows of least covered files

const pct = (covered, total) => (total ? (100 * covered / total).toFixed(0) + '%' : 'n/a');

/** Line, branch and function coverage per src/ folder and the least covered files, as markdown lines. */
function coverageLines(summary) {
 const folders = new Map();
 const files = [];
 for (const f of summary.files) {
  const rel = path.relative(process.cwd(), f.path);
  if (!rel.startsWith('src/')) continue;
  const dir = path.dirname(rel);
  const row = folders.get(dir) || { lines: 0, coveredLines: 0, branches: 0, coveredBranches: 0, fns: 0, coveredFns: 0 };
  row.lines += f.totalLineCount;
  row.coveredLines += f.coveredLineCount;
  row.branches += f.totalBranchCount;
  row.coveredBranches += f.coveredBranchCount;
  row.fns += f.totalFunctionCount;
  row.coveredFns += f.coveredFunctionCount;
  folders.set(dir, row);
  files.push({ rel, line: f.coveredLinePercent, fn: f.coveredFunctionPercent, lines: f.totalLineCount });
 }
 const t = summary.totals;
 const out = ['', '## Coverage of src/', '', `Lines ${t.coveredLinePercent.toFixed(1)}%, branches ` +
  `${t.coveredBranchPercent.toFixed(1)}%, functions ${t.coveredFunctionPercent.toFixed(1)}%.`, '',
  '| Folder | Lines | Branches | Functions |', '|---|---|---|---|'];
 for (const [dir, r] of [...folders].sort()) {
  out.push(`| \`${dir}/\` | ${pct(r.coveredLines, r.lines)} | ${pct(r.coveredBranches, r.branches)} | ` +
   `${pct(r.coveredFns, r.fns)} |`);
 }
 out.push('', '| Least covered files | Lines | Functions | Size (lines) |', '|---|---|---|---|');
 for (const f of files.sort((a, b) => a.line - b.line).slice(0, LOW_FILES)) {
  out.push(`| \`${f.rel}\` | ${f.line.toFixed(0)}% | ${f.fn.toFixed(0)}% | ${f.lines} |`);
 }
 return out;
}

/** Collects pass and fail events and yields one markdown report at the end of the run. */
export default async function* testTimes(source) {
 const files = new Map(); // file → { ms, tests, fails }
 const tests = [];
 let failed = 0;
 let coverage = null;
 for await (const event of source) {
  if (event.type === 'test:coverage') coverage = event.data.summary;
  if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
  const { name, nesting, file, details } = event.data;
  const ms = details?.duration_ms ?? 0;
  const rel = file ? path.relative(process.cwd(), file) : name;
  const leaf = details?.type !== 'suite';
  if (event.type === 'test:fail' && leaf) failed++;
  const row = files.get(rel) || { ms: 0, tests: 0 };
  if (nesting === 0) row.ms += ms; // a file's top-level tests and suites: its time
  if (leaf) {
   row.tests++;
   tests.push({ rel, name, ms });
  }
  files.set(rel, row);
 }
 const total = [...files.values()].reduce((n, r) => n + r.ms, 0);
 const fmt = (ms) => (ms / 1000).toFixed(2) + ' s';
 const lines = ['', '## Test times', '', `${files.size} files, ${tests.length} tests, ` +
  `${fmt(total)} summed (files run in parallel, so wall time is lower), ${failed} failed.`, '',
  '| File | Tests | Time | Share |', '|---|---|---|---|'];
 for (const [rel, r] of [...files].sort((a, b) => b[1].ms - a[1].ms).slice(0, TOP_FILES)) {
  lines.push(`| \`${rel}\` | ${r.tests} | ${fmt(r.ms)} | ${(100 * r.ms / (total || 1)).toFixed(0)}% |`);
 }
 lines.push('', '| Slowest tests | File | Time |', '|---|---|---|');
 for (const t of tests.sort((a, b) => b.ms - a.ms).slice(0, TOP_TESTS)) {
  lines.push(`| ${t.name}${t.ms > SLOW_TEST_MS ? ' (slow)' : ''} | \`${t.rel}\` | ${fmt(t.ms)} |`);
 }
 if (coverage) lines.push(...coverageLines(coverage));
 yield lines.join('\n') + '\n';
}
