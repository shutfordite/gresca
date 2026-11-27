// The map loader (C4a): turns a gresca-map-1 terrain file and its course file (already parsed, or JSON text) into the
// same world object the procedural maps give: the terrain layer stack, the MapFrame, the Course of the run, trees,
// plus the map's sun, horizon and credits. Pure and without fetch or timers: loadMapSteps() is a generator that
// yields progress between chunks, so the caller (C4b) decides when to run each (docs/adr/0006, 0010; R1, R5).
// Memory (El Tarter, 7 x 7 km at 10 m): the heights 2 MB, the course under 0.2 MB, the corridor tiles at most 2 MB,
// the trees about 1 MB, the lookups 0.1 MB: about 6 MB held, 10 MB at the peak while decoding.
import { Terrain } from './terrain.js';
import { createMapFrame } from './map-frame.js';
import { Course, polylineCourseFromWorld } from './polyline-course.js';
import { createTreeLookup } from './build.js';
import { createCorridorLayer } from './corridor-layer.js';
import { placeTreesInTile } from './map-trees.js';
import { decodeHeights } from './map-file/format.js';
import { selectParts } from './map-file/course-run.js';
import { validateTerrain, validateCourse, widthAtS } from './map-file/validate.js';

/** m, the corridor's width past the piste's edge on each side: where the 2 m detail applies (R1, C4). */
export const CORRIDOR_MARGIN_M = 150;
const MARK_STEP_M = 16;        // m of s between the discs that mark the corridor's tiles
const MARK_PER_CHUNK = 64;     // discs marked per chunk
const TREE_TILES_PER_CHUNK = 8; // corridor tiles of trees placed per chunk
const PLACEHOLDER_WIDTH_M = 30; // m, the width of the first course, which only gives the centreline
/** m, the groomed snow eases out over this far past the piste's edge. */
export const GROOM_EDGE_M = 6;
const MAX_REPORTED_ERRORS = 5;
const RAD_TO_DEG = 180 / Math.PI;
/** The loader's phases in order; each yields {phase, fraction} when it is done. */
export const LOAD_PHASES = Object.freeze(['validate', 'heights', 'course', 'corridor', 'trees']);

const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Throws an Error naming the file and the first problems when a validator report is not ok.
function requireValid(report, what) {
 if (report.ok) return;
 const shown = report.errors.slice(0, MAX_REPORTED_ERRORS).join('\n  ');
 const more = report.errors.length > MAX_REPORTED_ERRORS ? '\n  (and ' + (report.errors.length - MAX_REPORTED_ERRORS) +
  ' more)' : '';
 throw new Error('map-loader: the ' + what + ' file is not valid:\n  ' + shown + more);
}

const parsed = (input) => (typeof input === 'string' ? JSON.parse(input) : input);

// A finished rail (Course contract: world ends, unit direction, length) from the file's {s0, s1, d, h, t}.
function finishRail(r, base) {
 const a = base.point(r.s0, r.d, {});
 const b = base.point(r.s1, r.d, {});
 const len = Math.hypot(b.x - a.x, b.y - a.y);
 return { ...r, x0: a.x, y0: a.y, x1: b.x, y1: b.y, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, len };
}

// The course of the file's run: Course.fromRun's centreline, then widths per point, the start, finish and park.
function buildCourse(terrainFile, courseFile, terrain) {
 const ways = selectParts(terrainFile, courseFile.run).parts.map((p) => p.points);
 const first = Course.fromRun(ways, { terrain, width: PLACEHOLDER_WIDTH_M });
 const { xy, s } = first.centreline();
 const widths = Float64Array.from(s, (m) => widthAtS(courseFile.widths, m));
 return polylineCourseFromWorld(xy, {
  width: widths, terrain, startS: courseFile.startS, finishS: courseFile.finishS,
  kickers: courseFile.kickers, rails: courseFile.rails.map((r) => finishRail(r, first)),
 });
}

/**
 * Builds a world in chunks. A generator: each next() does one chunk and yields {phase, fraction} (phase one of
 * LOAD_PHASES, fraction 0..1 of the whole load); it returns the world when done. Throws an Error naming the file and
 * field when either file does not validate. terrainInput and courseInput: parsed objects or JSON text. opts:
 * refiners (a list of (x, y) -> m, extra corridor refinements; see corridor-layer.js) and maxTiles (cache size).
 * The world: {id, name, frame, terrain, course, trees, treeCells, treeArr, corridor ({contains, prefetch, stats}),
 * sky ({sun: {azimuthDeg, elevationDeg} compass deg, horizon, treeSet}), piste ({difficulty}), credits ([string]),
 * licence, warnings}.
 * It has no H, M or layout: those are the procedural map's (view/colour-map.js reads them until D2).
 */
