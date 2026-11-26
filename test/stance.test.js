// The Regular / Goofy stance picker in the menu: shown for the snowboard only, saved under gresca-stance.
import fs from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load, GAME } from './harness.js';

const saved = (h) => h.run("localStorage.getItem('gresca-stance')");

describe('stance picker (menu)', () => {
 it('has two options in the markup, Regular selected, and shows only for the snowboard', async () => {
  const html = fs.readFileSync(GAME, 'utf8');
  assert.ok(html.includes('id="sr"') && html.includes('id="sg"'));
  const h = await load();
  assert.equal(h.state().stance, 'regular');
  assert.equal(h.el('stance').hidden, false);
  assert.ok(h.el('sr').classList.contains('on'));
  h.el('ps').fire('click');
  assert.equal(h.el('stance').hidden, true);
  h.el('pb').fire('click');
  assert.equal(h.el('stance').hidden, false);
 });

 it('choosing Goofy sets session.stance and saves it', async () => {
  const h = await load();
  h.el('sg').fire('click');
  assert.equal(h.state().stance, 'goofy');
  assert.equal(saved(h), 'goofy');
  assert.ok(h.el('sg').classList.contains('on'));
  assert.ok(!h.el('sr').classList.contains('on'));
  h.el('sr').fire('click');
  assert.equal(h.state().stance, 'regular');
  assert.equal(saved(h), 'regular');
 });

 it('reads the saved stance back on load and shows it on the buttons', async () => {
  const h = await load({ store: { 'gresca-stance': 'goofy' } });
  assert.equal(h.state().stance, 'goofy');
  assert.ok(h.el('sg').classList.contains('on'));
  assert.ok(!h.el('sr').classList.contains('on'));
 });

 it('falls back to regular when storage is blocked, and still switches for the visit', async () => {
  const h = await load({ blockedStorage: true });
  assert.equal(h.state().stance, 'regular');
  h.el('sg').fire('click');
  assert.equal(h.state().stance, 'goofy');
 });

 it('keeps the choice when switching to Skis and back', async () => {
  const h = await load();
  h.el('sg').fire('click');
  h.el('ps').fire('click');
  assert.equal(h.state().stance, 'goofy');
  h.el('pb').fire('click');
  assert.equal(h.state().stance, 'goofy');
  assert.ok(h.el('sg').classList.contains('on'));
  assert.equal(saved(h), 'goofy');
 });
});
