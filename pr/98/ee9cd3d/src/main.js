// Entry point: builds the browser environment and starts one game. The only file that reads browser globals.
import { createGame } from './app.js';
import { startLoads } from './core/boot-loads.js';
import { loadMapSteps } from './world/map-loader.js';

// What the game needs from the browser. devicePixelRatio and localStorage are getters, read at each use as before:
// the ratio can change, and touching storage can throw (Safari with storage blocked), which the game catches.
// ?rot=<degrees> places the procedural map at that heading (counter-clockwise), to look at the rotated-map check
// (docs/adr/0005-enu-frame.md) in a browser. Anything that is not a finite number is ignored.
// ?scene=<name> opens a named scene, paused (src/scenes.js); without it the game is the normal game.
// The terrain is drawn on the GPU (src/view/renderer.js, docs/adr/0008-three-js-gpu-renderer.md); ?renderer=cpu draws
// it with the old CPU raycaster and skips loading three.js. If three.js fails to load or WebGL2 is missing, the game
// warns and draws on the CPU. ?fps=1 shows frame rate and frame time.
// ?map=test builds the test slope (the physics tests' map); without it the game opens on the steep play mountain
// (docs/adr/0009-play-slope.md). A ?scene=<name> is authored on the test slope, so it builds that.
// ?map=<id> for any other id loads the real map maps/<id>.terrain.json and maps/<id>.course.json (C4b, ADR 0011):
// fetched here, built in chunks with the progress on the menu, then handed to the game. If either file fails, the
// game warns and opens on the play mountain.
const query = (name) => new URLSearchParams(window.location.search).get(name);
const REAL_MAP_ID = /^[a-z0-9-]{1,40}$/; // a real map's id: the file names in maps/
const LOAD_YIELD_MS = 0; // ms between load chunks: lets the page paint the progress
// What each loader phase (world/map-loader.js LOAD_PHASES) is doing, for the menu while it runs.
const PHASE_TEXT = Object.freeze({
 validate: 'Checking the map', heights: 'Reading the heights', course: 'Laying out the run',
 corridor: 'Detailing the piste', trees: 'Planting the trees',
});

// The loaded world of a real map, or null (with a warning) when its files are missing or invalid.
async function loadRealMap(id) {
 const text = document.getElementById('t');
 const file = async (kind) => {
  const response = await fetch('maps/' + id + '.' + kind + '.json');
  if (!response.ok) throw new Error('maps/' + id + '.' + kind + '.json answered HTTP ' + response.status);
  return response.text();
 };
 try {
  text.textContent = 'Fetching ' + id + '...';
  const [terrain, course] = await Promise.all([file('terrain'), file('course')]);
  const steps = loadMapSteps(terrain, course);
  for (;;) {
   const step = steps.next();
   if (step.done) {
    text.textContent = 'Painting the mountain...'; // the game's boot (app.js) takes it from here
    return step.value;
   }
   const { phase, fraction } = step.value;
   text.textContent = 'Loading ' + id + ': ' + (PHASE_TEXT[phase] || phase) + ' (' + Math.round(fraction * 100) + '%)';
   await new Promise((resolve) => window.setTimeout(resolve, LOAD_YIELD_MS));
  }
 } catch (e) {
  console.warn('Gresca: could not load the map ' + id + ' (' + e.message + '); opening the play mountain');
  return null;
 }
}

const mapParam = query('map');
const realMapId = mapParam && mapParam !== 'test' && mapParam !== 'play' && !query('scene') &&
 REAL_MAP_ID.test(mapParam) ? mapParam : null;
const rotDeg = Number(query('rot'));
const renderer = query('renderer') === 'cpu' ? 'cpu' : 'gl';
// The three.js import and the real map's files load together (core/boot-loads.js); index.html preloads both for it.
const { THREE, world } = await startLoads({
 renderer, mapId: realMapId, loadMap: loadRealMap, warn: (message) => console.warn(message),
 importThree: () => import('../vendor/three/three.module.js'),
});

const env = Object.freeze({
 scene: query('scene'),
 renderer,
 THREE,
 map: query('map') === 'test' || query('scene') ? 'test' : 'play',
 world, // a loaded real map (?map=<id>), or null
 // The menu's map picker: reload into map id ('play' is the play mountain), keeping ?cam=, ?renderer= and the rest.
 openMap(id) {
  const url = new URL(window.location.href);
  if (id === 'play') url.searchParams.delete('map'); else url.searchParams.set('map', id);
  url.searchParams.delete('scene'); // a scene forces the test slope
  window.location.assign(url.href);
 },
 cam: query('cam'), // ?cam=<id>: the camera mode to start in (A, B or C)
 showFps: query('fps') === '1',
 now: () => performance.now(),
 warn: (message) => console.warn(message),
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
