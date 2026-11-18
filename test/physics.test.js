'use strict';
// Baseline behaviour: terrain, riding physics, braking, jumping, kickers, trees, finish.
// These must keep passing through every later change to the game.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const g = load();

describe('terrain', () => {
  it('has a groomed piste centreline and ungroomed snow beside it', () => {
    const y = 600, c = Math.round(g.run(`cx(${y})`));
    assert.equal(g.run(`M[${y}*W0+${c}]`), 255);
    assert.equal(g.run(`M[${y}*W0+${c}+200]`), 0);
  });

  it('slopes down from the ridge to the village', () => {
    const top = g.run('H[100*W0+Math.round(cx(100))]');
    const bottom = g.run('H[2300*W0+Math.round(cx(2300))]');
    assert.ok(top - bottom > 400, `drop was only ${top - bottom} m`);
  });

  it('is deterministic', () => {
    assert.equal(g.run('fbm(123,456)'), g.run('fbm(123,456)'));
    const f = g.run('fbm(123,456)');
    assert.ok(f >= 0 && f <= 1);
  });

  it('keeps trees off and away from the piste', () => {
    const bad = g.run('treeArr.filter(t=>Math.abs(t.x-cx(t.y))<40||t.y>FIN).length');
    assert.equal(bad, 0);
    assert.ok(g.run('treeArr.length') > 100, 'expected a forest');
  });

  it('places kickers in order along the run', () => {
    const k = g.run('KICK.slice()');
    assert.ok(k.length >= 3);
    for (let i = 1; i < k.length; i++) assert.ok(k[i] > k[i - 1]);
    assert.ok(k[0] > 60 && k[k.length - 1] < g.run('FIN'));
  });
});

describe('run start', () => {
  it('drops the rider at the top of the piste, ready to ride', () => {
    g.run('start()');
    assert.equal(g.run('state'), 'run');
    assert.equal(g.run('y'), 60);
    assert.ok(Math.abs(g.run('x') - g.run('cx(60)')) < 1e-9);
    assert.equal(g.el('msg').hidden, true, 'menu should close on Drop in');
  });
});

describe('riding physics', () => {
  it('gravity accelerates the rider down the slope', () => {
    g.place({ vy: 0.5 });
    g.sim(3);
    assert.ok(g.speed() > 6, `speed only ${g.speed()}`);
  });

  it('brake slows the rider hard', () => {
    g.place({ vy: 20 });
    g.sim(1.5);
    const free = g.speed();
    g.place({ vy: 20 });
    g.run('B=1');
    g.sim(1.5);
    const braked = g.speed();
    assert.ok(free > 15, `unbraked speed ${free}`);
    assert.ok(braked < 5, `braked speed ${braked}`);
  });

  it('holding brake brings the rider to a stop', () => {
    g.place({ vy: 15 });
    g.run('B=1');
    g.sim(4);
    assert.ok(g.speed() < 1, `still moving at ${g.speed()}`);
  });

  it('steers right and left', () => {
    g.place({ vy: 10 });
    const a0 = g.run('a');
    g.run('R=1');
    g.sim(0.5);
    assert.ok(g.run('a') > a0 + 0.5);
    g.place({ vy: 10 });
    g.run('L=1');
    g.sim(0.5);
    assert.ok(g.run('a') < a0 - 0.5);
  });

  it('limits how far the rider can turn', () => {
    g.place({ vy: 10 });
    g.run('R=1');
    g.sim(5);
    assert.ok(g.run('a') <= Math.PI - 0.15 + 1e-9);
    g.place({ vy: 10 });
    g.run('L=1');
    g.sim(5);
    assert.ok(g.run('a') >= 0.15 - 1e-9);
  });

  it('keeps the rider inside the map', () => {
    g.place({ x: 3, vy: 5 });
    g.sim(0.1);
    assert.ok(g.run('x') >= 6);
    g.place({ x: 1005, vy: 5 });
    g.sim(0.1);
    assert.ok(g.run('x') <= 994);
  });
});

describe('jumping', () => {
  it('jump lifts the rider and lands cleanly after about a second', () => {
    g.place({ vy: 10 });
    g.run('JU=1');
    g.sim(0.05);
    assert.ok(g.run('jz') > 0, 'should be airborne');
    let apex = 0;
    for (let i = 0; i < 200; i++) {
      g.sim(1 / 120);
      apex = Math.max(apex, g.run('jz'));
    }
    assert.ok(apex > 1 && apex < 2, `apex ${apex}`);
    assert.equal(g.run('jz'), 0, 'should have landed');
    assert.equal(g.run('crash'), 0, 'straight landing must not crash');
  });

  it('cannot jump again while airborne', () => {
    g.place({ vy: 10 });
    g.run('JU=1');
    g.sim(0.1);
    const before = g.run('jv');
    g.run('JU=1');
    g.sim(1 / 120);
    assert.ok(g.run('jv') < before, 'a second press must not add lift');
    assert.equal(g.run('JU'), 0);
  });

  it('a kicker launches a fast rider automatically', () => {
    g.place({ y: g.run('KICK[0]') - 0.5, vy: 12 });
    g.sim(0.2);
    assert.ok(g.run('jz') > 0 || g.run('jv') > 0, 'should launch off the kicker');
  });

  it('a kicker ignores a slow rider', () => {
    g.place({ y: g.run('KICK[0]') - 0.1, vy: 2 });
    g.sim(0.08);
    assert.equal(g.run('jz'), 0);
  });

  it('a kicker ignores a rider off the piste', () => {
    g.place({ y: g.run('KICK[0]') - 0.5, x: g.run('cx(KICK[0])') + 60, vy: 12 });
    g.sim(0.2);
    assert.equal(g.run('jz'), 0);
  });

  it('wipes out when landing sideways at speed', () => {
    g.place({ vy: 0 });
    g.run('vx=15;vy=0.0001;jz=.08;jv=-10;a=Math.PI/2');
    g.sim(1 / 120);
    assert.ok(g.run('crash') > 0);
    assert.equal(g.run('crashes'), 1);
  });
});

describe('trees and crashes', () => {
  it('hitting a tree crashes the rider and stops them', () => {
    g.place({ vy: 5 });
    g.run('(function(){const T=treeArr[0];x=T.x;y=T.y})()');
    g.run('vy=5');
    g.sim(1 / 120);
    assert.ok(g.run('crash') > 0);
    assert.equal(g.run('crashes'), 1);
    assert.equal(g.speed(), 0);
  });

  it('flying high over a tree is safe', () => {
    g.place({ vy: 5 });
    g.run('(function(){const T=treeArr[0];x=T.x;y=T.y})()');
    g.run('vy=5;jz=2;jv=0');
    g.sim(1 / 120);
    assert.equal(g.run('crash'), 0);
  });

  it('ignores steering while crashed, then recovers', () => {
    g.place({ vy: 5 });
    g.run('crash=.3;R=1');
    const a0 = g.run('a');
    g.sim(0.2);
    assert.equal(g.run('a'), a0);
    g.sim(0.3);
    assert.ok(g.run('crash') <= 0);
  });
});

describe('finishing', () => {
  it('crossing the line in the village ends the run', () => {
    g.place({ y: g.run('FIN') + 1, vy: 5 });
    g.sim(1 / 120);
    assert.equal(g.run('state'), 'done');
  });

  it('starting again resets the run', () => {
    g.run('start()');
    assert.equal(g.run('state'), 'run');
    assert.equal(g.run('crashes'), 0);
    assert.equal(g.run('time'), 0);
    assert.equal(g.run('jz'), 0);
  });
});
