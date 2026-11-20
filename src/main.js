// Entry point: builds the browser environment and starts one game. The only file that reads browser globals.
import { createGame } from './app.js';

// What the game needs from the browser. devicePixelRatio and localStorage are getters, read at each use as before:
// the ratio can change, and touching storage can throw (Safari with storage blocked), which the game catches.
const env = {
 document,
 window,
 get localStorage() { return window.localStorage; },
 get devicePixelRatio() { return window.devicePixelRatio; },
 requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
 setTimeout: (callback, ms) => window.setTimeout(callback, ms),
 HANGA: window.HANGA,
 RiderAnim: window.RiderAnim,
};

window.Gresca = createGame(env);
