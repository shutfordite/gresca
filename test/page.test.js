// @areas shared
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

// The look lab (lab.html, P4) is a second page: its one module script imports src/view/look/lab.js, the lab's root.
const LAB_ROOTS = ['src/view/look/lab.js'];
// Modules built ahead of the code that loads them: the map loader (C4a) until the menu uses it (C4b removes this).
const PENDING_ROOTS = ['src/world/map-loader.js'];

test('every module in src/ is reached from src/main.js (or, for the look lab, from lab.html\'s module) through ' +
  'static imports, and every import exists', () => {
  const seen = new Set(), todo = [ENTRY, ...LAB_ROOTS, ...PENDING_ROOTS];
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
  const fromMain = new Set(), walk = [ENTRY];
  while (walk.length) {
    const f = walk.pop();
    if (fromMain.has(f)) continue;
    fromMain.add(f);
    for (const spec of staticImports(fs.readFileSync(path.join(ROOT, f), 'utf8')))
      walk.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), spec)));
  }
  for (const f of LAB_ROOTS) assert.ok(!fromMain.has(f), `${f} is the lab's root: the game must not load it`);
  const pending = new Set(), ahead = [...PENDING_ROOTS];
  while (ahead.length) {
    const f = ahead.pop();
    if (pending.has(f)) continue;
    pending.add(f);
    for (const spec of staticImports(fs.readFileSync(path.join(ROOT, f), 'utf8')))
      ahead.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), spec)));
  }
  const orphans = listJs('src').filter((f) => !fromMain.has(f) && !LAB_ROOTS.includes(f) && !pending.has(f));
  assert.deepEqual(orphans, [], 'only the lab root and the pending roots may be outside what main.js reaches');
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

// ---- styles ----
const links = [...html.matchAll(/<link\b([^>]*)>/gi)].map((m) => m[1]);
const sheets = links.filter((a) => /\brel="stylesheet"/.test(a)).map((a) => (/\bhref="([^"]+)"/.exec(a) || [])[1]);

test('index.html has no inline <style> or style attributes, and links stylesheets from styles/', () => {
  assert.doesNotMatch(html, /<style\b/i, 'CSS goes in styles/');
  assert.doesNotMatch(html, /\sstyle="/i, 'CSS goes in styles/');
  assert.ok(sheets.length > 0, 'no stylesheet linked');
  for (const href of sheets) {
    assert.ok(href && href.startsWith('styles/') && href.endsWith('.css'), `stylesheet ${href} is not in styles/`);
    assert.ok(fs.existsSync(path.join(ROOT, href)), `${href} is missing`);
  }
  const onDisk = fs.readdirSync(path.join(ROOT, 'styles')).filter((f) => f.endsWith('.css')).map((f) => `styles/${f}`).sort();
  assert.deepEqual([...sheets].sort(), onDisk, 'styles/ holds exactly the stylesheets the page links');
});

test('the preview publishes every folder the page loads files from', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'preview.yml'), 'utf8');
  const site = (/^\s*SITE:\s*(.*)$/m.exec(yml) || [])[1].split(/\s+/);
  for (const dir of ['src', 'art', 'styles']) assert.ok(site.includes(dir), `SITE in preview.yml is missing ${dir}`);
});

// G2: the browser finds modules one import level at a time unless the page lists them up front.
const preloads = [...html.matchAll(/<link\s+rel="modulepreload"\s+href="([^"]+)"\s*>/g)].map((m) => m[1]);
const THREE_FILE = 'vendor/three/three.module.js';

function staticGraph(roots) {
  const seen = new Set(), todo = [...roots];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of staticImports(fs.readFileSync(path.join(ROOT, f), 'utf8')))
      todo.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), spec)));
  }
  return [...seen].sort();
}

test('index.html preloads exactly the entry\'s static module tree and three.js, with relative URLs', () => {
  for (const href of preloads) {
    assert.doesNotMatch(href, /^(\/|[a-z]+:)/i, `${href}: a preload URL is relative (preview folders live under a path)`);
    assert.ok(fs.existsSync(path.join(ROOT, href)), `${href} is missing`);
  }
  assert.equal(new Set(preloads).size, preloads.length, 'a module is preloaded twice');
  assert.ok(fs.readFileSync(path.join(ROOT, ENTRY), 'utf8').includes(`import('../${THREE_FILE}')`),
    'main.js imports three.js from ' + THREE_FILE);
  const expected = staticGraph([ENTRY, THREE_FILE]);
  const stale = preloads.filter((p) => !expected.includes(p)), missing = expected.filter((p) => !preloads.includes(p));
  assert.deepEqual({ missing, stale }, { missing: [], stale: [] }, 'keep the modulepreload links in step with the imports');
});

// G2: the boot starts the three.js import before it waits for the map, and each failure keeps its fallback.
test('startLoads starts three.js and then the map before awaiting either, and awaits both', async () => {
  const { startLoads } = await import('../src/core/boot-loads.js');
  const calls = [], gates = {};
  const gate = (name) => new Promise((resolve) => { gates[name] = resolve; });
  const run = startLoads({
    renderer: 'gl', mapId: 'el-tarter', warn: (m) => calls.push('warn ' + m),
    importThree: () => { calls.push('three'); return gate('three'); },
    loadMap: (id) => { calls.push('map ' + id); return gate('map'); },
  });
  assert.deepEqual(calls, ['three', 'map el-tarter'], 'both loads start synchronously, three.js first');
  let done = false;
  run.then(() => { done = true; });
  gates.map('WORLD');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, false, 'the boot waits for three.js too');
  gates.three('THREE');
  assert.deepEqual(await run, { THREE: 'THREE', world: 'WORLD' });
});

test('startLoads skips three.js on the CPU renderer and the map on the play mountain, and keeps the fallbacks', async () => {
  const { startLoads } = await import('../src/core/boot-loads.js');
  const calls = [], warns = [];
  const base = { warn: (m) => warns.push(m), importThree: () => { calls.push('three'); return Promise.resolve('T'); },
    loadMap: () => { calls.push('map'); return Promise.resolve('W'); } };
  assert.deepEqual(await startLoads({ ...base, renderer: 'cpu', mapId: null }), { THREE: null, world: null });
  assert.deepEqual(calls, [], '?renderer=cpu does not load three.js; no map id loads no map');
  const failed = await startLoads({ ...base, renderer: 'gl', mapId: 'x', importThree: () => Promise.reject(new Error('boom')),
    loadMap: () => Promise.resolve(null) });
  assert.deepEqual(failed, { THREE: null, world: null }, 'a three.js failure is null (CPU); a missing map is null (play mountain)');
  assert.match(warns[0], /three\.js did not load \(boom\)/);
});
