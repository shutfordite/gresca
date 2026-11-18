'use strict';
// The terrain park: kickers, rails and boxes, and the Snowboard / Skis picker.
// NOTE: y 460 to 740 is deliberately kept free of features. Many physics tests drop the rider at
// y=500 and ride a few seconds, expecting empty snow. A test below guards that stretch.
const fs = require('node:fs');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, GAME } = require('./harness');

const g = load();
const frames = (n, dt = 1 / 60) => g.run(`for(let i=0;i<${n};i++)draw(${dt})`);
const clone = (code) => JSON.parse(JSON.stringify(g.run(code)));
const KICK = clone('KICK');
const RAILS = clone('RAILS');
const FIN = g.run('FIN');
const phi = (r) => Math.atan2(r.dy, r.dx);

// put the rider on rail i at distance t along it, riding its direction at speed s
const onRail = (i, t = 0.3, s = 12, extra = '') => {
  const r = RAILS[i];
  g.place({ x: r.x0 + r.dx * t, y: r.y0 + r.dy * t, vx: r.dx * s, vy: r.dy * s, a: phi(r) });
  if (extra) g.run(extra);
};
const grinding = () => g.run('grind!==null');

describe('kickers', () => {
  it('there are plenty of them, well spaced down the run', () => {
    assert.ok(KICK.length >= 12, `only ${KICK.length} kickers`);
    for (let i = 1; i < KICK.length; i++) assert.ok(KICK[i] - KICK[i - 1] >= 55, 'kickers need room to land');
    assert.ok(KICK[0] > 60 && KICK[KICK.length - 1] < FIN - 100);
  });

  it('are real ramps in the terrain, not just paint', () => {
    for (const k of KICK) {
      const lip = g.run(`bump(cx(${k}),${k}-.5)`);
      assert.ok(lip >= 1.1, `kicker at ${k} only ${lip.toFixed(2)} m high`);
      assert.equal(g.run(`bump(cx(${k}),${k}-20)`), 0, 'flat snow before the ramp');
      assert.equal(g.run(`bump(cx(${k})+14,${k}-1)`), 0, 'ramp is not wider than the piste lane');
    }
  });

  it('a few are big: taller ramps and more air', () => {
    const big = KICK.filter((k) => g.run(`KBIG.has(${k})`));
    assert.ok(big.length >= 3 && big.length < KICK.length / 2);
    for (const k of big) assert.ok(g.run(`bump(cx(${k}),${k}-.5)`) >= 2, `big kicker at ${k}`);
  });

  it('a big kicker throws the rider higher than a small one', () => {
    const peak = (k) => {
      g.place({ y: k - 0.5, vy: 15 });
      let max = 0;
      for (let i = 0; i < 100; i++) {
        g.sim(1 / 120);
        max = Math.max(max, g.run('jz'));
      }
      return max;
    };
    const small = KICK.find((k) => !g.run(`KBIG.has(${k})`)), big = KICK.find((k) => g.run(`KBIG.has(${k})`));
    assert.ok(peak(big) > peak(small) * 1.3);
  });

  it('keeps a clear practice stretch for the physics tests', () => {
    const inWay = (a, b) => a < 740 && b > 460;
    for (const k of KICK) assert.ok(!inWay(k - 14, k + 8), `kicker at ${k} is in the clear stretch`);
    for (const r of RAILS) assert.ok(!inWay(r.y0, r.y1), `rail at ${r.y0} is in the clear stretch`);
  });

  it('riding the whole run launches off most of them (integration)', () => {
    const n = g.run(`(function(){
      start();const dt=1/120;let k=0,was=false,m=0;
      while(state==='run'&&m<120*500){
        const ty=y+30,tx=cx(ty),ang=Math.atan2(ty-y,tx-x);L=0;R=0;B=0;
        if(ang>a+.03)R=1;else if(ang<a-.03)L=1;
        if(jz>.05||grind){L=0;R=0}
        step(dt);stepParts(dt);m++;
        const up=jz>.05&&!grind;if(up&&!was)k++;was=up}
      return k})()`);
    assert.ok(n >= 12, `only ${n} launches`);
    assert.equal(g.run('state'), 'done');
    assert.ok(g.run('crashes') <= 3);
  });
});

