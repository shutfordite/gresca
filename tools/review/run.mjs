// Runs the mechanical PR checks (tools/review/checks.mjs) on this checkout against a base and prints the report.
// Usage: node tools/review/run.mjs [--base origin/main] [--smoke smoke.json] [--out report.md]
// The PR title and body come from $GITHUB_EVENT_PATH in CI, or --title and --body-file locally (else the template
// check is skipped). Reads git only; needs the base's history (CI checks out with fetch-depth 0).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
 assertionChecks, behaviourChecks, docsAndStyleChecks, FAIL, INFO, ownershipChecks, parseDiff, renderReport,
 templateChecks, WARN,
} from './checks.mjs';
import { smokeFindings } from './smoke-report.mjs';

export const MARKER = '<!-- gresca-pr-check -->';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const show = (ref, file) => {
 try {
  return git('show', `${ref}:${file}`);
 } catch {
  return null;
 }
};

function arg(name, fallback = null) {
 const i = process.argv.indexOf('--' + name);
 return i > 0 ? process.argv[i + 1] : fallback;
}

/** The PR's title and body: from the CI event, else from the command line. */
function pullRequest() {
 const event = process.env.GITHUB_EVENT_PATH;
 if (event && fs.existsSync(event)) {
  const pr = JSON.parse(fs.readFileSync(event, 'utf8')).pull_request;
  if (pr) return { title: pr.title || '', body: pr.body || '' };
 }
 const bodyFile = arg('body-file');
 const title = arg('title');
 if (title === null && !bodyFile) return null;
 return { title: title || '', body: bodyFile ? fs.readFileSync(bodyFile, 'utf8') : '' };
}

/** Every test file's source at a ref: {path: source}. */
function testFiles(ref) {
 const names = git('ls-tree', '-r', '--name-only', ref, 'test/').split('\n').filter((f) => /\.test\.m?js$/.test(f));
 return Object.fromEntries(names.map((f) => [f, show(ref, f)]));
}

/** Builds the report for HEAD against the merge base with `base`. */
export function buildReport(base) {
 const mb = git('merge-base', base, 'HEAD').trim();
 const status = git('diff', '--name-status', '-M', mb, 'HEAD').trim().split('\n').filter(Boolean)
  .map((l) => l.split('\t'));
 const changed = status.map((s) => s[s.length - 1]);
 const added = status.filter((s) => s[0] === 'A').map((s) => s[1]);
 const diffFiles = parseDiff(git('diff', '-U0', '-M', mb, 'HEAD'));
 const read = (f) => show('HEAD', f);
 const asserts = assertionChecks(testFiles(mb), testFiles('HEAD'), diffFiles);
 const sections = [
  ['Tests and asserts', asserts.findings.length ? asserts.findings : [[INFO, 'no assert removed, skipped or altered']]],
  ['Behaviour proof', behaviourChecks(changed, diffFiles)],
  ['Ownership', ownershipChecks(changed)],
 ];
 const pr = pullRequest();
 const template = read('.github/pull_request_template.md') || '';
 if (pr) {
  const found = templateChecks(pr.title, pr.body, template, changed);
  sections.push(['Title and template', found.length ? found : [[INFO, 'title and every template section filled in']]]);
 }
 const packageJson = read('package.json');
 sections.push(['Docs and style', docsAndStyleChecks({ added, changed, diffFiles, read, packageJson })]);
 const smoke = arg('smoke');
 if (smoke) {
  const result = fs.existsSync(smoke) ? JSON.parse(fs.readFileSync(smoke, 'utf8')) : null;
  sections.push(['Browser smoke test', smokeFindings(result)]);
 }
 const counts = sections.flatMap(([, f]) => f).reduce((n, [s]) => ({ ...n, [s]: (n[s] || 0) + 1 }), {});
 return { markdown: renderReport(sections, asserts.rows, MARKER), fails: counts[FAIL] || 0, warns: counts[WARN] || 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
 const report = buildReport(arg('base', 'origin/main'));
 const out = arg('out');
 if (out) fs.writeFileSync(out, report.markdown + '\n');
 if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.markdown + '\n');
 process.stdout.write(report.markdown + '\n');
}
