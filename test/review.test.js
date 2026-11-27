// @areas tools
// The mechanical PR checks (tools/review/): each rule on small made-up inputs, and the ownership list against the
// "Who owns what" table in AGENTS.md, so the two can't drift.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
 codeMapFiles, isRound, statusCheck,
 assertionChecks, behaviourChecks, countAsserts, docsAndStyleChecks, FAIL, INFO, ownerOf, ownershipChecks,
 parseDiff, renderReport, sectionText, templateChecks, templateSections, WARN,
} from '../tools/review/checks.mjs';
import { smokeFindings } from '../tools/review/smoke-report.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const severities = (findings) => findings.map(([s]) => s);
const texts = (findings) => findings.map(([, t]) => t).join('\n');

const diffOf = (file, removed, added) => [
 `--- a/${file}`, `+++ b/${file}`, `@@ -10,${removed.length} +10,${added.length} @@`,
 ...removed.map((l) => '-' + l), ...added.map((l) => '+' + l),
].join('\n');

test('asserts and skips are counted, commented-out ones are not', () => {
 const src = "assert.equal(a, 1);\nassert(b);\n// assert.ok(c);\ntest.skip('x', () => {});\nit('y', { skip: true });";
 assert.deepEqual(countAsserts(src), { asserts: 2, skips: 2 });
 assert.deepEqual(countAsserts("it('y', { skip: false });"), { asserts: 0, skips: 0 });
 assert.deepEqual(countAsserts('const fixture = "test.skip(1); assert(2)";'), { asserts: 0, skips: 0 });
});

test('the diff parser keeps line numbers on each side', () => {
 const d = parseDiff(diffOf('test/a.test.js', ['old'], ['new', 'more']));
 assert.deepEqual(d['test/a.test.js'].removed, [{ line: 10, text: 'old' }]);
 assert.deepEqual(d['test/a.test.js'].added, [{ line: 10, text: 'new' }, { line: 11, text: 'more' }]);
});

test('fewer asserts, a deleted test file and an added skip are flagged', () => {
 const base = { 'test/a.test.js': 'assert(1);assert(2);', 'test/b.test.js': 'assert(1);' };
 const head = { 'test/a.test.js': "assert(1);test.todo('later');" };
 const { findings, rows } = assertionChecks(base, head, {});
 assert.deepEqual(severities(findings), [FAIL, FAIL, FAIL]);
 assert.match(texts(findings), /a\.test\.js`: 2 → 1 asserts/);
 assert.match(texts(findings), /b\.test\.js` deleted/);
 assert.match(texts(findings), /skip\/todo added/);
 assert.deepEqual(rows, [['test/a.test.js', 2, 1], ['test/b.test.js', 1, '–']]);
});

