'use strict';
// Hanga Dawn look, step D1: fog and sky (spec terrain.fog, sky, maps[id].sun).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const g = load();
const frames = (n, dt = 1 / 60) => g.run(`for(let i=0;i<${n};i++)draw(${dt})`);
const arr = (code) => Array.from(g.run(code)); // copy out of the vm realm

describe('fog (spec terrain.fog)', () => {
  it('FOG equals HANGA.terrain.fog.rgb', () => {
    assert.deepEqual(arr('FOG'), arr('HANGA.terrain.fog.rgb'));
    assert.deepEqual(arr('FOG'), [242, 213, 198]);
  });

  it('uses HANGA.fogAmount: none before 40 m, full at the far edge of the render', () => {
    assert.equal(g.run('fogAt(30)'), 0);
    assert.equal(g.run('fogAt(FAR)'), 1);
    assert.equal(g.run('fogAt(120)'), g.run('HANGA.fogAmount(120,FAR)'));
  });

  it('FAR is the distance of the last terrain sample', () => {
    const far = g.run('(()=>{let z=3;for(let k=0;k<NS-1;k++)z+=1+z*.012;return z})()');
    assert.ok(Math.abs(g.run('FAR') - far) < 1e-9);
  });

  it('tints distant ground peach, more the farther it is', () => {
    g.place({ vy: 10 });
    g.run('col.fill(0)');
    frames(60);
    const RW = g.run('cam.RW'), RH = g.run('cam.RH'), px = g.run('lo._pix');
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
    const hy = g.run('Math.max(1,(cam.hz-cam.pt)*cam.kx)');
    assert.ok(Math.abs(gr.y1 - hy) < 1e-6, `gradient ends at ${gr.y1}, horizon at ${hy}`);
  });
});

describe('camera heading and the sun disc (spec maps[id].sun, sky.sun)', () => {
  it('reads camera heading in compass degrees (procedural: game +y is south)', () => {
    const at = (camA) => g.run(`camA=${camA};camCompass()`);
    assert.ok(Math.abs(at(Math.PI / 2) - 180) < 1e-9, 'downhill (+y) is south');
    assert.ok(Math.abs(at(0) - 90) < 1e-9, '+x is east');
    assert.ok(Math.abs(at(-Math.PI / 2) - 0) < 1e-9, '-y is north');
    assert.ok(Math.abs(at(Math.PI) - 270) < 1e-9, '-x is west');
  });

  it('centres the sun when the camera looks along the sun azimuth', () => {
    g.place({ vy: 10 });
    frames(60);
    const az = g.run('HANGA.maps[MAP_ID].sun.azimuthDeg');
    // compass heading h -> game angle: dx = sin(h), dy = -cos(h)
    g.run(`camA=Math.atan2(-Math.cos(${az}*Math.PI/180),Math.sin(${az}*Math.PI/180))`);
    const s = g.run('sunDisc()');
    assert.ok(Math.abs(s.X - g.run('W') / 2) < 1e-6, `sun X ${s.X}`);
    assert.ok(Math.abs(s.r - g.run('W*HANGA.sky.sun.radiusFracOfWidth')) < 1e-9);
    assert.ok(s.Y < g.run('(cam.hz-cam.pt)*cam.kx'), 'sun sits above the horizon line');
  });

  it('puts the sun off screen when it is 90 degrees from the view', () => {
    g.place({ vy: 10 });
    frames(60);
    const az = g.run('HANGA.maps[MAP_ID].sun.azimuthDeg') + 90;
    g.run(`camA=Math.atan2(-Math.cos(${az}*Math.PI/180),Math.sin(${az}*Math.PI/180))`);
    assert.equal(g.run('sunDisc().on'), false);
  });

  it('draws the sun before the terrain, so ridges cover it', () => {
    assert.match(g.run('draw.toString()'), /drawSun\([^)]*\)[\s\S]*drawImage\(lo/);
  });
});
