// The Controls screen is generated from the bindings table (src/input/bindings.js), so every control is on it and the
// help cannot drift from the code. Also: the menu still starts on tap, and the rig and stance storage is untouched.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load, GAME } from './harness.js';

const g = await load();
const table = g.state().bindings;
const screen = () => g.el('ctl-body').innerHTML;
// The visible text of the screen's HTML (tags dropped, the few entities it uses decoded).
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const keycaps = (row) => row.keys.map((k) => ({ ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up',
 ArrowDown: 'Down', Escape: 'Esc' }[k] || k.toUpperCase()));

describe('Controls screen', () => {
 it('has a Touch and a Keyboard section, in that order', () => {
  const html = screen();
  const touch = html.indexOf('<h2>Touch</h2>');
  const keyboard = html.indexOf('<h2>Keyboard</h2>');
  assert.ok(touch > 0 && keyboard > touch);
 });

 it('shows every binding in the table, once, in its section, with its label', () => {
  const html = screen();
  const split = html.indexOf('<h2>Keyboard</h2>');
  const rows = [...html.matchAll(/<li class="ctl-row" data-device="(\w+)" data-action="([\w-]+)">(.*?)<\/li>/g)];
  assert.equal(rows.length, table.length);
  for (const row of table) {
   const found = rows.filter((m) => m[1] === row.device && m[2] === row.action);
   assert.equal(found.length, 1, row.device + ' ' + row.action);
   assert.ok(text(found[0][3]).includes(row.label), row.label);
   const inSection = found[0].index > split;
   assert.equal(inSection, row.device === 'keyboard', row.device + ' ' + row.action + ' is in the wrong section');
  }
 });

 it('names every key of every keyboard row, and draws every touch gesture', () => {
  const html = screen();
  for (const row of table.filter((b) => b.device === 'keyboard')) {
   const li = html.match(new RegExp('data-device="keyboard" data-action="' + row.action + '">(.*?)</li>'))[1];
   for (const cap of keycaps(row)) assert.ok(li.includes('<kbd>' + cap + '</kbd>'), row.action + ' key ' + cap);
  }
  for (const row of table.filter((b) => b.device === 'touch')) {
   const li = html.match(new RegExp('data-device="touch" data-action="' + row.action + '">(.*?)</li>'))[1];
   assert.ok(li.includes('<svg class="ctl-fig"'), row.action + ' has a diagram');
   assert.ok(/Hold|Swipe|Tap/.test(text(li)), row.action + ' says what to do');
  }
 });

 it('opens from the Controls button, closes with Back, and the menu comes back', () => {
  assert.match(fs.readFileSync(GAME, 'utf8'), /id="ctl" hidden/, 'the page starts with the screen closed');
  g.el('cb').fire('click');
  assert.equal(g.el('ctl').hidden, false);
  assert.equal(g.el('menu').hidden, true);
  g.el('cc').fire('click');
  assert.equal(g.el('ctl').hidden, true);
  assert.equal(g.el('menu').hidden, false);
 });

 it('the page has the button, the screen and the Back button; touch targets are at least 44 px', () => {
  const html = fs.readFileSync(GAME, 'utf8');
  for (const id of ['menu', 'cb', 'ctl', 'ctl-body', 'cc']) assert.ok(html.includes('id="' + id + '"'), id);
  const css = fs.readFileSync(path.join(path.dirname(GAME), 'styles', 'menu.css'), 'utf8');
  for (const sel of ['#cb,#cc{', '#go{', '.pick button{']) {
   const rule = css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
   assert.match(rule, /min-height:44px/, sel);
  }
 });

 it('has no hard-coded colour in the generated markup', () => {
  assert.doesNotMatch(screen(), /#[0-9a-fA-F]{3,8}\b|rgba?\(|fill="|stroke="/);
 });
});

describe('the menu around it', () => {
 it('still starts the run on a tap of Drop in, with the Controls screen closed', () => {
  g.el('cb').fire('click');
  g.el('cc').fire('click');
  g.set({ phase: 'ready' });
  g.el('go').fire('click');
  assert.equal(g.state().phase, 'run');
  assert.equal(g.el('msg').hidden, true);
 });

 it('keeps the Snowboard / Skis picker and its gresca-rig storage key', async () => {
  const h = await load();
  h.el('cb').fire('click');
  h.el('ps').fire('click');
  assert.equal(h.state().rig, 'ski');
  assert.equal(h.run("localStorage.getItem('gresca-rig')"), 'ski');
  h.el('pb').fire('click');
  assert.equal(h.run("localStorage.getItem('gresca-rig')"), 'board');
  const saved = await load({ store: { 'gresca-rig': 'ski', 'gresca-stance': 'goofy' } });
  assert.equal(saved.state().rig, 'ski');
  assert.equal(saved.state().stance, 'goofy');
 });
});
