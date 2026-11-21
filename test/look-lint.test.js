// Lint for the Look seam (P4): colours live in src/view/look/ only. No hex or rgb() literal and no HANGA in src/
// outside it (main.js and app.js only hand HANGA to the look), and no colour in styles/ outside the :root token
// defaults in styles/base.css, which must equal the Look's ui tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHangaLook } from '../src/view/look/hanga.js';

const require = createRequire(import.meta.url);
const ROOT = path.join(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const LOOK_DIR = 'view/look/';
// Files that may name HANGA, and why: main.js reads it from the browser, app.js passes it to createHangaLook().
const HANGA_PASSERS = ['main.js', 'app.js'];

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RGB_CALL = /\b(?:rgba?|hsla?)\(/;
const NAMES_HANGA = /\bHANGA\b/;

// Every .js file under src/, as a path relative to src/.
const sources = () => fs.readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.js'))
 .map((f) => f.split(path.sep).join('/'));
// A file's code without its comments (line structure kept); strings stay, since colours hide in them.
const code = (src) => src
 .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
 .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

// Lines of src that match re, as 'line N'.
const hits = (src, re) => src.split('\n').flatMap((l, i) => (re.test(l) ? ['line ' + (i + 1)] : []));

test('no hex or rgb() colour literal in src/ outside src/view/look/', () => {
 const bad = [];
 for (const f of sources().filter((f) => !f.startsWith(LOOK_DIR))) {
  const c = code(fs.readFileSync(path.join(SRC, f), 'utf8'));
  for (const h of [...hits(c, HEX), ...hits(c, RGB_CALL)]) bad.push(f + ' ' + h);
 }
 assert.deepEqual(bad, []);
});

test('only src/view/look/ reads HANGA (main.js and app.js only pass it on)', () => {
 const bad = [];
 for (const f of sources().filter((f) => !f.startsWith(LOOK_DIR))) {
  const c = code(fs.readFileSync(path.join(SRC, f), 'utf8'));
  const re = HANGA_PASSERS.includes(f) ? /\bHANGA\s*(?:\.|\[)/ : NAMES_HANGA;
  for (const h of hits(c, re)) bad.push(f + ' ' + h);
 }
 assert.deepEqual(bad, []);
});

// CSS without comments; base.css also without its :root block (the tokens' defaults).
const cssFiles = () => fs.readdirSync(path.join(ROOT, 'styles')).filter((f) => f.endsWith('.css'));
const css = (f) => fs.readFileSync(path.join(ROOT, 'styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rootBlock = (src) => (/:root\s*\{([^}]*)\}/.exec(src) || [])[1];
// The declaration blocks of a stylesheet (selectors such as #go are not colours).
const bodies = (src) => [...src.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);

test('no colour in styles/ outside the :root token defaults in base.css', () => {
 const bad = [];
 for (const f of cssFiles()) {
  const src = f === 'base.css' ? css(f).replace(/:root\s*\{[^}]*\}/, '') : css(f);
  for (const b of bodies(src)) if (HEX.test(b) || RGB_CALL.test(b)) bad.push(f + ': ' + b.trim().slice(0, 60));
 }
 assert.deepEqual(bad, []);
});

test('base.css :root defaults are the Look\'s ui tokens, and styles use only those, without fallbacks', () => {
 const look = createHangaLook(require('../art/gresca-hanga-spec.js'));
 const defaults = Object.fromEntries(rootBlock(css('base.css')).split(';').map((d) => d.trim()).filter(Boolean)
  .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]));
 assert.deepEqual(defaults, { ...look.ui });
 for (const f of cssFiles()) {
  for (const m of css(f).matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
   assert.ok(m[1] in look.ui, `${f} uses ${m[1]}, which the Look's ui does not set`);
   assert.ok(!m[2], `${f}: var(${m[1]}, ...) has a fallback: the default lives in base.css :root`);
  }
 }
});

test('no colour literal in the pages', () => {
 for (const page of ['index.html', 'lab.html']) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  assert.deepEqual([...hits(html, HEX), ...hits(html, RGB_CALL)], [], page);
 }
});

test('the lint catches what it says', () => {
 assert.ok(HEX.test(code(" const POLE = '#3a3f58';")));
 assert.ok(RGB_CALL.test(code(" ctx.fillStyle = `rgb(${r},${g},${b})`;")));
 assert.ok(RGB_CALL.test("ctx.fillStyle = 'rgba(246,248,255,' + a + ')';"));
 assert.ok(!HEX.test(code(' x = 1; // like #ff6b3d')), 'comments do not count');
 assert.ok(NAMES_HANGA.test(code(' const k = env.HANGA.rider.stance.storageKey;')));
 assert.ok(/\bHANGA\s*(?:\.|\[)/.test(' const f = env.HANGA.fogAmount;'));
 assert.ok(!/\bHANGA\s*(?:\.|\[)/.test(' const look = createHangaLook(env.HANGA, env.RiderAnim);'));
 assert.deepEqual(bodies('#go{color:#1b2038}#mini{border:0}').filter((b) => HEX.test(b)), ['color:#1b2038']);
 assert.ok(!HEX.test(bodies('#bad{opacity:.3}')[0]), 'an id selector is not a colour');
});
