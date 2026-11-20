'use strict';
// GMA2-style experience: touch controls, camera framing, snow look, spray, score, plus full-run integration.
const fs = require('node:fs');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, GAME } = require('./harness');

const g = load();
const frames = (n, dt = 1 / 60) => g.frames(n, dt);
const st = () => g.state();
const W = g.world, D = g.debug;
// Fingers go through the canvas's real pointer handlers, which call the game's pointer code with these coordinates.
const down = (id, px, py) => g.el('c').fire('pointerdown', { pointerId: id, clientX: px, clientY: py });
const move = (id, px, py) => g.el('c').fire('pointermove', { pointerId: id, clientX: px, clientY: py });
const up = (id) => g.el('c').fire('pointerup', { pointerId: id });
const flags = () => { const i = st().input; return [i.left, i.right, i.brake, i.jump]; };
const clear = () => g.resetInput();

describe('touch controls', () => {
  it('holding the left half of the screen turns left', () => {
    clear();
    down(1, 50, 500);
    assert.deepEqual(flags(), [1, 0, 0, 0]);
    up(1);
    assert.deepEqual(flags(), [0, 0, 0, 0]);
  });

  it('holding the right half of the screen turns right', () => {
    clear();
    down(1, 300, 500);
    assert.deepEqual(flags(), [0, 1, 0, 0]);
    up(1);
    assert.deepEqual(flags(), [0, 0, 0, 0]);
  });

  it('splits the screen exactly at the middle', () => {
    clear();
    down(1, 194, 500);
    assert.equal(st().input.left, 1);
    up(1);
    down(1, 196, 500);
    assert.equal(st().input.right, 1);
    up(1);
  });

  it('sliding a finger across the middle switches direction', () => {
    clear();
    down(1, 100, 500);
    move(1, 300, 500);
    assert.deepEqual(flags(), [0, 1, 0, 0]);
    up(1);
  });

  it('pressing both sides at once jumps', () => {
    clear();
    down(1, 50, 500);
    assert.equal(st().input.jump, 0, 'one side alone only turns');
    down(2, 300, 500);
    assert.deepEqual(flags(), [1, 1, 0, 1]);
    g.input({ jump: 0 });
    move(1, 60, 505);
    assert.equal(st().input.jump, 0, 'holding both sides must not re-trigger');
    up(1);
    assert.deepEqual(flags(), [0, 1, 0, 0]);
    down(3, 40, 500);
    assert.equal(st().input.jump, 1, 'pressing both again jumps again');
    up(2);
    up(3);
  });

  it('one finger never jumps, however it moves', () => {
    clear();
    down(1, 100, 500);
    move(1, 100, 440);
    move(1, 100, 380);
    assert.equal(st().input.jump, 0);
    up(1);
  });

  it('a small wobble is not a swipe', () => {
    clear();
    down(1, 100, 500);
    move(1, 100, 480);
    move(1, 100, 520);
    assert.deepEqual(flags(), [1, 0, 0, 0]);
    up(1);
  });

  it('swiping down brakes until the finger lifts or comes back', () => {
    clear();
    down(1, 100, 500);
    move(1, 100, 560);
    assert.equal(st().input.brake, 1);
    move(1, 100, 510);
    assert.equal(st().input.brake, 0);
    move(1, 100, 560);
    up(1);
    assert.equal(st().input.brake, 0);
  });

  it('works through real pointer events on the canvas', () => {
    clear();
    const c = g.el('c');
    c.fire('pointerdown', { pointerId: 7, clientX: 40, clientY: 600 });
    assert.equal(st().input.left, 1);
    c.fire('pointerup', { pointerId: 7 });
    assert.equal(st().input.left, 0);
    c.fire('pointerdown', { pointerId: 8, clientX: 350, clientY: 600 });
    c.fire('pointercancel', { pointerId: 8 });
    assert.equal(st().input.right, 0);
  });

  it('keyboard still works: arrows steer, down brakes, space or up jumps', () => {
    clear();
    g.fire('keydown', { key: 'ArrowLeft' });
    assert.equal(st().input.left, 1);
    g.fire('keyup', { key: 'ArrowLeft' });
    assert.equal(st().input.left, 0);
    g.fire('keydown', { key: 'ArrowDown' });
    assert.equal(st().input.brake, 1);
    g.fire('keyup', { key: 'ArrowDown' });
    g.fire('keydown', { key: ' ' });
    assert.equal(st().input.jump, 1);
    assert.equal(st().input.brake, 0, 'space jumps, it no longer brakes');
    clear();
    g.fire('keydown', { key: 'ArrowLeft' });
    g.fire('keydown', { key: 'ArrowRight' });
    assert.equal(st().input.jump, 1, 'both arrows jump too');
    g.fire('keyup', { key: 'ArrowLeft' });
    g.fire('keyup', { key: 'ArrowRight' });
    clear();
  });

  it('has no on-screen buttons, just left and right glove hints', () => {
    const html = fs.readFileSync(GAME, 'utf8');
    for (const id of ['bl', 'br', 'bb', 'bj']) assert.ok(!html.includes(`id="${id}"`), `button #${id} should be gone`);
    assert.ok(html.includes('id="gl"') && html.includes('id="gr"'));
  });

  it('holding the right side turns the rider right, toward lower x', () => {
    clear();
    g.place({ vy: 10 });
    const a0 = st().heading, x0 = st().x;
    down(1, 300, 500);
    g.sim(1);
    up(1);
    assert.ok(st().heading > a0 + 0.5);
    assert.ok(st().x < x0 - 1);
  });

  it('pressing both sides drives a real jump', () => {
    clear();
    g.place({ vy: 10 });
    down(1, 100, 500);
    down(2, 300, 500);
    g.sim(0.1);
    up(1);
    up(2);
    assert.ok(st().z > 0);
  });
});

