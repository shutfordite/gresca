// The mechanical half of a PR review (.claude/skills/gresca-architect, "Reviewing a PR"), pure: given the PR's
// title, body, changed files, diff and the test files on both sides, the findings a reviewer would otherwise look
// up by hand. tools/review/run.mjs gathers the inputs with git; CI posts the report as one PR comment.

/** Severity of a finding: a likely rule break the PR must explain, something to look at, or a plain fact. */
export const FAIL = 'fail';
export const WARN = 'warn';
export const INFO = 'info';

const MAX_LINE = 120; // characters, docs/STYLE.md
const ASSERT_RE = /\bassert(?:\.\w+)?\s*\(/g;
const SKIP_RE = /\b(?:test|it|describe)\.(?:skip|todo)\s*\(|[{,]\s*(?:skip|todo)\s*:(?!\s*false\b)/g;
const NUMBER_RE = /-?\d+(?:\.\d+)?(?:e-?\d+)?/gi;

/**
 * Who owns which path (AGENTS.md, "Who owns what"), most specific first. test/ and docs are left out on purpose:
 * tests and docs change with the code they cover. tools/bench is S4's (agreed exception), tools/review the
 * coordinator's. test/review.test.js checks this against the table in AGENTS.md.
 */
export const OWNERS = Object.freeze([
 ['src/view/rider-', 'S3'],
 ['art/gresca-rider-anim.js', 'S3'],
 ['art/gresca-hanga-spec.js', 'S4'],
 ['src/input/', 'S1'],
 ['src/ui/', 'S1'],
 ['styles/', 'S1'],
 ['src/sim/', 'S2'],
 ['src/view/', 'S4'],
 ['tools/bench/', 'S4'],
 ['tools/review/', 'Shared'],
 ['src/world/', 'S5'],
 ['tools/', 'S5'],
 ['maps/', 'S5'],
 ['src/core/', 'Shared'],
 ['src/app.js', 'Shared'],
 ['src/debug.js', 'Shared'],
 ['src/main.js', 'Shared'],
 ['src/scenes.js', 'Shared'],
 ['index.html', 'Shared'],
 ['lab.html', 'S4'],
 ['vendor/', 'S4'],
 ['test/harness.js', 'Shared'],
 ['.github/', 'Shared'],
 ['package.json', 'Shared'],
 ['package-lock.json', 'Shared'],
]);

/** The owner of a repository path ('S1'…'S5', 'Shared'), or null for tests, docs and other neutral files. */
export function ownerOf(file) {
 if (/(^|\/)(AGENTS|CLAUDE)\.md$/.test(file) || file.startsWith('docs/') || file.endsWith('README.md')) return null;
 const hit = OWNERS.find(([prefix]) => file === prefix || file.startsWith(prefix));
 return hit ? hit[1] : null;
}

/** Number of assert calls and of skip/todo markers in a test file's source (not in comments or quoted strings). */
export function countAsserts(src) {
 const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''");
 return { asserts: (code.match(ASSERT_RE) || []).length, skips: (code.match(SKIP_RE) || []).length };
}

/**
 * Parses a unified diff (git diff -U0) into {file: {added: [{line, text}], removed: [{line, text}]}}, line numbers
 * on the new and the old side respectively.
 */
export function parseDiff(diff) {
 const files = {};
 let cur = null;
 let oldLine = 0;
 let newLine = 0;
 for (const raw of diff.split('\n')) {
  if (raw.startsWith('+++ ')) {
   const name = raw.slice(4).replace(/^b\//, '');
   cur = name === '/dev/null' ? null : (files[name] ||= { added: [], removed: [] });
   continue;
  }
  if (raw.startsWith('--- ')) {
   const name = raw.slice(4).replace(/^a\//, '');
   if (name !== '/dev/null') cur = files[name] ||= { added: [], removed: [] };
   continue;
  }
  const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
  if (hunk) {
   oldLine = Number(hunk[1]);
   newLine = Number(hunk[2]);
   continue;
  }
  if (!cur) continue;
  if (raw.startsWith('+')) cur.added.push({ line: newLine++, text: raw.slice(1) });
  else if (raw.startsWith('-')) cur.removed.push({ line: oldLine++, text: raw.slice(1) });
 }
 return files;
}

const isTestFile = (f) => /^test\/.*\.test\.m?js$/.test(f);
const shape = (text) => text.trim().replace(NUMBER_RE, '#');
const numbers = (text) => text.match(NUMBER_RE) || [];
const hasAssert = (text) => /\bassert(?:\.\w+)?\s*\(/.test(text);

/**
 * Review step 2: asserts per test file on both sides, skips added, and assert lines whose numbers changed (same
 * line with only the numbers different: a tolerance, a limit or an expected value). base, head: {file: source}.
 */
export function assertionChecks(base, head, diffFiles) {
 const findings = [];
 const rows = [];
 const files = [...new Set([...Object.keys(base), ...Object.keys(head)])].filter(isTestFile).sort();
 for (const f of files) {
  const b = f in base ? countAsserts(base[f]) : null;
  const h = f in head ? countAsserts(head[f]) : null;
  if (b && !h) findings.push([FAIL, `\`${f}\` deleted (${b.asserts} asserts)`]);
  if (b && h && h.asserts < b.asserts) {
   findings.push([FAIL, `\`${f}\`: ${b.asserts} → ${h.asserts} asserts`]);
  }
  if (h && h.skips > (b ? b.skips : 0)) findings.push([FAIL, `\`${f}\`: skip/todo added`]);
  if (!b || !h || b.asserts !== h.asserts) rows.push([f, b ? b.asserts : '–', h ? h.asserts : '–']);
 }
 for (const [f, d] of Object.entries(diffFiles)) {
  if (!isTestFile(f)) continue;
  const added = d.added.filter((a) => hasAssert(a.text));
  for (const r of d.removed.filter((x) => hasAssert(x.text))) {
   const twin = added.find((a) => shape(a.text) === shape(r.text) && a.text.trim() !== r.text.trim());
   if (!twin) continue;
   const was = numbers(r.text).join(', ');
   const now = numbers(twin.text).join(', ');
   findings.push([WARN, `\`${f}:${twin.line}\` assert numbers changed: ${was} → ${now}`]);
  }
 }
 return { findings, rows };
}

/** Review step 4, ownership: which streams the PR touches, and contract changes mixed with other code. */
export function ownershipChecks(changed) {
 const by = {};
 for (const f of changed) {
  const o = ownerOf(f);
  if (o) (by[o] ||= []).push(f);
 }
 const findings = [];
 const streams = Object.keys(by).filter((o) => o !== 'Shared');
 if (streams.length > 1) findings.push([FAIL, `edits more than one stream's folders: ${streams.sort().join(', ')}`]);
 if (streams.length && by.Shared) {
  findings.push([WARN, `stream PR also edits shared files: ${by.Shared.map((f) => `\`${f}\``).join(', ')}`]);
 }
 const contract = changed.includes('src/core/contracts.js');
 const otherCode = changed.some((f) => f.startsWith('src/') && f !== 'src/core/contracts.js');
 if (contract && otherCode) findings.push([FAIL, 'changes `src/core/contracts.js` together with other code']);
 const summary = Object.entries(by).sort().map(([o, fs]) => `${o} (${fs.length})`).join(', ') || 'tests/docs only';
 findings.push([INFO, `owners touched: ${summary}`]);
 return findings;
}

/** The `**Section:**` headings of the PR template, in order. */
export function templateSections(template) {
 return [...template.matchAll(/^\*\*([^*]+):\*\*/gm)].map((m) => m[1]);
}

/** What a body says under a `**Section:**` (or `**Section**`) heading, without comments; null if it is missing. */
export function sectionText(body, section) {
 const start = body.search(new RegExp(`^\\*\\*${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:?\\*\\*`, 'm'));
 if (start < 0) return null;
 const rest = body.slice(start).replace(/^\*\*[^*]+\*\*/, '');
 const next = rest.search(/^\*\*[^*]+\*\*/m);
 return (next < 0 ? rest : rest.slice(0, next)).replace(/<!--[\s\S]*?-->/g, '').trim();
}

const LOOK_RE = /^(src\/view\/|art\/|styles\/)/;

/** The PR title and template: package id, every section filled, screenshots for visible changes. */
export function templateChecks(title, body, template, changed) {
 const findings = [];
 if (!/^[A-Z][\w.-]*(?:\/[\w.-]+)?: \S/.test(title)) {
  findings.push([WARN, `title "${title}" is not \`<package id>: <what>\``]);
 }
 const text = body || '';
 for (const s of templateSections(template)) {
  if (s === 'Checklist') continue;
  const said = sectionText(text, s);
  const optional = s === 'Screenshots' && !changed.some((f) => LOOK_RE.test(f));
  if (!said && !optional) findings.push([s === 'Screenshots' ? WARN : FAIL, `PR body: **${s}** is empty`]);
 }
 const open = (text.match(/^- \[ \]/gm) || []).length;
 if (open) findings.push([WARN, `PR body: ${open} checklist item(s) unticked`]);
 return findings;
}

/**
 * Docs and style on what the PR adds: new src files missing from the code map, new tests in no area script, an
 * art spec change without a version and its notes, tunables without a unit comment, long lines, missing headers.
 * added: files new in this PR. read(file): head source or null. diffFiles: from parseDiff.
 */
export function docsAndStyleChecks({ added, changed, diffFiles, read, packageJson }) {
 const findings = [];
 const codeMap = (read('AGENTS.md') || '') + (read('docs/ARCHITECTURE.md') || '');
 for (const f of added.filter((x) => /^src\/.*\.js$/.test(x))) {
  const base = f.split('/').pop();
  if (!codeMap.includes(base)) findings.push([WARN, `new \`${f}\` is not in the AGENTS.md code map`]);
  const first = (read(f) || '').split('\n')[0];
  if (!first.startsWith('//')) findings.push([WARN, `new \`${f}\` has no one-line header comment`]);
 }
 const scripts = JSON.parse(packageJson || '{}').scripts || {};
 const areas = Object.entries(scripts).filter(([k]) => /^test:(sim|view|input|world)$/.test(k));
 for (const f of added.filter(isTestFile)) {
  if (!areas.some(([, v]) => v.includes(f))) findings.push([INFO, `new \`${f}\` is in no \`test:<area>\` script`]);
 }
 if (changed.includes('art/gresca-hanga-spec.js')) {
  const d = diffFiles['art/gresca-hanga-spec.js'] || { added: [] };
  const v = d.added.map((a) => /version\s*:\s*'(\d+\.\d+\.\d+)'/.exec(a.text)).find(Boolean);
  if (!v) findings.push([FAIL, 'art spec changed without a `version` bump']);
  else if (!read(`docs/art/HANGA-v${v[1]}.md`)) {
   findings.push([FAIL, `art spec v${v[1]} has no \`docs/art/HANGA-v${v[1]}.md\``]);
  }
 }
 for (const f of ['src/core/config.js', 'src/sim/tuning.js']) {
  for (const a of (diffFiles[f] || { added: [] }).added) {
   const tunable = /^\s*(?:export\s+const\s+[A-Z][A-Z0-9_]*\s*=|[A-Za-z]\w*\s*:)\s*-?[\d.]/.test(a.text);
   if (tunable && !a.text.includes('//')) findings.push([WARN, `\`${f}:${a.line}\` tunable without a unit comment`]);
  }
 }
 const long = [];
 for (const [f, d] of Object.entries(diffFiles)) {
  if (!/\.(m?js|cjs|css)$/.test(f) || f.includes('fixtures/')) continue;
  for (const a of d.added) if ([...a.text].length > MAX_LINE) long.push(`\`${f}:${a.line}\``);
 }
 if (long.length) {
  const shown = long.slice(0, 8).join(', ') + (long.length > 8 ? ` and ${long.length - 8} more` : '');
  findings.push([WARN, `${long.length} new line(s) over ${MAX_LINE} characters: ${shown}`]);
 }
 return findings;
}

/** Facts a reviewer asks first: did the golden trace or recorded fixtures change, did the frame time baseline move. */
export function behaviourChecks(changed, diffFiles) {
 const findings = [];
 const goldenDiff = diffFiles['test/golden.test.js'] || { added: [] };
 const golden = goldenDiff.added.some((a) => /GOLDEN_HASH\s*=/.test(a.text));
 findings.push(golden
  ? [WARN, 'golden trace hash re-recorded: the PR must name the behaviour change']
  : [INFO, 'golden trace hash unchanged (`npm test` checks the ride is the same, bit for bit)']);
 const fixtures = changed.filter((f) => f.startsWith('test/fixtures/'));
 if (fixtures.length) findings.push([WARN, `${fixtures.length} recorded fixture file(s) changed in test/fixtures/`]);
 const baseline = changed.some((f) => f.startsWith('tools/bench/baseline'));
 if (baseline) findings.push([WARN, 'frame-time baseline re-recorded']);
 return findings;
}

const ICON = { [FAIL]: '❌', [WARN]: '⚠️', [INFO]: 'ℹ️' };

/** The report as Markdown: findings by section, worst first, and the assert count table when counts moved. */
export function renderReport(sections, assertRows, marker = '') {
 const order = { [FAIL]: 0, [WARN]: 1, [INFO]: 2 };
 const all = sections.flatMap(([, fs]) => fs);
 const fails = all.filter(([s]) => s === FAIL).length;
 const warns = all.filter(([s]) => s === WARN).length;
 const head = fails ? `❌ ${fails} to explain` : warns ? `⚠️ ${warns} to look at` : '✅ nothing flagged';
 const out = [marker, `### PR check: ${head}${fails && warns ? `, ⚠️ ${warns} to look at` : ''}`, ''];
 for (const [name, fs] of sections) {
  if (!fs.length) continue;
  out.push(`**${name}**`);
  for (const [s, text] of [...fs].sort((a, b) => order[a[0]] - order[b[0]])) out.push(`- ${ICON[s]} ${text}`);
  out.push('');
 }
 if (assertRows.length) {
  out.push('<details><summary>Assert counts that moved</summary>', '', '| file | main | PR |', '|---|---|---|');
  for (const [f, b, h] of assertRows) out.push(`| \`${f}\` | ${b} | ${h} |`);
  out.push('', '</details>', '');
 }
 out.push('<sub>Mechanical checks from `tools/review/` (advisory). A reviewer still judges the claims, the ' +
  'architecture and the feel.</sub>');
 return out.join('\n');
}
