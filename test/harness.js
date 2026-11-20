'use strict';
// Runs the game's scripts (the <script src> files index.html loads, in page order) inside one Node vm with just
// enough browser stubs, so tests exercise the real game code with no dependencies.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME = process.env.GAME_FILE || path.join(__dirname, '..', 'index.html');

// Drawing calls whose order tests may check. While canvas._calls is an array, each fillRect, arc, drawImage and
// putImageData on that canvas's context is appended to it as [name, tag], where tag says what is drawn: the fill
// style for fillRect and arc ('gradient' for a gradient), the source's size 'WxH' for drawImage, and the canvas's id
// for putImageData. A test sets _calls = [], draws a frame and reads the order back (the sun before the terrain).
const RECORDED = new Set(['fillRect', 'arc', 'drawImage']);

// A 2D context stub: drawing calls are no-ops, but putImageData/getImageData
// keep real pixels so tests can inspect the terrain colour map.
function makeCtx(canvas) {
  const store = {};
  const record = (k, tag) => { if (canvas._calls) canvas._calls.push([k, tag]); };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (RECORDED.has(k)) {
        return (...args) => record(k, k === 'drawImage' ? `${args[0].width}x${args[0].height}`
          : typeof t.fillStyle === 'string' ? t.fillStyle : 'gradient');
      }
      switch (k) {
        case 'createImageData':
          return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        case 'putImageData':
          return (img) => { record(k, canvas.id); canvas._pix = img.data; };
        case 'getImageData':
          return (sx, sy, w, h) => ({
            width: w,
            height: h,
            data: canvas._pix && canvas._pix.length === w * h * 4 ? canvas._pix.slice() : new Uint8ClampedArray(w * h * 4),
          });
        case 'createLinearGradient':
          // Recorded so tests can check the sky's colour stops and extent.
          return (x0, y0, x1, y1) => {
            const gr = { x0, y0, x1, y1, stops: [], addColorStop(o, c) { gr.stops.push([o, c]); } };
            (canvas._grads = canvas._grads || []).push(gr);
            return gr;
          };
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
    _l: {}, _pix: null, _calls: null, // set to [] to record drawing calls (see RECORDED)
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

// The scripts a page runs, in page order: {file, src, code}. A <script src> is read from its path relative to the
// page; an inline <script> (older single-file versions of the game, for GAME_FILE comparisons) is taken as it is.
function pageScripts(page = GAME) {
  const html = fs.readFileSync(page, 'utf8');
  const out = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m, i) => {
    const src = /\ssrc="([^"]+)"/.exec(m[1] || '');
    if (!src) return { file: `${page}#script${i}`, src: null, code: m[2] };
    const file = path.resolve(path.dirname(page), src[1]);
    return { file, src: src[1], code: fs.readFileSync(file, 'utf8') };
  });
  if (!out.length) throw new Error('No <script> found in ' + page);
  return out;
}

function load(opts = {}) {
  // The art modules (HANGA, RiderAnim) come before the game's src/ files.
  const scripts = pageScripts();

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
  // DONT_CONTEXTIFY gives the scripts an ordinary global object, as in a browser. A contextified sandbox routes
  // every global lookup (Math, the game's function declarations) through interceptors, which made the game run
  // about ten times slower here than in a browser: build() alone took about 8.7 s.
  // (Node 22.8+; older Nodes fall back to the slow contextified sandbox.)
  const plain = vm.constants && vm.constants.DONT_CONTEXTIFY;
  const ctx = plain ? vm.createContext(plain) : vm.createContext({});
  Object.assign(ctx, sandbox);
  ctx.window = ctx;
  // Top-level let/const are shared between classic scripts, as in a browser, so run them in one context.
  for (const s of scripts) vm.runInContext(s.code, ctx, { filename: s.file });

  // Everything below goes through the game's façade, window.Gresca (src/debug.js), so tests never
  // name the game's globals. g.run stays for evaluating the art modules (HANGA, RiderAnim) in the game's realm.
  const G = () => ctx.Gresca;
  const g = {
    ctx,
    run: (code) => vm.runInContext(code, ctx),
    el: (id) => document.getElementById(id),
    // dispatch a window-level event such as keydown
    fire(type, ev) { (wl[type] || []).forEach((fn) => fn(Object.assign({ preventDefault() {} }, ev))); },
    get game() { return G(); },
    get world() { return G().world; },
    get debug() { return G().debug; },
    get config() { return G().config; },
    state: () => G().state(),
    set: (patch) => G().set(patch),
    input: (o) => G().input(o),
    resetInput: () => G().resetInput(),
    start: () => G().start(),
    step: (dt) => G().step(dt),
    stepParticles: (dt) => G().stepParticles(dt),
    clearParticles: () => G().clearParticles(),
    emitParticles: (...args) => G().emitParticles(...args),
    // draw n frames of dt seconds each
    frames(n, dt = 1 / 60) { for (let i = 0; i < n; i++) G().frame(dt); },
    // one real browser frame: run the requestAnimationFrame callbacks waiting now (the game loop) with timestamp ts, ms
    raf(ts) { raf.splice(0).forEach((fn) => fn(ts)); },
    speed: () => G().state().speed,
    // advance the physics by `sec` seconds at a fixed timestep
    sim: (sec, dt = 1 / 120) => G().sim(sec, dt),
    // reset the run and put the rider somewhere known (centre of the piste by default)
    place: (o = {}) => G().place(o),
  };

  while (timers.length) timers.shift()(); // runs build() and shows the start screen
  return g;
}

module.exports = { load, GAME, pageScripts };
