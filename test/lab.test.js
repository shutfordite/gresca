// The look lab (lab.html, P4): the page loads the art modules and then one module that imports createLab(), and
// createLab() draws every sheet through the Look with no errors, setting only real colours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createLab } from '../src/view/look/lab.js';
import { isColour } from '../src/view/look/look.js';

const require = createRequire(import.meta.url);
const ROOT = path.join(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'lab.html'), 'utf8');

// A 2D context that accepts every call and records the fill and stroke styles it is given.
function stubCtx(styles, counts) {
 const gradient = { addColorStop: (o, c) => styles.push(c) };
 const ctx = { createLinearGradient: () => gradient };
 return new Proxy(ctx, {
  get: (t, k) => (k in t ? t[k] : () => { counts.calls++; }),
  set: (t, k, v) => {
   if ((k === 'fillStyle' || k === 'strokeStyle') && v !== gradient) styles.push(v);
   t[k] = v;
   return true;
  },
 });
}

function stubDocument(styles, counts) {
 const el = (tag) => ({
  tag, style: {}, children: [], textContent: '',
  appendChild(c) { this.children.push(c); },
  getContext: () => stubCtx(styles, counts),
 });
 return {
  body: el('body'),
  createElement: el,
  documentElement: { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } },
 };
}

test('lab.html loads the art modules, then one module that imports the lab, and every file exists', () => {
 const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
 assert.deepEqual(srcs, ['art/gresca-hanga-spec.js', 'art/gresca-rider-anim.js']);
 const mods = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
 assert.equal(mods.length, 1);
 const imports = [...mods[0].matchAll(/from '([^']+)'/g)].map((m) => m[1]);
 assert.deepEqual(imports, ['./src/view/look/lab.js']);
 for (const f of [...srcs, imports[0]]) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
 const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'preview.yml'), 'utf8');
 assert.ok(/^\s*SITE:.*\blab\.html\b/m.test(yml), 'SITE in preview.yml publishes lab.html');
});

test('createLab draws every sheet through the Look, with real colours only', () => {
 const styles = [];
 const counts = { calls: 0 };
 const doc = stubDocument(styles, counts);
 const look = createLab({
  document: doc, devicePixelRatio: 2,
  HANGA: require('../art/gresca-hanga-spec.js'), RiderAnim: require('../art/gresca-rider-anim.js'),
 });
 const canvases = doc.body.children.filter((c) => c.tag === 'canvas');
 assert.equal(canvases.length, 6, 'ski, board, goofy board, terrain, sprites, palette');
 assert.deepEqual(doc.documentElement.style.props, { ...look.ui });
 assert.ok(counts.calls > 10000, `only ${counts.calls} drawing calls`);
 assert.deepEqual(styles.filter((s) => !isColour(s)).slice(0, 5), []);
 for (const role of look.roles) assert.ok(styles.includes(look.colour(role)), 'the palette sheet shows ' + role);
});