describe('rails and boxes', () => {
  it('there are plenty, and both kinds', () => {
    assert.ok(RAILS.length >= 10, `only ${RAILS.length} rails`);
    assert.ok(RAILS.some((r) => r.t === 'rail') && RAILS.some((r) => r.t === 'box'));
  });

  it('are long enough to grind, sit on the groomed piste and keep clear of the kickers', () => {
    for (const r of RAILS) {
      assert.ok(r.len >= 14, `rail at ${r.y0} is too short`);
      assert.ok(r.y0 > 60 && r.y1 < FIN - 80);
      for (const [x, y] of [[r.x0, r.y0], [r.x0 + r.dx * r.len, r.y1]]) {
        assert.equal(g.run(`M[(${y}|0)*W0+(${x}|0)]`), 255, `rail at ${r.y0} runs off the groomed snow`);
      }
      for (const k of KICK) assert.ok(r.y1 < k - 14 || r.y0 > k + 8, `rail at ${r.y0} overlaps kicker ${k}`);
    }
  });

  it('riding onto a rail starts a grind', () => {
    onRail(0);
    g.sim(0.1);
    assert.ok(grinding());
    assert.ok(g.run('jz') > 0.3, 'rider should be up on the rail');
  });

  it('a grind carries the rider to the end, scores, and hops off cleanly', () => {
    onRail(0);
    g.run('score=0');
    g.sim(RAILS[0].len / 11 + 1.5);
    assert.ok(!grinding());
    assert.ok(g.run('y') > RAILS[0].y1 - 0.5);
    assert.ok(g.run('score') > 30, `score ${g.run('score')}`);
    assert.match(g.run('popTxt'), /Rail/);
    assert.equal(g.run('crashes'), 0);
  });

  it('boxes count too', () => {
    const i = RAILS.findIndex((r) => r.t === 'box');
    onRail(i);
    g.run('score=0');
    g.sim(0.1);
    assert.ok(grinding());
    g.sim(RAILS[i].len / 11 + 1.5);
    assert.match(g.run('popTxt'), /Box/);
  });

  it('twin tip: grinding switch works as well', () => {
    onRail(0);
    g.run(`a=${phi(RAILS[0])}+Math.PI`);
    g.sim(0.1);
    assert.ok(grinding());
    g.sim(RAILS[0].len / 11 + 1.5);
    assert.equal(g.run('crashes'), 0);
  });

  it('stays on the line however you steer, and sprays sparks', () => {
    onRail(0);
    g.run('R=1;parts.length=0');
    g.sim(0.4);
    assert.ok(grinding());
    const r = RAILS[0], ox = g.run('x') - r.x0, oy = g.run('y') - r.y0;
    assert.ok(Math.abs(-ox * r.dy + oy * r.dx) < 0.5, 'should not drift off the rail');
    assert.ok(g.run('parts.length') > 0);
  });

  it('both sides at once jumps off the rail', () => {
    onRail(0);
    g.sim(0.1);
    g.run('JU=1');
    g.sim(1 / 120);
    assert.ok(!grinding());
    assert.ok(g.run('jv') > 4);
    assert.ok(g.run('jz') > 0.5);
  });

  it('you can land on a rail from the air', () => {
    onRail(0, 5, 10, 'jz=.9;jv=-3');
    g.sim(1 / 60);
    assert.ok(grinding());
  });

  it('does not grab a rail while rising from a jump, or when flying high over it', () => {
    onRail(0, 5, 10, 'jz=.1;jv=6');
    g.sim(1 / 120);
    assert.ok(!grinding());
    onRail(0, 5, 10, 'jz=3;jv=0');
    g.sim(0.05);
    assert.ok(!grinding());
  });

  it('ignores a rider who is sideways, too slow or too far off to the side', () => {
    onRail(0, 0.3, 12, `a=${phi(RAILS[0])}+Math.PI/2`);
    g.sim(0.1);
    assert.ok(!grinding(), 'sideways');
    onRail(0, 0.3, 2);
    g.sim(0.05);
    assert.ok(!grinding(), 'too slow');
    onRail(0);
    g.run('x+=4');
    g.sim(0.05);
    assert.ok(!grinding(), 'off to the side');
  });

  it('steering onto a rail from a distance works (integration)', () => {
    const r = RAILS[0];
    g.place({ x: r.x0 - r.dx * 25, y: r.y0 - r.dy * 25, vx: r.dx * 8, vy: r.dy * 8, a: phi(r) });
    const got = g.run(`(function(){const dt=1/120;let hit=false;
      for(let n=0;n<600&&!hit;n++){
        const r=RAILS[0],ang=Math.atan2(r.y0+r.dy*3-y,r.x0+r.dx*3-x);
        L=0;R=0;if(ang>a+.02)R=1;else if(ang<a-.02)L=1;
        step(dt);stepParts(dt);if(grind)hit=true}
      return hit})()`);
    assert.ok(got, 'should reach the rail');
  });

  it('draws rails that are ahead and none when there are none ahead', () => {
    onRail(0, -20, 10);
    g.run('grind=null;jz=0;jv=0');
    frames(40);
    assert.ok(g.run('railsDrawn') > 0, 'rail ahead should be drawn');
    g.place({ y: 2250, vy: 5 });
    frames(40);
    assert.equal(g.run('railsDrawn'), 0);
  });

  it('kickers and rails are flagged so they can be seen coming', () => {
    g.place({ y: KICK[3] - 40, vy: 10 });
    frames(40);
    assert.ok(g.run('flagsDrawn') >= 4, 'expected flags on both sides of the kicker ahead');
    g.place({ y: 2250, vy: 5 });
    frames(40);
    assert.equal(g.run('flagsDrawn'), 0, 'nothing ahead, nothing to flag');
  });

  it('a new run clears any grind in progress', () => {
    onRail(0);
    g.sim(0.1);
    assert.ok(grinding());
    g.run('start()');
    assert.ok(!grinding());
  });
});