describe('camera', () => {
  it('sits behind and well above the rider, looking steeply down', () => {
    clear();
    g.place({ vy: 10 });
    frames(240);
    const s = st(), c = s.camera;
    const gR = W.height(s.x, s.y);
    assert.ok(c.height - gR > 5, 'camera should be well above the rider');
    assert.ok(c.horizonPx / c.renderH <= 0.2, 'horizon should sit near the top of the screen');
    const back = Math.hypot(c.x - s.x, c.y - s.y);
    assert.ok(Math.abs(back - g.config.camBack) < 0.5);
  });

  it('puts a small rider in the lower third, centred', () => {
    g.place({ vy: 10 });
    frames(240);
    const s = st(), P = D.project(s.x, s.y, W.height(s.x, s.y));
    const RHpx = s.camera.renderH * s.camera.pixelScale, Wpx = D.screen().width;
    assert.ok(P.Y / RHpx > 0.6 && P.Y / RHpx < 0.85, `rider at ${(P.Y / RHpx).toFixed(2)} of screen height`);
    assert.ok(Math.abs(P.X - Wpx / 2) < 3, 'rider should be centred');
    const riderPx = 2 * P.s * g.config.riderScale;
    assert.ok(riderPx / RHpx < 0.12, `rider is ${(riderPx / RHpx * 100).toFixed(0)}% of screen height, should be small`);
  });

  it('tilts with the slope so snow fills the screen and only a thin strip of sky shows', () => {
    g.place({ vy: 10 });
    frames(240);
    const { renderW: RW, renderH: RH } = st().camera, px = D.renderPixels();
    let top = 0;
    while (top < RH && px[(top * RW + (RW >> 1)) * 4 + 3] !== 255) top++;
    assert.ok(top / RH < 0.25, `sky covers the top ${(top / RH * 100).toFixed(0)}% of the screen`);
  });

  it('swings round behind the rider as they turn', () => {
    g.place({ vy: 10, heading: 2.2 });
    frames(240);
    assert.ok(Math.abs(st().camera.heading - 2.2) < 0.05);
  });
});

