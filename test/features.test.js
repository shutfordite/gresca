'use strict';
// GMA2-style experience: touch controls, camera framing, snow look, spray, score, plus full-run integration.
const fs = require('node:fs');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, GAME } = require('./harness');

const g = load();
const frames = (n, dt = 1 / 60) => g.run(`for(let i=0;i<${n};i++)draw(${dt})`);
const down = (id, px, py) => g.run(`pDown(${id},${px},${py})`);
const move = (id, px, py) => g.run(`pMove(${id},${px},${py})`);
const up = (id) => g.run(`pUp(${id})`);
const flags = () => Array.from(g.run('[L,R,B,JU]')); // copy out of the vm realm so deepEqual works
const clear = () => g.run('ptrs.clear();kb.L=kb.R=kb.B=0;L=R=B=JU=0;both=false');

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
    assert.equal(g.run('L'), 1);
    up(1);
    down(1, 196, 500);
    assert.equal(g.run('R'), 1);
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
    assert.equal(g.run('JU'), 0, 'one side alone only turns');
    down(2, 300, 500);
    assert.deepEqual(flags(), [1, 1, 0, 1]);
    g.run('JU=0');
    move(1, 60, 505);
    assert.equal(g.run('JU'), 0, 'holding both sides must not re-trigger');
    up(1);
    assert.deepEqual(flags(), [0, 1, 0, 0]);
    down(3, 40, 500);
    assert.equal(g.run('JU'), 1, 'pressing both again jumps again');
    up(2);
    up(3);
  });

  it('one finger never jumps, however it moves', () => {
    clear();
    down(1, 100, 500);
    move(1, 100, 440);
    move(1, 100, 380);
    assert.equal(g.run('JU'), 0);
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
    assert.equal(g.run('B'), 1);
    move(1, 100, 510);
    assert.equal(g.run('B'), 0);
    move(1, 100, 560);
    up(1);
    assert.equal(g.run('B'), 0);
  });

  it('works through real pointer events on the canvas', () => {
    clear();
    const c = g.el('c');
    c.fire('pointerdown', { pointerId: 7, clientX: 40, clientY: 600 });
    assert.equal(g.run('L'), 1);
    c.fire('pointerup', { pointerId: 7 });
    assert.equal(g.run('L'), 0);
    c.fire('pointerdown', { pointerId: 8, clientX: 350, clientY: 600 });
    c.fire('pointercancel', { pointerId: 8 });
    assert.equal(g.run('R'), 0);
  });

  it('keyboard still works: arrows steer, down brakes, space or up jumps', () => {
    clear();
    g.fire('keydown', { key: 'ArrowLeft' });
    assert.equal(g.run('L'), 1);
    g.fire('keyup', { key: 'ArrowLeft' });
    assert.equal(g.run('L'), 0);
    g.fire('keydown', { key: 'ArrowDown' });
    assert.equal(g.run('B'), 1);
    g.fire('keyup', { key: 'ArrowDown' });
    g.fire('keydown', { key: ' ' });
    assert.equal(g.run('JU'), 1);
    assert.equal(g.run('B'), 0, 'space jumps, it no longer brakes');
    clear();
    g.fire('keydown', { key: 'ArrowLeft' });
    g.fire('keydown', { key: 'ArrowRight' });
    assert.equal(g.run('JU'), 1, 'both arrows jump too');
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
    const a0 = g.run('a'), x0 = g.run('x');
    down(1, 300, 500);
    g.sim(1);
    up(1);
    assert.ok(g.run('a') > a0 + 0.5);
    assert.ok(g.run('x') < x0 - 1);
  });

  it('pressing both sides drives a real jump', () => {
    clear();
    g.place({ vy: 10 });
    down(1, 100, 500);
    down(2, 300, 500);
    g.sim(0.1);
    up(1);
    up(2);
    assert.ok(g.run('jz') > 0);
  });
});

