// The Look contract (P4, src/view/look/look.js): the Hanga look resolves every role, projects every rig, pose, yaw
// and pitch to finite points, keeps the colour map's tone, reads the camera framing live, and validateLook() rejects
// a broken look. The S3/S4 seam: S4 draws only what Look.rider.project returns.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHangaLook } from '../src/view/look/hanga.js';
import { validateLook, isColour, hexRgb, cssRgb, cssRgba } from '../src/view/look/look.js';
import { load } from './harness.js';

const require = createRequire(import.meta.url);
const HANGA = require('../art/gresca-hanga-spec.js');
const RA = require('../art/gresca-rider-anim.js');
const look = createHangaLook(HANGA, RA);

const YAWS = [0, 45, 90, 135, 180, 225, 270, 315]; // deg
const PITCHES = [null, 6, 20, 45]; // deg the camera looks down; null: the look's default
const STANCES = { ski: ['regular'], board: ['regular', 'goofy'] };

// Every number under v (draw-list points, widths, depths), with its path, and every 'colour' field.
function walk(v, path, nums, colours) {
 if (typeof v === 'number') nums.push([path, v]);
 else if (Array.isArray(v)) v.forEach((w, i) => walk(w, path + '[' + i + ']', nums, colours));
 else if (v && typeof v === 'object') {
  for (const [k, w] of Object.entries(v)) {
   if (k === 'colour') colours.push([path + '.colour', w]);
   walk(w, path + '.' + k, nums, colours);
  }
 }
}

// The draw list's problems: non-finite numbers, item points that are not [x, y], colours the look does not know.
function listProblems(list, where) {
 const bad = [];
 if (!Array.isArray(list) || list.length === 0) return [where + ': empty list'];
 const nums = [];
 const colours = [];
 walk(list, '', nums, colours);
 for (const [p, n] of nums) if (!Number.isFinite(n)) bad.push(where + p + ' = ' + n);
 for (const it of list) {
  for (const pt of it.pts || [it.c]) if (!Array.isArray(pt) || pt.length < 2) bad.push(where + ' ' + it.id + ' point');
 }
 for (const [p, role] of colours) {
  try {
   if (!isColour(look.colour(role))) bad.push(where + p + ' ' + role);
  } catch (e) {
   bad.push(where + p + ' ' + e.message);
  }
 }
 return bad;
}