describe('snow look', () => {
  const red = (x, y) => D.colourAt(x, y)[0];
  it('has corduroy stripes across the groomed piste', () => {
    const y = 500, c = Math.round(W.centre(y));
    const reds = [];
    for (let dx = -10; dx <= 10; dx++) reds.push(red(c + dx, y));
    assert.ok(Math.max(...reds) - Math.min(...reds) >= 6, 'expected visible stripes');
  });

  it('tints snow lavender, bluer than it is red', () => {
    const px = D.colourAt(Math.round(W.centre(500)), 500);
    const r = px[0], b = px[2];
    assert.ok(b > r + 8, `r=${r} b=${b}`);
    assert.ok(r > 190, 'snow should still read as bright');
  });

  it('fades distant terrain into fog', () => {
    // Snow is nearly the fog colour already, so paint the whole map black: any brightness in the
    // render must then come from fog blending in with distance. (place() restores the real colours.)
    g.place({ vy: 10 });
    D.fillColourMap(0);
    frames(60);
    const { renderW: RW, renderH: RH } = st().camera, px = D.renderPixels();
    const at = (row) => px[(row * RW + (RW >> 1)) * 4];
    assert.equal(px[((RH * 0.5 | 0) * RW + (RW >> 1)) * 4 + 3], 255, 'terrain should fill the lower screen');
    assert.ok(at(Math.floor(RH * 0.5)) < 5, 'near ground keeps its own colour');
    // The farthest ground is the first terrain row from the top (how much sky shows depends on the slope).
    let top = 0;
    while (top < RH && px[(top * RW + (RW >> 1)) * 4 + 3] !== 255) top++;
    assert.ok(at(top + 2) > 20, 'far ground should be washed toward the fog colour');
    g.place({ vy: 10 });
  });

  it('leaves a deeper track where the rider has been', () => {
    g.place({ vy: 8 });
    g.sim(1);
    let s = st();
    assert.ok(D.colourAt(s.x, s.y)[0] < D.baseColourAt(s.x, s.y)[0], 'snow under the rider should be darker than untouched snow');
    const braked = (() => {
      g.place({ vy: 12 });
      g.input({ brake: 1 });
      g.sim(0.5);
      s = st();
      return D.colourAt(s.x, s.y)[0] / D.baseColourAt(s.x, s.y)[0];
    })();
    assert.ok(braked < 0.9, 'braking should cut a deeper groove');
  });
});

describe('spray particles', () => {
  it('stays quiet when the rider is standing still', () => {
    g.place({});
    g.clearParticles();
    g.sim(0.2);
    assert.equal(st().particles, 0);
  });

  it('kicks up spray when braking at speed', () => {
    g.place({ vy: 15 });
    g.input({ brake: 1 });
    g.sim(0.3);
    assert.ok(st().particles > 0);
  });

  it('kicks up spray when carving hard', () => {
    g.place({ vy: 15 });
    g.input({ right: 1 });
    let max = 0;
    for (let i = 0; i < 10; i++) {
      g.sim(0.05);
      max = Math.max(max, st().particles);
    }
    assert.ok(max > 0);
  });

  it('bursts on landing', () => {
    g.place({ vy: 10 });
    g.set({ z: 0.08, vz: -10 });
    g.clearParticles();
    g.sim(1 / 120);
    assert.ok(st().particles >= 8);
  });

  it('makes no spray in mid-air', () => {
    g.place({ vy: 10 });
    g.set({ z: 3, vz: 0 });
    g.clearParticles();
    g.input({ brake: 1 });
    g.sim(0.05);
    assert.equal(st().particles, 0);
  });

  it('fades out and never exceeds its cap', () => {
    g.place({ vy: 10 });
    g.emitParticles(1000, st().x, st().y, 0.1, 3, 2.5, 0, 0);
    assert.ok(st().particles <= g.config.maxParticles);
    g.input({ brake: 0, left: 0, right: 0 });
    for (let i = 0; i < 60; i++) g.stepParticles(1 / 60);
    assert.equal(st().particles, 0);
  });
});

describe('score and popups', () => {
  const land = (airT, o = {}) => {
    g.place({ vy: 12 });
    g.set({ airTime: airT, fromKicker: !!o.kick, z: 0.08, vz: -10, score: 0, popup: { t: 0, text: '' } });
    if (o.sideways) g.set({ vx: 15, vy: 0.0001 });
    g.sim(1 / 120);
  };

  it('awards points for a clean landing after real air time', () => {
    land(0.8);
    assert.ok(st().score >= 45);
    assert.match(st().popup.text, /^\+\d+p Air$/);
    assert.ok(st().popup.t > 0);
  });

  it('gives a kicker bonus', () => {
    land(0.8);
    const plain = st().score;
    land(0.8, { kick: true });
    assert.equal(st().score, plain + 20);
  });

  it('scores nothing for a tiny hop', () => {
    land(0.1);
    assert.equal(st().score, 0);
  });

  it('scores nothing for a crash landing', () => {
    land(0.8, { sideways: true });
    assert.ok(st().crashTimer > 0);
    assert.equal(st().score, 0);
  });

  it('resets the score for a new run', () => {
    g.set({ score: 500, popup: { t: 2 } });
    g.start();
    assert.equal(st().score, 0);
    assert.equal(st().popup.t, 0);
    assert.equal(st().particles, 0);
  });
});