describe('camera', () => {
  it('sits behind and well above the rider, looking steeply down', () => {
    clear();
    g.place({ vy: 10 });
    frames(240);
    const gR = g.run('H[(y|0)*W0+(x|0)]');
    assert.ok(g.run('camH') - gR > 5, 'camera should be well above the rider');
    assert.ok(g.run('cam.hz/cam.RH') <= 0.2, 'horizon should sit near the top of the screen');
    const back = Math.hypot(g.run('cam.px') - g.run('x'), g.run('cam.py') - g.run('y'));
    assert.ok(Math.abs(back - g.run('CAMBACK')) < 0.5);
  });

  it('puts a small rider in the lower third, centred', () => {
    g.place({ vy: 10 });
    frames(240);
    const P = g.run('project(x,y,H[(y|0)*W0+(x|0)])');
    const RHpx = g.run('cam.RH*cam.kx'), Wpx = g.run('W');
    assert.ok(P.Y / RHpx > 0.6 && P.Y / RHpx < 0.85, `rider at ${(P.Y / RHpx).toFixed(2)} of screen height`);
    assert.ok(Math.abs(P.X - Wpx / 2) < 3, 'rider should be centred');
    const riderPx = 2 * P.s * g.run('RSC');
    assert.ok(riderPx / RHpx < 0.12, `rider is ${(riderPx / RHpx * 100).toFixed(0)}% of screen height, should be small`);
  });

  it('tilts with the slope so snow fills the screen and only a thin strip of sky shows', () => {
    g.place({ vy: 10 });
    frames(240);
    const RW = g.run('cam.RW'), RH = g.run('cam.RH'), px = g.run('lo._pix');
    let top = 0;
    while (top < RH && px[(top * RW + (RW >> 1)) * 4 + 3] !== 255) top++;
    assert.ok(top / RH < 0.25, `sky covers the top ${(top / RH * 100).toFixed(0)}% of the screen`);
  });

  it('swings round behind the rider as they turn', () => {
    g.place({ vy: 10, a: 2.2 });
    frames(240);
    assert.ok(Math.abs(g.run('camA') - 2.2) < 0.05);
  });
});

describe('snow look', () => {
  const lum = (o) => g.run(`col[${o}]`);
  it('has corduroy stripes across the groomed piste', () => {
    const y = 500, c = Math.round(g.run(`cx(${y})`));
    const reds = [];
    for (let dx = -10; dx <= 10; dx++) reds.push(lum((y * 1000 + c + dx) * 4));
    assert.ok(Math.max(...reds) - Math.min(...reds) >= 6, 'expected visible stripes');
  });

  it('tints snow lavender, bluer than it is red', () => {
    const o = (500 * 1000 + Math.round(g.run('cx(500)'))) * 4;
    const r = g.run(`col[${o}]`), b = g.run(`col[${o + 2}]`);
    assert.ok(b > r + 8, `r=${r} b=${b}`);
    assert.ok(r > 190, 'snow should still read as bright');
  });

  it('fades distant terrain into fog', () => {
    // Snow is nearly the fog colour already, so paint the whole map black: any brightness in the
    // render must then come from fog blending in with distance. (place() restores the real colours.)
    g.place({ vy: 10 });
    g.run('col.fill(0)');
    frames(60);
    const RW = g.run('cam.RW'), RH = g.run('cam.RH'), px = g.run('lo._pix');
    const at = (row) => px[(row * RW + (RW >> 1)) * 4];
    assert.equal(px[((RH * 0.5 | 0) * RW + (RW >> 1)) * 4 + 3], 255, 'terrain should fill the lower screen');
    assert.ok(at(Math.floor(RH * 0.5)) < 5, 'near ground keeps its own colour');
    assert.ok(at(Math.floor(RH * 0.17)) > 20, 'far ground should be washed toward the fog colour');
    g.place({ vy: 10 });
  });

  it('leaves a deeper track where the rider has been', () => {
    g.place({ vy: 8 });
    g.sim(1);
    const o = g.run('(((y|0)*W0+(x|0))*4)');
    assert.ok(g.run(`col[${o}]`) < g.run(`col0[${o}]`), 'snow under the rider should be darker than untouched snow');
    const braked = (() => {
      g.place({ vy: 12 });
      g.run('B=1');
      g.sim(0.5);
      const p = g.run('(((y|0)*W0+(x|0))*4)');
      return g.run(`col[${p}]/col0[${p}]`);
    })();
    assert.ok(braked < 0.9, 'braking should cut a deeper groove');
  });
});

describe('spray particles', () => {
  it('stays quiet when the rider is standing still', () => {
    g.place({});
    g.run('parts.length=0');
    g.sim(0.2);
    assert.equal(g.run('parts.length'), 0);
  });

  it('kicks up spray when braking at speed', () => {
    g.place({ vy: 15 });
    g.run('B=1');
    g.sim(0.3);
    assert.ok(g.run('parts.length') > 0);
  });

  it('kicks up spray when carving hard', () => {
    g.place({ vy: 15 });
    g.run('R=1');
    let max = 0;
    for (let i = 0; i < 10; i++) {
      g.sim(0.05);
      max = Math.max(max, g.run('parts.length'));
    }
    assert.ok(max > 0);
  });

  it('bursts on landing', () => {
    g.place({ vy: 10 });
    g.run('jz=.08;jv=-10;parts.length=0');
    g.sim(1 / 120);
    assert.ok(g.run('parts.length') >= 8);
  });

  it('makes no spray in mid-air', () => {
    g.place({ vy: 10 });
    g.run('jz=3;jv=0;parts.length=0;B=1');
    g.sim(0.05);
    assert.equal(g.run('parts.length'), 0);
  });

  it('fades out and never exceeds its cap', () => {
    g.place({ vy: 10 });
    g.run('emit(1000,x,y,.1,3,2.5,0,0)');
    assert.ok(g.run('parts.length') <= g.run('MAXP'));
    g.run('B=0;L=R=0');
    for (let i = 0; i < 60; i++) g.run('stepParts(1/60)');
    assert.equal(g.run('parts.length'), 0);
  });
});