describe('the Hanga look', () => {
 it('validates, and names its spec version', () => {
  assert.equal(validateLook(look), look);
  assert.equal(look.version, 'hanga-' + HANGA.version);
  assert.ok(Object.isFrozen(look) && Object.isFrozen(look.sprites) && Object.isFrozen(look.sky.stops));
 });

 it('resolves every role to a colour, the spec palette to the spec value, and throws on an unknown role', () => {
  for (const r of look.roles) assert.ok(isColour(look.colour(r)), r + ': ' + look.colour(r));
  for (const [r, hex] of Object.entries(HANGA.palette)) assert.equal(look.colour(r), hex);
  assert.throws(() => look.colour('notARole'), /unknown colour role notARole/);
 });

 it('resolves sky, fog and sprites from the spec where the spec has them', () => {
  assert.deepEqual(look.sky.stops.map((s) => [s[0], s[1]]), HANGA.sky.stops.map((s) => [s[0], HANGA.colour(s[1])]));
  assert.equal(look.sky.sun.colour, HANGA.colour(HANGA.sky.sun.colour));
  assert.equal(look.sky.sun.azimuthDeg, HANGA.maps.procedural.sun.azimuthDeg);
  assert.deepEqual([...look.fog.rgb], HANGA.terrain.fog.rgb);
  assert.equal(look.fog.amount(120, 300), HANGA.fogAmount(120, 300));
  assert.deepEqual([...look.sprites.tree.rgb], hexRgb(look.sprites.tree.colour));
  assert.equal(look.rider.keylineM, HANGA.rider.widths.keyline);
  assert.equal(look.rider.stanceStorageKey, 'gresca-stance');
  assert.deepEqual(look.rider.poses, { ski: HANGA.rider.poseOrder.ski, board: HANGA.rider.poseOrder.board });
 });

 it('projects every rig × pose × 8 yaws × pitches (and both board stances) to finite points and known colours', () => {
  const bad = [];
  let n = 0;
  for (const rig of ['ski', 'board']) {
   for (const pose of look.rider.poses[rig]) {
    for (const yawDeg of YAWS) {
     for (const pitchDeg of PITCHES) {
      for (const stance of STANCES[rig]) {
       const where = `${rig}/${pose}/yaw ${yawDeg}/pitch ${pitchDeg}/${stance}`;
       bad.push(...listProblems(look.rider.project(rig, pose, { yawDeg, pitchDeg, stance }), where));
       n++;
      }
     }
    }
   }
  }
  assert.deepEqual(bad.slice(0, 10), []);
  assert.equal(n, (13 + 11 * 2) * YAWS.length * PITCHES.length);
 });

 it('projects a live animation state exactly as RiderAnim.project does (the game\'s rider)', () => {
  for (const rig of ['ski', 'board']) {
   const s = RA.create(rig);
   for (const yawDeg of YAWS) {
    const got = look.rider.project(rig, s, { yawDeg, pitchDeg: null, stance: 'regular' });
    assert.deepEqual(listProblems(got, rig + ' live'), []);
    assert.deepEqual(got, RA.project(s, yawDeg, null, 'regular'));
   }
   assert.throws(() => look.rider.project(rig === 'ski' ? 'board' : 'ski', s, { yawDeg: 0, pitchDeg: null }),
    /not (ski|board)/);
  }
  const still = createHangaLook(HANGA);
  assert.throws(() => still.rider.project('ski', RA.create('ski'), { yawDeg: 0 }), /needs RiderAnim/);
  assert.ok(still.rider.project('ski', 'ride', { yawDeg: 0, pitchDeg: null }).length > 0, 'named poses need no RA');
 });

 it('keeps the colour map\'s snow tone exactly (shade + sun + groomed, corduroy, mixed toward rock)', () => {
  // The colour map's tone before P4 (view/colour-map.js paintSnow), written out to pin it until D2 replaces it.
  const before = (lit, m, wave, rk) => {
   let r = 170 + lit * 74 + m * 6;
   let g = 168 + lit * 78 + m * 6;
   let b = 214 + lit * 38 + m * 4;
   if (m > 0) {
    const st = 1 + 0.045 * m * wave;
    r *= st;
    g *= st;
    b *= st;
   }
   return [r + (118 - r) * rk, g + (120 - g) * rk, b + (130 - b) * rk];
  };
  const out = [0, 0, 0];
  for (const lit of [0, 0.3, 1]) for (const m of [0, 0.5, 1]) for (const wave of [-1, 0.7]) for (const rk of [0, 0.4]) {
   assert.equal(look.terrainTone(lit, m, wave, rk, out), out);
   assert.deepEqual(out, before(lit, m, wave, rk));
  }
 });

 it('reads the camera framing from the spec at each use (tuning slopeFollow while a game runs)', () => {
  const H = require('../art/gresca-hanga-spec.js');
  const L = createHangaLook(H, RA);
  const tilt = H.camera.slopeFollow.tilt;
  try {
   assert.equal(L.camera.partialPitchDeg(-10, -30), H.cameraPitch(-10, -30, Infinity, 0));
   H.camera.slopeFollow.tilt = 1;
   assert.equal(L.camera.partialPitchDeg(-10, -30), -30);
   assert.equal(L.camera.lookAheadM, H.camera.slopeFollow.lookAheadM);
   assert.equal(L.camera.riderMarginDeg, H.camera.slopeFollow.riderMarginDeg);
  } finally {
   H.camera.slopeFollow.tilt = tilt;
  }
 });

 it('formats canvas colours the way the view did', () => {
  assert.equal(cssRgb(31, 74, 58), 'rgb(31,74,58)');
  assert.equal(cssRgba([246, 248, 255], 0.8 * (1 - 0.3)), 'rgba(246,248,255,0.56)');
  assert.deepEqual(hexRgb('#fff'), [255, 255, 255]);
  assert.throws(() => hexRgb('rgb(1,2,3)'), /not a hex colour/);
 });
});

describe('validateLook rejects a broken look', () => {
 const broken = {
  'no version': { ...look, version: '' },
  'a role that is not a colour': { ...look, roles: [...look.roles, 'x'], colour: (r) => (r === 'x' ? 'banana' : '#000') },
  'an unknown role in roles': { ...look, roles: ['nope'] },
  'a sky stop out of 0..1': { ...look, sky: { ...look.sky, stops: [[0, '#000'], [2, '#fff']] } },
  'fog rgb with two channels': { ...look, fog: { ...look.fog, rgb: [1, 2] } },
  'a sprite without its colour': { ...look, sprites: { ...look.sprites, rail: {} } },
  'spray alpha above 1': { ...look, sprites: { ...look.sprites, spray: { rgb: [1, 2, 3], maxAlpha: 2 } } },
  'camera without partialPitchDeg': { ...look, camera: { lookAheadM: 30, riderMarginDeg: 6 } },
  'a UI token that is not a custom property': { ...look, ui: { bg: '#000' } },
  'a rider without project': { ...look, rider: { ...look.rider, project: null } },
  'a rig without poses': { ...look, rider: { ...look.rider, poses: { ski: ['ride'], board: [] } } },
 };
 for (const [what, bad] of Object.entries(broken)) {
  it(what, () => assert.throws(() => validateLook(bad), /^Error: Look: /));
 }
});

describe('the game uses the look', () => {
 it('sets the Look\'s UI tokens as CSS custom properties at start-up', async () => {
  const g = await load();
  assert.deepEqual(g.cssProps(), { ...look.ui });
 });
});
