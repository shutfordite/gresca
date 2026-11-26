// @areas view
// Hanga Dawn look, step D1: fog and sky (spec terrain.fog, sky, maps[id].sun).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const g = await load();
const frames = (n, dt = 1 / 60) => g.frames(n, dt);
const D = g.debug;
const sunAz = () => g.run('HANGA.maps')[D.mapId].sun.azimuthDeg;

describe('fog (spec terrain.fog)', () => {
  it('FOG equals HANGA.terrain.fog.rgb', () => {
    // Array.from copies out of the vm realm, so deepEqual compares values only
    assert.deepEqual(Array.from(D.fog().rgb), Array.from(g.run('HANGA.terrain.fog.rgb')));
    assert.deepEqual(Array.from(D.fog().rgb), [242, 213, 198]);
  });

  it('uses HANGA.fogAmount: none before 40 m, full at the far edge of the render', () => {
    assert.equal(D.fogAt(30), 0);
    assert.equal(D.fogAt(D.fog().far), 1);
    assert.equal(D.fogAt(120), g.run('HANGA').fogAmount(120, D.fog().far));
  });

  it('FAR is the distance of the last terrain sample', () => {
    const NS = D.fog().samples;
    const far = (() => { let z = 3; for (let k = 0; k < NS - 1; k++) z += 1 + z * 0.012; return z; })();
    assert.ok(Math.abs(D.fog().far - far) < 1e-9);
  });

  it('tints distant ground peach, more the farther it is', () => {
    g.place({ vy: 10 });
    D.fillColourMap(0);
    frames(60);
    const { renderW: RW, renderH: RH } = g.state().camera, px = D.renderPixels();
    let top = 0;
    while (top < RH && px[(top * RW + (RW >> 1)) * 4 + 3] !== 255) top++;
    const at = (row) => { const o = (row * RW + (RW >> 1)) * 4; return [px[o], px[o + 1], px[o + 2]]; };
    const far = at(top), mid = at(top + 10);
    // On a black map every bit of colour is fog. The old fog was blue (b > r); the dawn fog is peach.
    assert.ok(far[0] > 60 && far[0] > far[1] && far[1] > far[2], `far pixel ${far} should be peach fog`);
    assert.ok(far[0] > mid[0], 'fog should grow with distance');
    g.place({ vy: 10 });
  });
});

describe('terrain shading', () => {
  it('shades each terrain sample\'s span smoothly, not as flat bands', () => {
    // A flat colour per ray sample made near slopes a stack of bands: about 98% of neighbouring rows were identical in
    // the near half of the render. Smooth spans blend into the next sample's colour.
    for (const name of ['ride-board', 'brake']) {
      g.raw.scene(name);
      frames(1);
      const { renderW: RW, renderH: RH } = g.state().camera, px = D.renderPixels();
      let same = 0, pairs = 0;
      for (let c = 0; c < RW; c += 3) for (let r = Math.floor(RH * 0.55); r < RH - 1; r++) {
        const a = (r * RW + c) * 4, b = a + RW * 4;
        pairs++;
        if (px[a] === px[b] && px[a + 1] === px[b + 1] && px[a + 2] === px[b + 2]) same++;
      }
      assert.ok(same / pairs < 0.9, `${name}: ${(100 * same / pairs).toFixed(1)}% of neighbouring rows identical`);
    }
    g.place({ vy: 10 });
  });
});

describe('sky (spec sky)', () => {
  const skyGrad = () => {
    const c = g.el('c');
    c._grads = [];
    frames(1);
    return c._grads[0];
  };

  it('uses the four spec stops in order', () => {
    g.place({ vy: 10 });
    frames(60);
    const gr = skyGrad();
    const want = g.run('HANGA.sky.stops.map(s=>[s[0],HANGA.colour(s[1])])');
    assert.deepEqual(gr.stops.map((s) => [s[0], s[1]]), Array.from(want, (s) => [s[0], s[1]]));
  });

  it('runs from the top of the screen to the horizon line', () => {
    g.place({ vy: 10 });
    frames(60);
    const gr = skyGrad();
    assert.equal(gr.y0, 0);
    const c = g.state().camera, hy = Math.max(1, (c.horizonPx - c.pitchPx) * c.pixelScale);
    assert.ok(Math.abs(gr.y1 - hy) < 1e-6, `gradient ends at ${gr.y1}, horizon at ${hy}`);
  });
});

describe('camera heading and the sun disc (spec maps[id].sun, sky.sun)', () => {
  it('reads camera heading in compass degrees (procedural: game +y is south)', () => {
    const at = (camA) => { g.set({ camera: { heading: camA } }); return D.camCompass(); };
    assert.ok(Math.abs(at(Math.PI / 2) - 180) < 1e-9, 'downhill (+y) is south');
    assert.ok(Math.abs(at(0) - 90) < 1e-9, '+x is east');
    assert.ok(Math.abs(at(-Math.PI / 2) - 0) < 1e-9, '-y is north');
    assert.ok(Math.abs(at(Math.PI) - 270) < 1e-9, '-x is west');
  });

  it('centres the sun when the camera looks along the sun azimuth', () => {
    g.place({ vy: 10 });
    frames(60);
    const az = sunAz();
    // compass heading h -> game angle: dx = sin(h), dy = -cos(h)
    g.set({ camera: { heading: Math.atan2(-Math.cos(az * Math.PI / 180), Math.sin(az * Math.PI / 180)) } });
    const s = D.sunDisc(), W = D.screen().width, c = g.state().camera;
    assert.ok(Math.abs(s.X - W / 2) < 1e-6, `sun X ${s.X}`);
    assert.ok(Math.abs(s.r - W * g.run('HANGA.sky.sun.radiusFracOfWidth')) < 1e-9);
    assert.ok(s.Y < (c.horizonPx - c.pitchPx) * c.pixelScale, 'sun sits above the horizon line');
  });

  it('puts the sun off screen when it is 90 degrees from the view', () => {
    g.place({ vy: 10 });
    frames(60);
    const az = sunAz() + 90;
    g.set({ camera: { heading: Math.atan2(-Math.cos(az * Math.PI / 180), Math.sin(az * Math.PI / 180)) } });
    assert.equal(D.sunDisc().on, false);
  });

  it('draws the sun before the terrain, so ridges cover it', () => {
    // Face the sun at rest (frames draw without simulating, so the rider stays put and the camera settles behind them,
    // looking along the sun azimuth), then record one frame's drawing calls.
    const az = sunAz(), h = Math.atan2(-Math.cos(az * Math.PI / 180), Math.sin(az * Math.PI / 180));
    g.place({ vy: 0, heading: h });
    g.set({ camera: { heading: h } });
    frames(60);
    assert.ok(D.sunDisc().on, 'the sun is on screen');
    const c = g.el('c');
    c._calls = [];
    frames(1);
    const calls = c._calls;
    c._calls = null;
    const cam = g.state().camera, sun = g.run('HANGA.colour(HANGA.sky.sun.colour)');
    const sky = calls.findIndex(([k, t]) => k === 'fillRect' && t === 'gradient');
    const disc = calls.findIndex(([k, t]) => k === 'arc' && t === sun);
    const terrain = calls.findIndex(([k, t]) => k === 'drawImage' && t === `${cam.renderW}x${cam.renderH}`);
    assert.ok(sky >= 0 && disc >= 0 && terrain >= 0, `sky ${sky}, sun ${disc}, terrain ${terrain}`);
    assert.ok(sky < disc && disc < terrain, `sky ${sky}, sun ${disc}, terrain ${terrain}: sky, then sun, then terrain`);
  });
});
