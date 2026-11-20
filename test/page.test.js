// The page: index.html is only HTML and CSS. It loads the art modules as classic <script src> tags, then the game as
// one native ES module entry, src/main.js, which reaches every other file in src/ through static imports
// (ADR 0001, ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.join(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// The art modules, in load order: classic scripts, because they are UMD files that define HANGA and RiderAnim.
const ART = ['art/gresca-hanga-spec.js', 'art/gresca-rider-anim.js'];
const ENTRY = 'src/main.js';

const tags = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1] || '', body: m[2] }));
const srcs = tags.map((t) => (/\ssrc="([^"]+)"/.exec(t.attrs) || [])[1]);
const listJs = (dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).filter((f) => f.endsWith('.js'))
  .map((f) => `${dir}/${f.split(path.sep).join('/')}`).sort();

// Code with comments and the inside of string and template literals blanked out (no regex literals in src/).
export function codeOnly(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      out += c;
      for (i++; i < src.length && src[i] !== c; i++) { if (src[i] === '\\') i++; if (src[i] === '\n') out += '\n'; }
      out += c; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

// The relative specifiers of a module's static imports (and re-exports): import ... from './x.js', import './x.js'.
function staticImports(src) {
  return [...src.matchAll(/^\s*(?:import|export)\s(?:[^'"]*?\sfrom\s)?\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

test('index.html has no inline script code', () => {
  assert.ok(tags.length > 0, 'no <script> tags');
  tags.forEach((t, i) => {
    assert.ok(srcs[i], `<script${t.attrs}> has no src`);
    assert.equal(t.body.trim(), '', `<script src="${srcs[i]}"> has inline code`);
  });
  // every <script must be one of the tags above (no unclosed or oddly written ones)
  assert.equal((html.match(/<script\b/gi) || []).length, tags.length);
});

test('the art modules come first as classic scripts, then exactly one module entry, src/main.js', () => {
  assert.deepEqual(srcs, [...ART, ENTRY]);
  tags.slice(0, ART.length).forEach((t) => assert.doesNotMatch(t.attrs, /\b(type|defer|async)\b/, `<script${t.attrs}>`));
  assert.match(tags[ART.length].attrs, /^\s*type="module"\s+src="src\/main\.js"\s*$/);
  assert.deepEqual(listJs('art'), [...ART].sort(), 'art/ holds exactly the files the page loads');
});

test('every <script src> exists', () => {
  for (const s of srcs) assert.ok(fs.existsSync(path.join(ROOT, s)), `${s} is missing`);
});

test('every module in src/ is reached from src/main.js through static imports, and every import exists', () => {
  const seen = new Set(), todo = [ENTRY];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of staticImports(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
      assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${f} imports ${spec}: src/ imports only its own files`);
      assert.ok(spec.endsWith('.js'), `${f} imports ${spec}: give the file extension (the browser needs it)`);
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
      assert.ok(target.startsWith('src/'), `${f} imports ${spec}, outside src/`);
      assert.ok(fs.existsSync(path.join(ROOT, target)), `${f} imports ${spec}, which does not exist`);
      todo.push(target);
    }
  }
  assert.deepEqual([...seen].sort(), listJs('src'), 'a file in src/ that main.js does not reach is an orphan');
});

test('the import scanner finds static imports and re-exports', () => {
  assert.deepEqual(staticImports("import { a } from './a.js';\nimport * as b from \"../b.js\";\nimport './c.js';\n" +
    "export { d } from './d.js';\nconst x = 'import y from \"./no.js\"';"), ['./a.js', '../b.js', './c.js', './d.js']);
});

// ---- module rules (ADR 0002) ----
const BROWSER = ['window', 'document', 'HANGA', 'RiderAnim', 'localStorage', 'requestAnimationFrame', 'setTimeout',
  'setInterval', 'devicePixelRatio', 'addEventListener', 'globalThis', 'self', 'navigator', 'location'];
// Uses of BROWSER names as free identifiers: not a property (after a dot), not an object key (before a colon).
export function browserGlobals(src) {
  const code = codeOnly(src), found = [];
  const re = new RegExp(`(?<![\\w$.])(${BROWSER.join('|')})(?![\\w$])(?!\\s*:)`, 'g');
  for (const m of code.matchAll(re)) found.push(`line ${code.slice(0, m.index).split('\n').length}: ${m[1]}`);
  return found;
}

// Top-level declarations that hold mutable state: let/var, and a const made from [..], {..} or new X() without
// Object.freeze(...). (A const function, number, string or frozen object is fine.)
export function moduleState(src) {
  const code = codeOnly(src), found = [];
  let depth = 0;
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    if (depth === 0) {
      const m = /^(?:export\s+)?(let|var|const)\s+(?:[\w$]+|\{[^}]*\}|\[[^\]]*\])\s*=\s*(.*)$/.exec(line);
      if (m && m[1] !== 'const') found.push(`line ${i + 1}: top-level ${m[1]}`);
      else if (m && /^(\[|\{|new\s)/.test(m[2].trim())) found.push(`line ${i + 1}: top-level const holding a mutable ${m[2].trim()[0] === 'n' ? 'object' : 'container'}`);
    }
    for (const c of line) { if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; }
  });
  return found;
}

test('the scanners find browser globals and module state, and ignore properties, keys and locals', () => {
  assert.deepEqual(browserGlobals("const a = document.getElementById('c'); if (window) setTimeout(f);"),
    ['line 1: document', 'line 1: window', 'line 1: setTimeout']);
  assert.deepEqual(browserGlobals("const d = env.document, h = env.HANGA; const o = { localStorage: 1 }; // window\n"), []);
  assert.deepEqual(moduleState('let n = 0;\nexport const parts = [];\nconst cache = new Map();\nconst o = {a: 1};\n'),
    ['line 1: top-level let', 'line 2: top-level const holding a mutable container', 'line 3: top-level const holding a mutable object',
      'line 4: top-level const holding a mutable container']);
  assert.deepEqual(moduleState('const A = Object.freeze([1]);\nexport const f = (x) => x;\nexport function g() {\n let t = [];\n}\n'), []);
});

test('only src/main.js reads browser globals or the art modules; every other module gets them through env', () => {
  for (const f of listJs('src')) {
    if (f === ENTRY) continue;
    assert.deepEqual(browserGlobals(fs.readFileSync(path.join(ROOT, f), 'utf8')), [], `${f} reads a browser global`);
  }
  assert.ok(browserGlobals(fs.readFileSync(path.join(ROOT, ENTRY), 'utf8')).length > 0, 'main.js builds env from the browser');
});

test('no module holds state: no top-level let/var or unfrozen containers, and every export is a function, a ' +
  'primitive or deeply frozen', async () => {
  const deepFrozen = (v, seen = new Set()) => {
    if (v === null || typeof v !== 'object' || seen.has(v)) return true;
    seen.add(v);
    return Object.isFrozen(v) && Object.values(v).every((w) => deepFrozen(w, seen));
  };
  for (const f of listJs('src')) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.deepEqual(moduleState(src), [], `${f} holds module-level state`);
    if (f === ENTRY) continue; // runs the game on import, in a browser
    const mod = await import(pathToFileURL(path.join(ROOT, f)).href);
    for (const [name, v] of Object.entries(mod))
      assert.ok(typeof v === 'function' || deepFrozen(v), `${f} exports ${name}, which is mutable`);
  }
});