describe('twin-tip riding (spins and switch)', () => {
  const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  it('right spins the rider one way in the air', () => {
    clear();
    g.place({ vy: 12 });
    g.set({ z: 3, vz: 6, rotation: 0 });
    g.input({ right: 1 });
    g.sim(0.45);
    assert.ok(st().rotation > 3, `rotated ${st().rotation.toFixed(2)} rad`);
    assert.ok(st().z > 0, 'should still be airborne');
  });

  it('left spins the rider the other way', () => {
    clear();
    g.place({ vy: 12 });
    g.set({ z: 3, vz: 6, rotation: 0 });
    g.input({ left: 1 });
    g.sim(0.45);
    assert.ok(st().rotation < -3);
  });

  it('landing backwards after a 180 is clean, because the board is twin tip', () => {
    g.place({ vy: 12 });
    g.set({ heading: Math.PI / 2 + Math.PI, rotation: Math.PI, airTime: 0.8, z: 0.08, vz: -10, score: 0 });
    g.sim(1 / 120);
    assert.equal(st().crashTimer, 0);
    assert.match(st().popup.text, /180/);
    assert.ok(st().score > 0);
  });

  it('landing after a full 360 is clean too', () => {
    g.place({ vy: 12 });
    g.set({ heading: Math.PI / 2 + 2 * Math.PI, rotation: 2 * Math.PI, airTime: 0.9, z: 0.08, vz: -10, score: 0 });
    g.sim(1 / 120);
    assert.equal(st().crashTimer, 0);
    assert.match(st().popup.text, /360/);
  });

  it('a 180 scores more than a plain jump', () => {
    g.place({ vy: 12 });
    g.set({ airTime: 0.8, z: 0.08, vz: -10, score: 0 });
    g.sim(1 / 120);
    const plain = st().score;
    g.place({ vy: 12 });
    g.set({ heading: Math.PI * 1.5, rotation: Math.PI, airTime: 0.8, z: 0.08, vz: -10, score: 0 });
    g.sim(1 / 120);
    assert.ok(st().score > plain + 30);
  });

  it('landing sideways after only a quarter turn still wipes out', () => {
    g.place({ vy: 12 });
    g.set({ heading: Math.PI, rotation: Math.PI / 2, airTime: 0.8, z: 0.08, vz: -10 });
    g.sim(1 / 120);
    assert.ok(st().crashTimer > 0);
  });

  it('keeps riding down the slope switch without falling', () => {
    clear();
    g.place({ vy: 12, heading: 1.5 * Math.PI });
    const y0 = st().y;
    g.sim(3);
    assert.equal(st().crashTimer, 0);
    assert.equal(st().crashes, 0);
    assert.ok(st().y > y0 + 20, 'should keep travelling downhill');
    assert.ok(g.speed() > 10);
    assert.ok(st().heading > Math.PI, 'should still be switch');
  });

  it('steers the same way on screen when riding switch', () => {
    clear();
    g.place({ vy: 10, heading: 1.5 * Math.PI });
    const x0 = st().x;
    g.input({ right: 1 });
    g.sim(1);
    assert.ok(st().x < x0 - 1, 'right should still move the rider right on screen');
    g.sim(5);
    const a = st().heading;
    assert.ok(a > Math.PI + 0.14 && a <= 2 * Math.PI - 0.15 + 1e-9, `a=${a}`);
  });

  it('cannot spin round on the ground, only in the air', () => {
    clear();
    g.place({ vy: 10 });
    g.input({ right: 1 });
    g.sim(8);
    assert.ok(st().heading <= Math.PI - 0.15 + 1e-9);
  });

  it('keeps the camera facing down the slope while riding switch', () => {
    clear();
    g.place({ vy: 12, heading: 1.5 * Math.PI });
    frames(300);
    assert.ok(Math.abs(wrap(st().camera.heading - Math.PI / 2)) < 0.1);
  });

  it('does not whip the camera round during a mid-air spin', () => {
    clear();
    g.place({ vy: 12 });
    g.set({ z: 5, vz: 20 });
    let worst = 0;
    for (let i = 0; i < 32; i++) {
      g.set({ heading: st().heading + 0.1 });
      g.frames(1, 1 / 60);
      worst = Math.max(worst, Math.abs(wrap(st().camera.heading - Math.PI / 2)));
    }
    assert.ok(worst < 0.2, `camera swung ${worst.toFixed(2)} rad`);
  });

  it('spins a 180 off a kicker, lands switch and rides on (integration)', () => {
    clear();
    g.place({ y: W.kickers[0] - 1, vy: 14 });
    const dt = 1 / 120;
    for (let n = 0; n < 360; n++) {
      const s = st();
      g.input({ left: 0, right: (s.z > 0.05 && Math.abs(s.rotation) < Math.PI) ? 1 : 0 });
      g.step(dt);
      g.stepParticles(dt);
    }
    g.input({ right: 0 });
    const s = st();
    assert.equal(s.crashes, 0);
    assert.ok(s.rotation >= 3.1 && s.rotation < 3.4, `rot ${s.rotation}`);
    assert.ok(s.heading > Math.PI, 'should be riding switch');
    assert.ok(g.speed() > 8, 'should keep riding');
    assert.match(s.popup.text, /180/);
  });
});

