// Imports the game's ES modules (the files src/main.js loads in the browser) and calls createGame(env) with just
// enough browser stubs, so tests exercise the real game code with no dependencies.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mapView } from './map-view.js';

const require = createRequire(import.meta.url);
const ROOT = path.join(import.meta.dirname, '..');

// deg, counter-clockwise: where every game load() makes puts the procedural map (docs/adr/0005-enu-frame.md).
// npm run test:rotated sets GRESCA_MAP_ROTATION_DEG; the game never reads it (createGame takes env.mapRotationRad).
export const MAP_ROTATION_DEG = Number(process.env.GRESCA_MAP_ROTATION_DEG || 0);
if (!Number.isFinite(MAP_ROTATION_DEG)) throw new Error('GRESCA_MAP_ROTATION_DEG is not a number');
export const GAME = path.join(ROOT, 'index.html');

// Evaluates a code string with the names in scope visible (a sloppy-mode function, so `with` and the completion
// value of eval work, as running it in a vm context used to). Returns the value of the last statement.
// eslint-disable-next-line no-new-func
const evalIn = new Function('scope', 'code', 'with (scope) { return eval(code); }');

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
    // the classes and attributes are kept so a test can read what the menu shows
    classes: new Set(),
    classList: {
      toggle(name, on) {
        const isOn = on === undefined ? !el.classes.has(name) : on;
        if (isOn) el.classes.add(name); else el.classes.delete(name);
      },
      add(name) { el.classes.add(name); },
      remove(name) { el.classes.delete(name); },
      contains(name) { return el.classes.has(name); },
    },
    attrs: {},
    addEventListener(t, fn) { (el._l[t] = el._l[t] || []).push(fn); },
    fire(t, ev) { (el._l[t] || []).forEach((fn) => fn(Object.assign({ preventDefault() {}, pointerId: 1 }, ev))); },
    setPointerCapture() {},
    setAttribute(name, value) { el.attrs[name] = String(value); },
  };
  el._ctx = makeCtx(el);
  el.getContext = () => el._ctx;
  return el;
}

// The game's entry for tests: src/app.js exports createGame(env). (src/main.js calls it with the real browser.)
const APP = pathToFileURL(path.join(ROOT, 'src', 'app.js')).href;
const ART = ['gresca-hanga-spec.js', 'gresca-rider-anim.js'].map((f) => path.join(ROOT, 'art', f));

// A fresh copy of the art modules (UMD classic scripts) for each game, so a test that changes HANGA in one game
// leaves every other game alone. gresca-rider-anim.js requires the spec, so it gets the same fresh copy.
function loadArt() {
  for (const f of ART) delete require.cache[f];
  return { HANGA: require(ART[0]), RiderAnim: require(ART[1]) };
}

// A new, independent game: the game's modules hold no state of their own (docs/adr/0002-es-modules-and-create-game.md),
// so every load() in one process gets its own world, rider and page stubs. opts.rotationDeg (deg, counter-clockwise;
// default MAP_ROTATION_DEG) places the map; opts.scene opens a named scene at the boot; opts.renderer, opts.THREE and
// opts.warn are passed to env as they are (the GPU terrain's choice and fallback); opts.world is a loaded real map
// (world/map-loader.js). g.game is the façade seen on the map's grid (map-view.js), g.raw the façade itself, in
// world metres.
export async function load(opts = {}) {
  const { createGame } = await import(APP);
  const els = {}, timers = [], raf = [], wl = {}, dl = {};
  const document = {
    getElementById(id) {
      return els[id] || (els[id] = id === 'c' ? makeEl(id, 390, 844) : id === 'mc' ? makeEl(id, 56, 137) : makeEl(id));
    },
    hidden: false, // document.hidden: a test sets it with g.setHidden()
    addEventListener(t, fn) { (dl[t] = dl[t] || []).push(fn); },
    createElement() { return makeEl('created'); },
    // <html>: style.setProperty records CSS custom properties (the Look's ui tokens) in style.props
    documentElement: { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } },
  };
  const store = Object.assign({}, opts.store);
  const blocked = () => { throw new Error('storage is blocked'); };
  const localStorage = opts.blockedStorage // private browsing: every access throws
    ? { getItem: blocked, setItem: blocked }
    : {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    };
  const art = loadArt();
  const env = {
    document,
    window: { addEventListener(t, fn) { (wl[t] = wl[t] || []).push(fn); } },
    localStorage,
    devicePixelRatio: 1,
    setTimeout(fn) { timers.push(fn); },
    requestAnimationFrame(fn) { raf.push(fn); },
    HANGA: art.HANGA,
    RiderAnim: art.RiderAnim,
    map: opts.map || 'test', // ?map=test in the browser; every test runs on the test slope unless it asks for 'play'
    scene: opts.scene, // ?scene=<name> in the browser: open that scene after the boot (src/scenes.js)
    mapRotationRad: (opts.rotationDeg ?? MAP_ROTATION_DEG) * Math.PI / 180,
    renderer: opts.renderer, // ?renderer=gl in the browser; Node has no WebGL, so the game falls back to the CPU
    THREE: opts.THREE,
    warn: opts.warn,
    world: opts.world, // a loaded real map (world/map-loader.js), as main.js passes for ?map=<id>
  };
  const raw = createGame(env);
  const Gresca = mapView(raw);
  // g.run(code) evaluates a code string that may name only the art modules and storage of this game (and the
  // language's own globals such as Math): there is no game state in its scope, by construction.
  const scope = Object.freeze({ HANGA: art.HANGA, RiderAnim: art.RiderAnim, localStorage });

  // Everything below goes through the game's façade, Gresca (src/debug.js), so tests never see the game's state
  // objects.
  const G = () => Gresca;
  const g = {
    run: (code) => evalIn(scope, code),
    el: (id) => document.getElementById(id),
    cssProps: () => ({ ...document.documentElement.style.props }), // CSS custom properties the game set on <html>
    // dispatch a window-level event such as keydown
    fire(type, ev) { (wl[type] || []).forEach((fn) => fn(Object.assign({ preventDefault() {} }, ev))); },
    get game() { return G(); },
    get raw() { return raw; },
    // a <= b, a >= b for a value read back through the map frame (map-view.js: exact unless the map is rotated)
    le: (a, b) => G().le(a, b),
    ge: (a, b) => G().ge(a, b),
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
    // the page goes to the background (true) or comes back: sets document.hidden and fires visibilitychange
    setHidden(hidden) { document.hidden = hidden; (dl.visibilitychange || []).forEach((fn) => fn({})); },
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
