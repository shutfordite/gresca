'use strict';
// The page: index.html is only HTML and CSS, and loads the art modules and then the game's src/ files with plain
// classic <script src> tags, in the order below (ADR 0001). Classic scripts share one set of globals and run in page
// order, so the order is part of the game: a file may only use, at load time, what an earlier file declares.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// The load order. Adding a file to art/ or src/ means adding it here, in the place it must run.
const ORDER = [
  'art/gresca-hanga-spec.js',
  'art/gresca-rider-anim.js',
  'src/config.js',
  'src/terrain.js',
  'src/world.js',
  'src/dom.js',
  'src/camera.js',
  'src/build.js',
  'src/sim.js',
  'src/park.js',
  'src/step.js',
  'src/input.js',
  'src/menu.js',
  'src/sprites.js',
  'src/rider-view.js',
  'src/draw.js',
  'src/app.js',
  'src/debug.js',
];

const tags = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1] || '', body: m[2] }));
const srcs = tags.map((t) => (/\ssrc="([^"]+)"/.exec(t.attrs) || [])[1]);

test('index.html has no inline script code', () => {
  assert.ok(tags.length > 0, 'no <script> tags');
  tags.forEach((t, i) => {
    assert.ok(srcs[i], `<script${t.attrs}> has no src`);
    assert.equal(t.body.trim(), '', `<script src="${srcs[i]}"> has inline code`);
  });
  // every <script must be one of the tags above (no unclosed or oddly written ones)
  assert.equal((html.match(/<script\b/gi) || []).length, tags.length);
});

test('scripts are plain classic scripts, run in page order', () => {
  for (const t of tags) assert.doesNotMatch(t.attrs, /\b(type|defer|async)\b/, `<script${t.attrs}>`);
});

test('every <script src> exists', () => {
  for (const s of srcs) assert.ok(fs.existsSync(path.join(ROOT, s)), `${s} is missing`);
});

test('loads every file in art/ and src/ exactly once, in order', () => {
  assert.deepEqual(srcs, ORDER);
  const onDisk = ['art', 'src'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`));
  assert.deepEqual([...onDisk].sort(), [...ORDER].sort(), 'art/ and src/ hold exactly the files the page loads');
});