describe('rendering', () => {
  it('draws every rider state without throwing', () => {
    g.place({ vy: 12 });
    frames(5);
    g.set({ z: 2, vz: 1 });
    g.emitParticles(20, st().x, st().y, 0.5, 3, 2, 0, 0);
    frames(5);
    g.set({ z: 0, vz: 0, crashTimer: 1, wipeoutSpin: 2 });
    frames(5);
    g.set({ phase: 'done' });
    frames(2);
    g.set({ phase: 'run' });
  });

  it('paints terrain across the lower screen', () => {
    g.place({ vy: 5 });
    frames(30);
    const px = D.renderPixels(), { renderW: RW, renderH: RH } = st().camera;
    let solid = 0;
    for (let r = Math.floor(RH * 0.3); r < RH; r++) if (px[(r * RW + (RW >> 1)) * 4 + 3] === 255) solid++;
    assert.ok(solid > (RH * 0.7) * 0.95);
  });

  it('shows score, speed and distance in the compact HUD', () => {
    g.place({ vy: 10 });
    g.set({ score: 120 });
    frames(2);
    assert.equal(String(g.el('score').textContent), '120');
    assert.match(g.el('info').textContent, /^\d+ km\/h · \d+ m to go$/);
  });
});

describe('full run (integration)', () => {
  // A simple autopilot that aims at the piste 30 m ahead, driving through the same step() the game uses.
  const ride = (brakeSecs = 0) => {
    g.start();
    const dt = 1 / 120;
    let n = 0, vmax = 0, maxJz = 0, s = st();
    while (s.phase === 'run' && n < 120 * 500) {
      const ty = s.y + 30, tx = W.centre(ty), ang = Math.atan2(ty - s.y, tx - s.x);
      let L = 0, R = 0;
      const B = s.time < brakeSecs ? 1 : 0;
      if (ang > s.heading + 0.03) R = 1; else if (ang < s.heading - 0.03) L = 1;
      if (s.z > 0.05) { L = 0; R = 0; }
      g.input({ left: L, right: R, brake: B });
      g.step(dt);
      g.stepParticles(dt);
      s = st();
      g.set({ popup: { t: Math.max(0, s.popup.t - dt) } });
      n++;
      vmax = Math.max(vmax, s.speed); maxJz = Math.max(maxJz, s.z);
    }
    return { state: s.phase, time: s.time, crashes: s.crashes, score: s.score, vmax, maxJz };
  };

  it('boots to a start screen, then Drop in starts the run and closes the menu', () => {
    assert.equal(g.el('go').hidden, false);
    assert.match(g.el('t').textContent, /left or right side/);
    assert.match(g.el('t').textContent, /both sides/);
    g.set({ phase: 'ready' });
    g.el('msg').hidden = false;
    g.el('go').fire('click');
    assert.equal(st().phase, 'run');
    assert.equal(g.el('msg').hidden, true);
  });

  it('can be ridden from the ridge to Pas de la Casa', () => {
    const r = ride();
    assert.equal(r.state, 'done', 'should reach the finish');
    assert.ok(r.time > 40 && r.time < 300, `took ${r.time.toFixed(1)} s`);
    assert.ok(r.vmax > 8 && r.vmax < 70, `top speed ${r.vmax.toFixed(1)} m/s`);
    assert.ok(r.crashes <= 3, `${r.crashes} crashes`);
  });

  it('launches off kickers and scores along the way', () => {
    const r = ride();
    assert.ok(r.maxJz > 0.5, 'expected air time');
    assert.ok(r.score > 0, 'expected points');
  });

  it('braking costs time', () => {
    const free = ride(0).time, braked = ride(8).time;
    assert.ok(braked > free + 5, `free ${free.toFixed(1)} s, braked ${braked.toFixed(1)} s`);
  });

  it('shows a result and lets the rider go again', () => {
    ride();
    assert.equal(g.el('msg').hidden, false);
    assert.match(g.el('t').textContent, /^Finished in [\d.]+ s with \d+ points and \d+ crash/);
    assert.equal(g.el('go').textContent, 'Ride again');
    g.el('go').fire('click');
    assert.equal(st().phase, 'run');
    assert.equal(st().score, 0);
    assert.equal(st().time, 0);
  });
});