test('an assert line whose numbers changed is flagged with old and new numbers; new asserts are not', () => {
 const diff = parseDiff(diffOf('test/a.test.js', ['  assert.ok(d < 0.5, "stops");'],
  ['  assert.ok(d < 0.8, "stops");', '  assert.ok(e > 1);']));
 const same = { 'test/a.test.js': 'assert(1);' };
 const { findings } = assertionChecks(same, same, diff);
 assert.equal(findings.length, 1);
 assert.equal(findings[0][0], WARN);
 assert.match(findings[0][1], /a\.test\.js:10` assert numbers changed: 0\.5 → 0\.8/);
});

test('ownership: one stream is fine, two streams or a contract mixed with code are flagged', () => {
 assert.equal(ownerOf('src/sim/step.js'), 'S2');
 assert.equal(ownerOf('src/view/rider-draw.js'), 'S3');
 assert.equal(ownerOf('src/view/camera.js'), 'S4');
 assert.equal(ownerOf('tools/bench/core.mjs'), 'S4');
 assert.equal(ownerOf('tools/map-compiler/core.js'), 'S5');
 assert.equal(ownerOf('art/gresca-hanga-spec.js'), 'S6');
 assert.equal(ownerOf('src/sim/AGENTS.md'), null);
 assert.equal(ownerOf('test/sim.test.js'), null);
 assert.deepEqual(severities(ownershipChecks(['src/sim/step.js', 'test/sim.test.js', 'docs/STATUS.md'])), [INFO]);
 assert.deepEqual(severities(ownershipChecks(['src/sim/step.js', 'src/ui/hud.js'])), [FAIL, INFO]);
 assert.deepEqual(severities(ownershipChecks(['src/sim/step.js', 'src/app.js'])), [WARN, INFO]);
 assert.deepEqual(severities(ownershipChecks(['src/core/contracts.js', 'src/core/events.js'])), [FAIL, INFO]);
 assert.deepEqual(severities(ownershipChecks(['src/core/contracts.js', 'test/contracts.test.js'])), [INFO]);
});

test('the ownership list matches the "Who owns what" table in AGENTS.md', () => {
 const agents = read('AGENTS.md');
 const table = agents.slice(agents.indexOf('## Who owns what'), agents.indexOf('## Code rules'));
 const rows = [...table.matchAll(/^\| (S\d|Shared)[^|]*\| (.*) \|$/gm)];
 assert.ok(rows.length >= 6, 'found the table');
 const listed = rows.map(([, owner, cell]) => [owner, [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1])]);
 const count = {};
 for (const [, paths] of listed) for (const p of paths) count[p] = (count[p] || 0) + 1;
 for (const [owner, paths] of listed) {
  for (const p of paths) {
   if (count[p] > 1 || p === 'docs/') continue; // `src/view/` is named by S3 (its rider files) and S4
   const sample = p.endsWith('/') ? p + 'x.js' : p;
   assert.equal(ownerOf(sample), owner, `${p} belongs to ${owner} in AGENTS.md`);
  }
 }
});

const TEMPLATE = '**Package:** <!-- id -->\n\n**Behaviour changes:**\n\n**Screenshots:** <!-- shots -->\n\n' +
 '**Checklist**\n- [ ] `npm test` passes\n';

test('a section reads up to the next heading, without comments', () => {
 const body = '**Package:** <!-- id --> S2/F5\n\n**Behaviour changes:**\nnone\n\n**Checklist**\n- [x] ok';
 assert.equal(sectionText(body, 'Package'), 'S2/F5');
 assert.equal(sectionText(body, 'Behaviour changes'), 'none');
 assert.equal(sectionText(body, 'Screenshots'), null);
 assert.equal(sectionText('**Behaviour changes** (at 15 m/s):\n| a |', 'Behaviour changes'), '(at 15 m/s):\n| a |');
});

test('the template check wants a package-id title and every section filled; screenshots only for the look', () => {
 const good = '**Package:** S2\n\n**Behaviour changes:** none\n\n**Screenshots:**\n\n**Checklist**\n- [x] `npm test`';
 assert.deepEqual(templateChecks('F5: brake skid', good, TEMPLATE, ['src/sim/brake.js']), []);
 const look = templateChecks('F5: brake skid', good, TEMPLATE, ['src/view/draw.js']);
 assert.deepEqual(severities(look), [WARN]);
 const bad = templateChecks('fix brake', TEMPLATE, TEMPLATE, ['src/sim/brake.js']);
 assert.deepEqual(severities(bad), [WARN, FAIL, FAIL, WARN]);
 assert.match(texts(bad), /not `<package id>: <what>`/);
 assert.match(texts(bad), /1 checklist item/);
});

test('a round PR joins streams and updates STATUS without findings, and is checked on the round template', () => {
 assert.ok(isRound('Round 4: El Tarter rides'));
 assert.ok(!isRound('F5: brake skid'));
 assert.ok(!isRound('Round four'));
 const changed = ['src/sim/step.js', 'src/ui/hud.js', 'src/core/contracts.js', 'docs/STATUS.md'];
 assert.deepEqual(severities(ownershipChecks(changed, { round: true })), [INFO]);
 assert.match(texts(ownershipChecks(changed, { round: true })), /round PR, streams joined: S1 \(1\), S2 \(1\)/);
 assert.deepEqual(statusCheck(['src/sim/step.js', 'docs/STATUS.md'], { round: true }), []);
 const round = read('.github/round_pr_template.md');
 for (const s of ['Packages', 'What changed', 'What to test (iPad)', 'Owner verdicts needed', 'Debt']) {
  assert.ok(templateSections(round).includes(s), `round template has **${s}:**`);
 }
 const body = templateSections(round).map((s) => `**${s}:** filled`).join('\n\n') + '\n- [x] done';
 assert.deepEqual(templateChecks('Round 4: El Tarter rides', body, round, changed), []);
});

test('the real PR template has the sections the check expects', () => {
 const template = read('.github/pull_request_template.md');
 for (const s of ['Package', 'Behaviour changes', 'Test changes', 'Try in the preview (iPad)', 'Screenshots']) {
  assert.ok(template.includes(`**${s}:**`), s);
 }
});

test('docs and style: code map, header, area tags, spec version, tunable units, long lines', () => {
 const files = {
  'AGENTS.md': '| Brake | `src/sim/brake.js` |',
  'src/sim/brake.js': '// The brake.\n',
  'src/sim/flip.js': 'export const x = 1;\n',
  'test/brake.test.js': '// @areas sim\n// The brake.\n',
  'test/flip.test.js': '// Flips, untagged.\n',
 };
 const read = (f) => files[f] ?? null;
 const diffFiles = parseDiff([
  diffOf('src/core/config.js', [], ['export const BRAKE_MAX = 3;', 'export const BRAKE_MIN = 1; // m/s²']),
  diffOf('src/sim/flip.js', [], ['x'.repeat(121)]),
  diffOf('art/gresca-hanga-spec.js', [], ["  version: '1.5.0',"]),
 ].join('\n'));
 const changed = ['src/core/config.js', 'src/sim/flip.js', 'src/sim/brake.js', 'art/gresca-hanga-spec.js',
  'test/brake.test.js', 'test/flip.test.js'];
 const added = ['src/sim/brake.js', 'src/sim/flip.js', 'test/brake.test.js', 'test/flip.test.js'];
 const out = texts(docsAndStyleChecks({ added, changed, diffFiles, read }));
 assert.match(out, /new `src\/sim\/flip\.js` is not in the AGENTS\.md code map/);
 assert.match(out, /new `src\/sim\/flip\.js` has no one-line header comment/);
 assert.doesNotMatch(out, /brake\.js` (is not|has no)/);
 assert.match(out, /new `test\/flip\.test\.js` has no valid area tag/);
 assert.doesNotMatch(out, /brake\.test\.js/);
 assert.match(out, /spec v1\.5\.0 has no `docs\/art\/HANGA-v1\.5\.0\.md`/);
 assert.match(out, /config\.js:10` tunable without a unit comment/);
 assert.doesNotMatch(out, /config\.js:11`/);
 assert.match(out, /1 new line\(s\) over 120 characters: `src\/sim\/flip\.js:10`/);
});