describe('Snowboard or Skis (menu)', () => {
  it('the menu offers both, with the snowboard selected first', () => {
    const html = fs.readFileSync(GAME, 'utf8');
    assert.ok(html.includes('id="pb"') && html.includes('id="ps"'));
    assert.equal(g.run('rig'), 'board');
  });

  it('tapping Skis switches to skis, and Snowboard switches back', () => {
    g.el('ps').fire('click');
    assert.equal(g.run('rig'), 'ski');
    g.el('pb').fire('click');
    assert.equal(g.run('rig'), 'board');
  });

  it('remembers the choice for next time', () => {
    g.el('ps').fire('click');
    assert.equal(g.run("localStorage.getItem('gresca-rig')"), 'ski');
    g.el('pb').fire('click');
    assert.equal(g.run("localStorage.getItem('gresca-rig')"), 'board');
  });

  it('still reads a choice saved under the old key (from before the rename)', () => {
    const old = load({ store: { 'gv-rig': 'ski' } });
    assert.equal(old.run('rig'), 'ski');
  });

  it('the new key wins over the old key', () => {
    const both = load({ store: { 'gv-rig': 'ski', 'gresca-rig': 'board' } });
    assert.equal(both.run('rig'), 'board');
  });

  it('the choice survives starting a new run', () => {
    g.el('ps').fire('click');
    g.run('start()');
    assert.equal(g.run('rig'), 'ski');
    g.el('pb').fire('click');
  });

  it('skis turn a little quicker and grip better than the board', () => {
    const turn = (rig) => {
      g.el(rig === 'ski' ? 'ps' : 'pb').fire('click');
      g.place({ vy: 10 });
      const a0 = g.run('a');
      g.run('R=1');
      g.sim(0.3);
      return g.run('a') - a0;
    };
    assert.ok(turn('ski') > turn('board') + 0.01);
    g.el('pb').fire('click');
    const lateral = (rig) => {
      g.el(rig === 'ski' ? 'ps' : 'pb').fire('click');
      g.place({ vx: 12, vy: 0.01 }); // sliding sideways across the heading
      g.sim(0.3);
      return Math.abs(g.run('vx'));
    };
    assert.ok(lateral('ski') < lateral('board'), 'skis should scrub sideways speed faster');
    g.el('pb').fire('click');
  });

  it('skis are twin tip as well: a 180 lands clean and riding switch works', () => {
    g.el('ps').fire('click');
    g.place({ vy: 12 });
    g.run('a=Math.PI*1.5;rot=Math.PI;airT=.8;jz=.08;jv=-10;score=0');
    g.sim(1 / 120);
    assert.equal(g.run('crash'), 0);
    assert.match(g.run('popTxt'), /180/);
    g.place({ vy: 12, a: 1.5 * Math.PI });
    g.sim(3);
    assert.equal(g.run('crashes'), 0);
    assert.ok(g.speed() > 10);
    g.el('pb').fire('click');
  });

  it('skis spin in the air too', () => {
    g.el('ps').fire('click');
    g.place({ vy: 12 });
    g.run('jz=3;jv=6;rot=0;R=1');
    g.sim(0.45);
    assert.ok(g.run('rot') > 3);
    g.el('pb').fire('click');
  });

  it('draws both the snowboarder and the skier in every state', () => {
    for (const rig of ['pb', 'ps']) {
      g.el(rig).fire('click');
      g.place({ vy: 12 });
      frames(5);
      g.run('jz=2;jv=1;emit(10,x,y,.5,3,2,0,0)');
      frames(5);
      g.run('jz=0;jv=0;crash=1;spin=2');
      frames(5);
      g.run('crash=0;a=Math.PI*1.5');
      frames(5);
    }
    g.el('pb').fire('click');
  });

  it('a skier can ride the whole run (integration)', () => {
    g.el('ps').fire('click');
    const r = g.run(`(function(){
      start();const dt=1/120;let m=0;
      while(state==='run'&&m<120*500){
        const ty=y+30,tx=cx(ty),ang=Math.atan2(ty-y,tx-x);L=0;R=0;B=0;
        if(ang>a+.03)R=1;else if(ang<a-.03)L=1;
        if(jz>.05||grind){L=0;R=0}
        step(dt);stepParts(dt);m++}
      return{state,time,crashes,score}})()`);
    assert.equal(r.state, 'done');
    assert.ok(r.crashes <= 3 && r.score > 0);
    assert.equal(g.el('msg').hidden, false, 'menu returns so the rider can swap equipment');
    g.el('pb').fire('click');
  });
});