export function* loadMapSteps(terrainInput, courseInput, opts = {}) {
 requireValid(validateTerrain(terrainInput), 'terrain');
 const terrainFile = parsed(terrainInput);
 const courseReport = validateCourse(courseInput, terrainFile);
 requireValid(courseReport, 'course');
 const courseFile = parsed(courseInput);
 const warnings = courseReport.warnings.slice();
 yield { phase: 'validate', fraction: 0.2 };

 const { nx, ny, cellM } = terrainFile.grid;
 const frame = createMapFrame(terrainFile.frame);
 const base = Terrain.grid(decodeHeights(terrainFile), nx, ny, cellM, frame);
 const corridor = createCorridorLayer({ frame, refiners: opts.refiners, maxTiles: opts.maxTiles });
 const hold = { course: null }; // set below: the groomed mask needs the course, the course needs the terrain
 const where = { s: 0, d: 0, tx: 0, ty: 0 };
 const groomed = (x, y) => groomedAt(hold.course, x, y, where);
 const terrain = Terrain.create({ base, detail: corridor.layer, groomed });
 yield { phase: 'heights', fraction: 0.4 };

 const course = buildCourse(terrainFile, courseFile, terrain);
 hold.course = course;
 yield { phase: 'course', fraction: 0.55 };

 yield* markCorridor(course, corridor);
 const treeCells = new Map();
 const treeArr = [];
 const treeWorld = { frame, course, slopeDeg: baseSlopeDeg(base), width: nx * cellM, length: ny * cellM };
 yield* placeTrees(treeWorld, corridor, treeCells, treeArr);

 return {
  id: terrainFile.id, name: courseFile.name, frame, terrain, course, treeCells, treeArr,
  trees: createTreeLookup(treeCells, frame),
  corridor: Object.freeze({ contains: corridor.contains, prefetch: corridor.prefetch, stats: corridor.stats }),
  sky: Object.freeze({ sun: courseFile.sun, horizon: courseFile.horizon, treeSet: courseFile.treeSet }),
  piste: Object.freeze({ difficulty: courseFile.run.difficulty }), // the run's OpenSkiMap difficulty ('advanced')
  credits: [...new Set(terrainFile.sources.map((s) => s.attribution))],
  licence: terrainFile.licence, warnings,
 };
}

/** The whole load at once (tests, tools): loadMapSteps run to the end. Returns the world. */
export function loadMap(terrainInput, courseInput, opts) {
 const steps = loadMapSteps(terrainInput, courseInput, opts);
 for (let step = steps.next(); ; step = steps.next()) if (step.done) return step.value;
}

// (x, y) -> deg, the slope of the coarse base alone: asking the composed terrain would build every corridor tile now.
function baseSlopeDeg(base) {
 const g = { gx: 0, gy: 0 };
 return (x, y) => {
  g.gx = 0;
  g.gy = 0;
  base.gradient(x, y, g);
  return Math.atan(Math.hypot(g.gx, g.gy)) * RAD_TO_DEG;
 };
}

// 0..1, how groomed the snow is at (x, y): 1 on the piste, easing to 0 GROOM_EDGE_M past its edge.
function groomedAt(course, x, y, where) {
 if (!course) return 0;
 course.project(x, y, where);
 return 1 - smoothstep((Math.abs(where.d) - course.widthAt(where.s) / 2) / GROOM_EDGE_M);
}

// Marks the tiles within the corridor of the piste from s 0 to the end, a chunk of discs at a time.
function* markCorridor(course, corridor) {
 const at = { x: 0, y: 0 };
 const count = Math.ceil(course.length / MARK_STEP_M) + 1;
 for (let i = 0; i < count; i++) {
  const s = Math.min(i * MARK_STEP_M, course.length);
  course.point(s, 0, at);
  corridor.markDisc(at.x, at.y, course.widthAt(s) / 2 + CORRIDOR_MARGIN_M);
  if ((i + 1) % MARK_PER_CHUNK === 0) yield { phase: 'corridor', fraction: 0.55 + 0.25 * (i + 1) / count };
 }
 yield { phase: 'corridor', fraction: 0.8 };
}

// Scatters the trees over the corridor's tiles, a few tiles per chunk.
function* placeTrees(o, corridor, treeCells, treeArr) {
 const tiles = corridor.memberTiles();
 const treeOpts = { ...o, corridorM: CORRIDOR_MARGIN_M };
 for (let i = 0; i < tiles.length; i++) {
  placeTreesInTile(tiles[i].iu, tiles[i].iv, treeOpts, treeCells, treeArr);
  if ((i + 1) % TREE_TILES_PER_CHUNK === 0) yield { phase: 'trees', fraction: 0.8 + 0.2 * (i + 1) / tiles.length };
 }
 yield { phase: 'trees', fraction: 1 };
}