describe('score and popups', () => {
  const land = (airT, o = {}) => {
    g.place({ vy: 12 });
    g.run(`airT=${airT};kick=${!!o.kick};jz=.08;jv=-10;score=0;popT=0;popTxt=''`);
    if (o.sideways) g.run('vx=15;vy=0.0001');
    g.sim(1 / 120);
  };

  it('awards points for a clean landing after real air time', () => {
    land(0.8);
    assert.ok(g.run('score') >= 45);
    assert.match(g.run('popTxt'), /^\+\d+p Air$/);
    assert.ok(g.run('popT') > 0);
  });

  it('gives a kicker bonus', () => {
    land(0.8);
    const plain = g.run('score');
    land(0.8, { kick: true });
    assert.equal(g.run('score'), plain + 20);
  });

  it('scores nothing for a tiny hop', () => {
    land(0.1);
    assert.equal(g.run('score'), 0);
  });

  it('scores nothing for a crash landing', () => {
    land(0.8, { sideways: true });
    assert.ok(g.run('crash') > 0);
    assert.equal(g.run('score'), 0);
  });

  it('resets the score for a new run', () => {
    g.run('score=500;popT=2');
    g.run('start()');
    assert.equal(g.run('score'), 0);
    assert.equal(g.run('popT'), 0);
    assert.equal(g.run('parts.length'), 0);
  });
});

describe('twin-tip riding (spins and switch)', () => {
  const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  it('right spins the rider one way in the air', () => {
    clear();
    g.place({ vy: 12 });
    g.run('jz=3;jv=6;rot=0;R=1');
    g.sim(0.45);
    assert.ok(g.run('rot') > 3, `rotated ${g.run('rot').toFixed(2)} rad`);
    assert.ok(g.run('jz') > 0, 'should still be airborne');
  });

  it('left spins the rider the other way', () => {
    clear();
    g.place({ vy: 12 });
    g.run('jz=3;jv=6;rot=0;L=1');
    g.sim(0.45);
    assert.ok(g.run('rot') < -3);
  });

  it('landing backwards after a 180 is clean, because the board is twin tip', () => {
    g.place({ vy: 12 });
    g.run('a=Math.PI/2+Math.PI;rot=Math.PI;airT=.8;jz=.08;jv=-10;score=0');
    g.sim(1 / 120);
    assert.equal(g.run('crash'), 0);
    assert.match(g.run('popTxt'), /180/);
    assert.ok(g.run('score') > 0);
  });

  it('landing after a full 360 is clean too', () => {
    g.place({ vy: 12 });
    g.run('a=Math.PI/2+2*Math.PI;rot=2*Math.PI;airT=.9;jz=.08;jv=-10;score=0');
    g.sim(1 / 120);
    assert.equal(g.run('crash'), 0);
    assert.match(g.run('popTxt'), /360/);
  });

  it('a 180 scores more than a plain jump', () => {
    g.place({ vy: 12 });
    g.run('airT=.8;jz=.08;jv=-10;score=0');
    g.sim(1 / 120);
    const plain = g.run('score');
    g.place({ vy: 12 });
    g.run('a=Math.PI*1.5;rot=Math.PI;airT=.8;jz=.08;jv=-10;score=0');
    g.sim(1 / 120);
    assert.ok(g.run('score') > plain + 30);
  });

  it('landing sideways after only a quarter turn still wipes out', () => {
    g.place({ vy: 12 });
    g.run('a=Math.PI;rot=Math.PI/2;airT=.8;jz=.08;jv=-10');
    g.sim(1 / 120);
    assert.ok(g.run('crash') > 0);
  });

  it('keeps riding down the slope switch without falling', () => {
    clear();
    g.place({ vy: 12, a: 1.5 * Math.PI });
    const y0 = g.run('y');
    g.sim(3);
    assert.equal(g.run('crash'), 0);
    assert.equal(g.run('crashes'), 0);
    assert.ok(g.run('y') > y0 + 20, 'should keep travelling downhill');
    assert.ok(g.speed() > 10);
    assert.ok(g.run('a') > Math.PI, 'should still be switch');
  });

  it('steers the same way on screen when riding switch', () => {
    clear();
    g.place({ vy: 10, a: 1.5 * Math.PI });
    const x0 = g.run('x');
    g.run('R=1');
    g.sim(1);
    assert.ok(g.run('x') < x0 - 1, 'right should still move the rider right on screen');
    g.sim(5);
    const a = g.run('a');
    assert.ok(a > Math.PI + 0.14 && a <= 2 * Math.PI - 0.15 + 1e-9, `a=${a}`);
  });

  it('cannot spin round on the ground, only in the air', () => {
    clear();
    g.place({ vy: 10 });
    g.run('R=1');
    g.sim(8);
    assert.ok(g.run('a') <= Math.PI - 0.15 + 1e-9);
  });

  it('keeps the camera facing down the slope while riding switch', () => {
    clear();
    g.place({ vy: 12, a: 1.5 * Math.PI });
    frames(300);
    assert.ok(Math.abs(wrap(g.run('camA') - Math.PI / 2)) < 0.1);
  });

  it('does not whip the camera round during a mid-air spin', () => {
    clear();
    g.place({ vy: 12 });
    g.run('jz=5;jv=20');
    let worst = 0;
    for (let i = 0; i < 32; i++) {
      g.run('a+=0.1;draw(1/60)');
      worst = Math.max(worst, Math.abs(wrap(g.run('camA') - Math.PI / 2)));
    }
    assert.ok(worst < 0.2, `camera swung ${worst.toFixed(2)} rad`);
  });

  it('spins a 180 off a kicker, lands switch and rides on (integration)', () => {
    clear();
    g.place({ y: g.run('KICK[0]') - 1, vy: 14 });
    g.run(`(function(){const dt=1/120;
      for(let n=0;n<360;n++){L=0;R=(jz>.05&&Math.abs(rot)<Math.PI)?1:0;step(dt);stepParts(dt)}
      R=0})()`);
    assert.equal(g.run('crashes'), 0);
    assert.ok(g.run('rot') >= 3.1 && g.run('rot') < 3.4, `rot ${g.run('rot')}`);
    assert.ok(g.run('a') > Math.PI, 'should be riding switch');
    assert.ok(g.speed() > 8, 'should keep riding');
    assert.match(g.run('popTxt'), /180/);
  });
});

