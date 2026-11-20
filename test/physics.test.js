// Baseline behaviour: terrain, riding physics, braking, jumping, kickers, trees, finish.
// These must keep passing through every later change to the game.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const g = await load();
const W = g.world;
const st = () => g.state();

describe('terrain', () => {
  it('has a groomed piste centreline and ungroomed snow beside it', () => {
    const y = 600, c = Math.round(W.centre(y));
    assert.equal(W.groomed(c, y), 255);
    assert.equal(W.groomed(c + 200, y), 0);
  });

  it('slopes down from the ridge to the village', () => {
    const top = W.cellHeight(Math.round(W.centre(100)), 100);
    const bottom = W.cellHeight(Math.round(W.centre(2300)), 2300);
    assert.ok(top - bottom > 400, `drop was only ${top - bottom} m`);
  });

  it('is deterministic', () => {
    assert.equal(W.noise(123, 456), W.noise(123, 456));
    const f = W.noise(123, 456);
    assert.ok(f >= 0 && f <= 1);
  });

  it('keeps trees off and away from the piste', () => {
    const trees = W.trees;
    const bad = trees.filter((t) => Math.abs(t.x - W.centre(t.y)) < 40 || t.y > W.finishY).length;
    assert.equal(bad, 0);
    assert.ok(trees.length > 100, 'expected a forest');
  });

  it('places kickers in order along the run', () => {
    const k = W.kickers;
    assert.ok(k.length >= 3);
    for (let i = 1; i < k.length; i++) assert.ok(k[i] > k[i - 1]);
    assert.ok(k[0] > 60 && k[k.length - 1] < W.finishY);
  });
});

describe('run start', () => {
  it('drops the rider at the top of the piste, ready to ride', () => {
    g.start();
    assert.equal(st().phase, 'run');
    // on the course's centreline at its start, s 60 (in world metres: exact at any placement)
    const R = g.raw, C = R.world.course, s = R.state();
    assert.equal(C.startS, 60);
    assert.deepEqual({ x: s.x, y: s.y }, C.point(C.startS, 0));
    assert.ok(Math.abs(st().x - W.centre(60)) < 1e-9);
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
    g.input({ brake: 1 });
    g.sim(1.5);
    const braked = g.speed();
    assert.ok(free > 15, `unbraked speed ${free}`);
    assert.ok(braked < 5, `braked speed ${braked}`);
  });

  it('holding brake brings the rider to a stop', () => {
    g.place({ vy: 15 });
    g.input({ brake: 1 });
    g.sim(4);
    assert.ok(g.speed() < 1, `still moving at ${g.speed()}`);
  });

  it('steers right and left', () => {
    g.place({ vy: 10 });
    const a0 = st().heading;
    g.input({ right: 1 });
    g.sim(0.5);
    assert.ok(st().heading > a0 + 0.5);
    g.place({ vy: 10 });
    g.input({ left: 1 });
    g.sim(0.5);
    assert.ok(st().heading < a0 - 0.5);
  });

  it('limits how far the rider can turn', () => {
    g.place({ vy: 10 });
    g.input({ right: 1 });
    g.sim(5);
    assert.ok(st().heading <= Math.PI - 0.15 + 1e-9);
    g.place({ vy: 10 });
    g.input({ left: 1 });
    g.sim(5);
    assert.ok(st().heading >= 0.15 - 1e-9);
  });

  it('keeps the rider inside the map', () => {
    g.place({ x: 3, vy: 5 });
    g.sim(0.1);
    assert.ok(g.ge(st().x, 6), `x ${st().x}`);
    g.place({ x: 1005, vy: 5 });
    g.sim(0.1);
    assert.ok(g.le(st().x, 994), `x ${st().x}`);
  });
});

describe('jumping', () => {
  it('jump lifts the rider and lands cleanly after about a second', () => {
    g.place({ vy: 10 });
    g.input({ jump: 1 });
    g.sim(0.05);
    assert.ok(st().z > 0, 'should be airborne');
    let apex = 0;
    for (let i = 0; i < 200; i++) {
      g.sim(1 / 120);
      apex = Math.max(apex, st().z);
    }
    assert.ok(apex > 1 && apex < 2, `apex ${apex}`);
    assert.equal(st().z, 0, 'should have landed');
    assert.equal(st().crashTimer, 0, 'straight landing must not crash');
  });

  it('cannot jump again while airborne', () => {
    g.place({ vy: 10 });
    g.input({ jump: 1 });
    g.sim(0.1);
    const before = st().vz;
    g.input({ jump: 1 });
    g.sim(1 / 120);
    assert.ok(st().vz < before, 'a second press must not add lift');
    assert.equal(st().input.jump, 0);
  });

  it('a kicker launches a fast rider automatically', () => {
    g.place({ y: W.kickers[0] - 0.5, vy: 12 });
    g.sim(0.2);
    assert.ok(st().z > 0 || st().vz > 0, 'should launch off the kicker');
  });

  it('a kicker ignores a slow rider', () => {
    g.place({ y: W.kickers[0] - 0.1, vy: 2 });
    g.sim(0.08);
    assert.equal(st().z, 0);
  });

  it('a kicker ignores a rider off the piste', () => {
    g.place({ y: W.kickers[0] - 0.5, x: W.centre(W.kickers[0]) + 60, vy: 12 });
    g.sim(0.2);
    assert.equal(st().z, 0);
  });

  it('wipes out when landing sideways at speed', () => {
    g.place({ vy: 0 });
    g.set({ vx: 15, vy: 0.0001, z: 0.08, vz: -10, heading: Math.PI / 2 });
    g.sim(1 / 120);
    assert.ok(st().crashTimer > 0);
    assert.equal(st().crashes, 1);
  });
});

describe('trees and crashes', () => {
  it('hitting a tree crashes the rider and stops them', () => {
    g.place({ vy: 5 });
    const T = W.trees[0];
    g.set({ x: T.x, y: T.y });
    g.set({ vy: 5 });
    g.sim(1 / 120);
    assert.ok(st().crashTimer > 0);
    assert.equal(st().crashes, 1);
    assert.equal(g.speed(), 0);
  });

  it('flying high over a tree is safe', () => {
    g.place({ vy: 5 });
    const T = W.trees[0];
    g.set({ x: T.x, y: T.y });
    g.set({ vy: 5, z: 2, vz: 0 });
    g.sim(1 / 120);
    assert.equal(st().crashTimer, 0);
  });

  it('ignores steering while crashed, then recovers', () => {
    g.place({ vy: 5 });
    g.set({ crashTimer: 0.3 });
    g.input({ right: 1 });
    const a0 = st().heading;
    g.sim(0.2);
    assert.equal(st().heading, a0);
    g.sim(0.3);
    assert.ok(st().crashTimer <= 0);
  });
});

describe('finishing', () => {
  it('crossing the line in the village ends the run', () => {
    g.place({ y: W.finishY + 1, vy: 5 });
    g.sim(1 / 120);
    assert.equal(st().phase, 'done');
  });

  it('starting again resets the run', () => {
    g.start();
    assert.equal(st().phase, 'run');
    assert.equal(st().crashes, 0);
    assert.equal(st().time, 0);
    assert.equal(st().z, 0);
  });
});
