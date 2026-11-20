'use strict';
// Hanga Dawn look, step D2: the camera follows the slope only partly (spec camera.slopeFollow, HANGA.cameraPitch).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const g = load();
const frames = (n, dt = 1 / 60) => g.run(`for(let i=0;i<${n};i++)draw(${dt})`);
const D2R = Math.PI / 180;
const deg = (t) => Math.atan(t) / D2R; // a view tilt (tan) as degrees of look-down

describe('partial slope follow (spec camera.slopeFollow)', () => {
  it('reads tilt 0.55 and look-ahead 30 m from the spec', () => {
    assert.equal(g.run('HANGA.camera.slopeFollow.tilt'), 0.55);
    assert.equal(g.run('HANGA.camera.slopeFollow.lookAheadM'), 30);
  });

  it('changes nothing on level ground', () => {
    for (const s of [0, 0.1, 0.3]) assert.ok(Math.abs(g.run(`cameraTilt(${s},7.6,0)`) - s) < 1e-12);
  });

  it("matches the spec's worked example: on a 30 degree pitch it looks down about 9 degrees less", () => {
    const drop = 30 * Math.tan(30 * D2R), full = Math.tan(30 * D2R);
    const less = 30 - deg(g.run(`cameraTilt(${full},7.6,${drop})`));
    // spec: 22 deg instead of 31 deg
    assert.ok(less > 8.5 && less < 10, `looks down ${less.toFixed(1)} deg less`);
  });

  it('lies between level and full tilt on a steep pitch, and grows with the slope', () => {
    let prev = 0;
    for (const a of [10, 20, 30, 40]) {
      const drop = 30 * Math.tan(a * D2R), full = Math.tan(a * D2R);
      const t = g.run(`cameraTilt(${full},7.6,${drop})`);
      assert.ok(t < full && t > 0, `${a} deg: tilt ${t} should lie between 0 and ${full}`);
      const less = a - deg(t);
      assert.ok(less > prev, 'the steeper the pitch, the more the ground drops away');
      prev = less;
    }
  });

  it('looks down more than full tilt when the ground rises ahead', () => {
    const t = g.run('cameraTilt(-0.2,7.6,-6)');
    assert.ok(t > -0.2, 'an uphill run-out should not tip the view up as far');
  });

  it('is full tilt when slopeFollow.tilt is 1, and the old rule comes back', () => {
    g.run('HANGA.camera.slopeFollow.tilt=1');
    try {
      const drop = 30 * Math.tan(30 * D2R), full = Math.tan(30 * D2R);
      assert.ok(Math.abs(g.run(`cameraTilt(${full},7.6,${drop})`) - full) < 1e-9);
    } finally { g.run('HANGA.camera.slopeFollow.tilt=0.55'); }
  });
});

describe('camera in the game', () => {
  it('uses the partial tilt for the view, not the raw slope', () => {
    g.place({ vy: 10 });
    frames(240);
    const s = g.run('cam.s'), tilt = g.run('cam.pt/cam.sc');
    assert.ok(tilt <= s + 1e-9, `view tilt ${tilt} should not exceed the slope ${s} going downhill`);
  });

  it('keeps the rider at least 6 degrees inside the bottom of the frame', () => {
    // Make the ground ahead fall away steeply: the clamp must hold the rider in frame.
    g.place({ vy: 10 });
    frames(60);
    g.run('HANGA.camera.slopeFollow.tilt=0');
    try {
      frames(120);
      const gR = g.run('H[(y|0)*W0+(x|0)]');
      const riderY = g.run(`(camH-${gR})/CAMBACK*cam.sc+cam.hz-cam.pt`);
      const limit = g.run('cam.RH-cam.sc*Math.tan(HANGA.camera.slopeFollow.riderMarginDeg*Math.PI/180)');
      assert.ok(riderY <= limit + 1e-6, `rider at ${riderY.toFixed(1)} px, limit ${limit.toFixed(1)}`);
    } finally { g.run('HANGA.camera.slopeFollow.tilt=0.55'); }
  });
});
