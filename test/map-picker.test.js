// @areas ui
// The menu's map picker: lists the catalog, marks the loaded map, asks env.openMap to reload into another, and keeps the
// credits and ODbL attribution one tap away on a real map.
import fs from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load, GAME } from './harness.js';
import { loadMapSteps } from '../src/world/map-loader.js';

const read = (f) => fs.readFileSync(new URL('../maps/' + f, import.meta.url), 'utf8');
const realWorld = () => {
 const steps = loadMapSteps(read('el-tarter.terrain.json'), read('el-tarter.course.json'));
 for (;;) {
  const s = steps.next();
  if (s.done) return s.value;
 }
};
const click = (g, id) => g.el('maps').fire('click', { target: { dataset: { map: id } } });

describe('map picker (menu)', () => {
 it('lists the catalog and not the test slope', async () => {
  const g = await load({ map: 'play' });
  const html = g.el('maps').innerHTML;
  for (const id of ['play', 'el-tarter']) assert.ok(html.includes('data-map="' + id + '"'), id);
  assert.ok(!html.includes('"test"'));
  assert.ok(html.includes('Play mountain') && html.includes('El Tarter · Àliga'));
  assert.ok(fs.readFileSync(GAME, 'utf8').includes('id="maps"'));
 });

 it('marks the play mountain as loaded, with a stylized line and no credits toggle', async () => {
  const g = await load({ map: 'play', openMap: () => {} });
  assert.match(g.el('maps').innerHTML, /data-map="play" aria-pressed="true"/);
  assert.match(g.el('maps').innerHTML, /data-map="el-tarter" aria-pressed="false"/);
  assert.match(g.el('map-line').textContent, /^Stylized terrain/);
  assert.equal(g.el('cr').hidden, true);
 });

 it('picking another map calls env.openMap with its id; picking the loaded one does not', async () => {
  const opened = [];
  const g = await load({ map: 'play', openMap: (id) => opened.push(id) });
  click(g, 'play');
  click(g, 'nonsense');
  assert.deepEqual(opened, []);
  click(g, 'el-tarter');
  assert.deepEqual(opened, ['el-tarter']);
 });

 it('on El Tarter: the map is marked, the run and difficulty show, and the credits and ODbL are one tap away', async () => {
  const opened = [];
  const g = await load({ world: realWorld(), openMap: (id) => opened.push(id) });
  assert.match(g.el('maps').innerHTML, /data-map="el-tarter" aria-pressed="true"/);
  assert.match(g.el('maps').innerHTML, /data-map="play" aria-pressed="false"/);
  assert.match(g.el('map-line').textContent, /Àliga · \w+\. .*OpenStreetMap contributors \(ODbL\)/);
  assert.equal(g.el('cr').hidden, false);
  assert.equal(g.el('credits').hidden, true);
  g.el('cr').fire('click');
  assert.equal(g.el('credits').hidden, false);
  assert.equal(g.el('cr').attrs['aria-expanded'], 'true');
  assert.match(g.el('credits-text').textContent, /OpenStreetMap contributors \(ODbL\)/);
  assert.match(g.el('credits-text').textContent, /Terrain Tiles/);
  assert.ok(fs.readFileSync(GAME, 'utf8').includes('opendatacommons.org/licenses/odbl'));
  click(g, 'play');
  assert.deepEqual(opened, ['play']);
 });

 it('leaves tap-to-start and the rig and stance pickers alone', async () => {
  const g = await load({ map: 'play' });
  assert.equal(g.el('go').hidden, false);
  g.el('ps').fire('click');
  assert.equal(g.state().rig, 'ski');
  g.el('sg').fire('click');
  assert.equal(g.state().stance, 'goofy');
  assert.equal(g.run("localStorage.getItem('gresca-rig')"), 'ski');
  assert.equal(g.run("localStorage.getItem('gresca-stance')"), 'goofy');
 });
});
