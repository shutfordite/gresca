// Entry point: builds the browser environment and starts one game. The only file that reads browser globals.
import { createGame } from './app.js';

// What the game needs from the browser. devicePixelRatio and localStorage are getters, read at each use as before:
// the ratio can change, and touching storage can throw (Safari with storage blocked), which the game catches.
// ?rot=<degrees> places the procedural map at that heading (counter-clockwise), to look at the rotated-map check
// (docs/adr/0005-enu-frame.md) in a browser. Anything that is not a finite number is ignored.
// ?scene=<name> opens a named scene, paused (src/scenes.js); without it the game is the normal game.
const rotDeg = Number(new URLSearchParams(window.location.search).get('rot'));

const env = Object.freeze({
 scene: new URLSearchParams(window.location.search).get('scene'),
 mapRotationRad: Number.isFinite(rotDeg) ? rotDeg * Math.PI / 180 : 0,
 document,
 window,
 get localStorage() { return window.localStorage; },
 get devicePixelRatio() { return window.devicePixelRatio; },
 requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
 setTimeout: (callback, ms) => window.setTimeout(callback, ms),
 HANGA: window.HANGA,
 RiderAnim: window.RiderAnim,
});

window.Gresca = createGame(env);