test('a re-recorded golden hash and changed fixtures are called out', () => {
 const d = parseDiff(diffOf('test/golden.test.js', ["const GOLDEN_HASH = 'aa';"], ["const GOLDEN_HASH = 'bb';"]));
 const out = behaviourChecks(['test/golden.test.js', 'test/fixtures/traces/carve.json'], d);
 assert.deepEqual(severities(out), [WARN, WARN]);
 assert.deepEqual(severities(behaviourChecks(['src/sim/step.js'], {})), [INFO]);
 const animLines = (h) => [`const GOLDEN_ANIM_HASH = '${h}';`];
 const anim = parseDiff(diffOf('test/golden.test.js', animLines('aa'), animLines('bb')));
 const animOut = texts(behaviourChecks(['test/golden.test.js'], anim));
 assert.match(animOut, /anim hash re-recorded/);
 assert.match(animOut, /sim hash unchanged/);
 assert.doesNotMatch(animOut, /sim hash re-recorded/);
});

test('the smoke findings tell new problems from ones also on main', () => {
 assert.deepEqual(severities(smokeFindings(null)), [FAIL]);
 const ok = smokeFindings({ head: { problems: [], state: { phase: 'run', speed: 9, dx: 3, dy: 20 } } });
 assert.ok(ok.every(([s]) => s === INFO));
 const bad = smokeFindings({
  head: { problems: ['page error: x', 'HTTP 404 /a.js'], state: { phase: 'ready', speed: 0, dx: 0, dy: 0 } },
  base: { problems: ['HTTP 404 /a.js'] },
 });
 assert.deepEqual(severities(bad).slice(0, 3), [FAIL, WARN, FAIL]);
 assert.deepEqual(severities(smokeFindings({ head: { problems: [], error: 'timeout' } })).slice(0, 1), [FAIL]);
});

test('the report leads with the worst finding and lists moved assert counts', () => {
 const sections = [['A', [[INFO, 'fine'], [FAIL, 'broken']]], ['B', []]];
 const md = renderReport(sections, [['test/a.test.js', 2, 1]], '<!-- m -->');
 const lines = md.split('\n');
 assert.equal(lines[0], '<!-- m -->');
 assert.match(lines[1], /❌ 1 to explain/);
 assert.ok(md.indexOf('broken') < md.indexOf('fine'));
 assert.ok(!md.includes('**B**'));
 assert.match(md, /\| `test\/a\.test\.js` \| 2 \| 1 \|/);
});

test('code map: a row in the folder AGENTS.md counts; STATUS belongs to the coordinator', () => {
 assert.deepEqual(codeMapFiles('src/view/gl/a.js'),
  ['AGENTS.md', 'docs/ARCHITECTURE.md', 'src/AGENTS.md', 'src/view/AGENTS.md', 'src/view/gl/AGENTS.md']);
 const files = { 'src/sim/AGENTS.md': '| Flips | `src/sim/flip.js` |', 'src/sim/flip.js': '// Flips.\n' };
 const read = (f) => files[f] ?? null;
 const run = (changed) => texts(docsAndStyleChecks({ added: ['src/sim/flip.js'], changed, diffFiles: {}, read }));
 assert.doesNotMatch(run(['src/sim/flip.js']), /code map/);
 assert.match(texts(docsAndStyleChecks({ added: ['src/ui/x.js'], changed: [], diffFiles: {}, read })),
  /add a row to `src\/ui\/AGENTS\.md`/);
 assert.match(run(['src/sim/flip.js', 'docs/STATUS.md']), /`docs\/STATUS\.md` is the coordinator's: a S2 PR/);
 assert.deepEqual(statusCheck(['src/core/contracts.js', 'docs/STATUS.md']), []);
 assert.deepEqual(statusCheck(['src/sim/step.js']), []);
});