describe('rendering', () => {
  it('draws every rider state without throwing', () => {
    g.place({ vy: 12 });
    frames(5);
    g.run('jz=2;jv=1;emit(20,x,y,.5,3,2,0,0)');
    frames(5);
    g.run('jz=0;jv=0;crash=1;spin=2');
    frames(5);
    g.run("state='done'");
    frames(2);
    g.run("state='run'");
  });

  it('paints terrain across the lower screen', () => {
    g.place({ vy: 5 });
    frames(30);
    const px = g.run('lo._pix'), RW = g.run('cam.RW'), RH = g.run('cam.RH');
    let solid = 0;
    for (let r = Math.floor(RH * 0.3); r < RH; r++) if (px[(r * RW + (RW >> 1)) * 4 + 3] === 255) solid++;
    assert.ok(solid > (RH * 0.7) * 0.95);
  });

  it('shows score, speed and distance in the compact HUD', () => {
    g.place({ vy: 10 });
    g.run('score=120');
    frames(2);
    assert.equal(String(g.el('score').textContent), '120');
    assert.match(g.el('info').textContent, /^\d+ km\/h · \d+ m to go$/);
  });
});

describe('full run (integration)', () => {
  // A simple autopilot that aims at the piste 30 m ahead, driving through the same step() the game uses.
  const ride = (brakeSecs = 0) =>
    g.run(`(function(){
      start();const dt=1/120;let n=0,vmax=0,maxJz=0;
      while(state==='run'&&n<120*500){
        const ty=y+30,tx=cx(ty),ang=Math.atan2(ty-y,tx-x);
        L=0;R=0;B=time<${brakeSecs}?1:0;
        if(ang>a+.03)R=1;else if(ang<a-.03)L=1;
        if(jz>.05){L=0;R=0}
        step(dt);stepParts(dt);popT=Math.max(0,popT-dt);n++;
        vmax=Math.max(vmax,Math.hypot(vx,vy));maxJz=Math.max(maxJz,jz)}
      return{state,time,crashes,score,vmax,maxJz}})()`);

  it('boots to a start screen, then Drop in starts the run and closes the menu', () => {
    assert.equal(g.el('go').hidden, false);
    assert.match(g.el('t').textContent, /left or right side/);
    assert.match(g.el('t').textContent, /both sides/);
    g.run("state='ready';msg.hidden=false");
    g.el('go').fire('click');
    assert.equal(g.run('state'), 'run');
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
    assert.equal(g.run('state'), 'run');
    assert.equal(g.run('score'), 0);
    assert.equal(g.run('time'), 0);
  });
});
