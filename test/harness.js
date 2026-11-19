'use strict';
// Runs the game's <script> inside a Node vm with just enough browser stubs,
// so tests exercise the real game code with no refactoring or dependencies.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME = process.env.GAME_FILE || path.join(__dirname, '..', 'index.html');

// A 2D context stub: drawing calls are no-ops, but putImageData/getImageData
// keep real pixels so tests can inspect the terrain colour map.
function makeCtx(canvas) {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      switch (k) {
        case 'createImageData':
          return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        case 'putImageData':
          return (img) => { canvas._pix = img.data; };
        case 'getImageData':
          return (sx, sy, w, h) => ({
            width: w,
            height: h,
            data: canvas._pix && canvas._pix.length === w * h * 4 ? canvas._pix.slice() : new Uint8ClampedArray(w * h * 4),
          });
        case 'createLinearGradient':
          return () => ({ addColorStop() {} });
        case 'measureText':
          return () => ({ width: 0 });
        default:
          return () => {};
      }
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeEl(id, w, h) {
  const el = {
    id, textContent: '', hidden: false, style: {},
    width: w || 300, height: h || 150,
    clientWidth: w || 390, clientHeight: h || 844,
    _l: {}, _pix: null,
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(t, fn) { (el._l[t] = el._l[t] || []).push(fn); },
    fire(t, ev) { (el._l[t] || []).forEach((fn) => fn(Object.assign({ preventDefault() {}, pointerId: 1 }, ev))); },
    setPointerCapture() {},
    setAttribute() {},
  };
  el._ctx = makeCtx(el);
  el.getContext = () => el._ctx;
  return el;
}

function load(opts = {}) {
  const html = fs.readFileSync(GAME, 'utf8');
  // Every <script> block in page order: the art modules (HANGA, RiderAnim) come before the game script.
  const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((b) => b[1]);
  if (!blocks.length) throw new Error('No <script> block found in ' + GAME);

  const els = {}, timers = [], raf = [], wl = {};
  const document = {
    getElementById(id) {
      return els[id] || (els[id] = id === 'c' ? makeEl(id, 390, 844) : id === 'mc' ? makeEl(id, 56, 137) : makeEl(id));
    },
    createElement() { return makeEl('created'); },
  };
  const store = Object.assign({}, opts.store);
  const sandbox = {
    document, devicePixelRatio: 1, console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    addEventListener(t, fn) { (wl[t] = wl[t] || []).push(fn); },
    setTimeout(fn) { timers.push(fn); },
    requestAnimationFrame(fn) { raf.push(fn); },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  // Top-level let/const are shared between classic scripts, as in a browser, so run them in one context.
  blocks.forEach((src, i) => vm.runInContext(src, ctx, { filename: `index.html#script${i}` }));

  const g = {
    ctx,
    run: (code) => vm.runInContext(code, ctx),
    el: (id) => document.getElementById(id),
    // dispatch a window-level event such as keydown
    fire(type, ev) { (wl[type] || []).forEach((fn) => fn(Object.assign({ preventDefault() {} }, ev))); },
    speed: () => vm.runInContext('Math.hypot(vx,vy)', ctx),
    // advance the physics by `sec` seconds at a fixed timestep
    sim(sec, dt = 1 / 120) {
      vm.runInContext(
        `(function(){const n=Math.round(${sec}/${dt});for(let i=0;i<n;i++){step(${dt});if(typeof stepParts==='function')stepParts(${dt})}})()`,
        ctx
      );
    },
    // reset the run and put the rider somewhere known (centre of the piste by default)
    place(o = {}) {
      const d = Object.assign({ x: null, y: 500, vx: 0, vy: 0, a: Math.PI / 2, jz: 0, jv: 0 }, o);
      const px = d.x === null ? `cx(${d.y})` : d.x;
      vm.runInContext(
        `start();x=${px};y=${d.y};vx=${d.vx};vy=${d.vy};a=${d.a};jz=${d.jz};jv=${d.jv};crash=0;crashes=0;B=0;L=0;R=0;JU=0;`,
        ctx
      );
    },
  };

  while (timers.length) timers.shift()(); // runs build() and shows the start screen
  return g;
}

module.exports = { load, GAME };
