// The gresca-map-1 terrain file validator: schema, sizes, heights, slope and DEM defect checks (R5), attribution.
// Pure, no Node APIs, safe on untrusted input: the game can import it to check a map before it builds one (C4).
import {
 FORMAT, KIND_TERRAIN, PROJECTION, HEIGHT_ENCODING, SPIKE_MIN_M, SPIKE_SLOPE, fnv1a32, heightBytes, median8,
} from './format.js';
import {
 KIND_COURSE, TREE_SETS, RAIL_TYPES, MEAN_SLOPE_TOLERANCE_DEG, MAX_MEAN_SLOPE_DEG, WIDTH_RANGE_M, MIN_LENGTH_M,
 RUN_BOUNDS_TOLERANCE_M, SUN_ELEVATION_RANGE_DEG, HORIZON_STEPS_DEG, HORIZON_ANGLE_RANGE_DEG,
} from './course-format.js';
import { measureMeanSlopeDeg, runCourse, selectParts, terrainLayer } from './course-run.js';

/** The validator's size limits: anything larger is rejected before it is decoded or walked. */
export const VALIDATE_LIMITS = Object.freeze({
 fileChars: 24 * 1024 * 1024, // characters of JSON text
 depth: 12, // nesting levels
 nodes: 6000000, // values in the whole tree
 gridSide: 2048, // samples along one side
 samples: 2048 * 2048, // samples in the grid
 sources: 32,
 lines: 20000, // pistes plus lifts
 points: 100000, // points in one line
 totalPoints: 2000000,
 text: 1000, // characters in one string field (names, attribution); heights.data is exempt
 errors: 100, // errors reported before giving up
});
/** m, the lowest and highest heights a real map can have (the Dead Sea shore, Everest with margin). */
export const HEIGHT_RANGE_M = Object.freeze({ min: -450, max: 8900 });
/** deg, a slope steeper than this anywhere is reported as a likely cliff artefact. */
export const MAX_PLAUSIBLE_SLOPE_DEG = 60;
/** deg, the "no-go" steepness of R5, for the share of the map steeper than it. */
export const NO_GO_SLOPE_DEG = 45;

const ROLES = new Set(['elevation', 'pistes', 'lifts']);
const DIFFICULTIES = new Set(['', 'novice', 'easy', 'intermediate', 'advanced', 'expert', 'freeride', 'extreme']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const TOP_KEYS = ['format', 'kind', 'id', 'name', 'generator', 'licence', 'sources', 'origin', 'projection', 'frame',
 'grid', 'bounds', 'latLonBounds', 'heights', 'pistes', 'lifts'];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OSM_ID = /^(node|way|relation)\/\d{1,15}$/;
const BOUNDS_TOLERANCE_M = 1e-6; // m, bounds against frame and grid
const POINT_TOLERANCE_M = 0.05; // m, a point's rounding past the bounds

/**
 * Checks a terrain file, given as JSON text or a parsed value: {ok, errors: [string], warnings: [string], stats:
 * {minM, maxM, meanSlopeDeg, maxSlopeDeg, noGoShare, spikes, pits} or null}. Never throws on bad input.
 */
export function validateTerrain(input) {
 const report = { errors: [], warnings: [], stats: null };
 const file = parse(input, report);
 if (file !== undefined && checkTree(file, report) && isRecord(file)) checkFile(file, report);
 else if (report.errors.length === 0) report.errors.push('(root): must be an object');
 return { ok: report.errors.length === 0, errors: report.errors, warnings: report.warnings, stats: report.stats };
}

function parse(input, report, maxChars = VALIDATE_LIMITS.fileChars) {
 if (typeof input !== 'string') return input;
 if (input.length > maxChars) {
  report.errors.push('(file): ' + input.length + ' characters is over the limit of ' + maxChars);
  return undefined;
 }
 try {
  return JSON.parse(input);
 } catch (e) {
  report.errors.push('(file): not JSON (' + e.message + ')');
  return undefined;
 }
}

// Walks the whole value without recursion: only plain objects, arrays, strings, finite numbers, booleans and null,
// no forbidden keys, bounded depth and size. Returns false (with an error) at the first problem.
function checkTree(root, report) {
 const stack = [[root, '(root)', 0]];
 let nodes = 0;
 while (stack.length) {
  const [v, where, depth] = stack.pop();
  if (++nodes > VALIDATE_LIMITS.nodes) return fail(report, '(file): more than ' + VALIDATE_LIMITS.nodes + ' values');
  if (v === null || typeof v === 'string' || typeof v === 'boolean') continue;
  if (typeof v === 'number') {
   if (!Number.isFinite(v)) return fail(report, where + ': ' + v + ' is not a finite number');
   continue;
  }
  if (typeof v !== 'object') return fail(report, where + ': a ' + typeof v + ' is not JSON data');
  if (depth >= VALIDATE_LIMITS.depth) return fail(report, where + ': nested deeper than ' + VALIDATE_LIMITS.depth);
  if (Array.isArray(v)) {
   for (let i = 0; i < v.length; i++) stack.push([v[i], where + '[' + i + ']', depth + 1]);
   continue;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return fail(report, where + ': not a plain object');
  for (const key of Object.keys(v)) {
   if (FORBIDDEN_KEYS.has(key)) return fail(report, where + ': forbidden key "' + key + '"');
   stack.push([v[key], where + '.' + key, depth + 1]);
  }
 }
 return true;
}

function fail(report, message) {
 report.errors.push(message);
 return false;
}

function checkFile(f, report) {
 const err = (m) => {
  if (report.errors.length < VALIDATE_LIMITS.errors) report.errors.push(m);
 };
 const name = (typeof f.id === 'string' && ID_PATTERN.test(f.id) ? f.id : '(unknown id)') + '.terrain.json';
 const at = (field, why) => err(name + ' ' + field + ': ' + why);
 if (f.format !== FORMAT) at('format', 'must be "' + FORMAT + '"');
 if (f.kind !== KIND_TERRAIN) at('kind', 'must be "' + KIND_TERRAIN + '"');
 if (typeof f.id !== 'string' || !ID_PATTERN.test(f.id)) at('id', 'must be lower-case kebab-case, 1..64 characters');
 checkText(f, 'name', at, true);
 checkText(f, 'generator', at, false);
 checkText(f, 'licence', at, true);
 if (f.projection !== PROJECTION) at('projection', 'must be "' + PROJECTION + '"');
 for (const key of Object.keys(f)) {
  if (!TOP_KEYS.includes(key)) report.warnings.push(name + ': unknown field "' + key + '" is ignored');
 }
 checkSources(f, at);
 const grid = checkPlacement(f, at);
 if (grid) checkHeights(f, grid, at, report, name);
 const bounds = grid ? f.bounds : null;
 checkLines(f, 'pistes', bounds, at, report, name);
 checkLines(f, 'lifts', bounds, at, report, name);
 checkOdbl(f, at);
}

const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

function checkText(obj, key, at, required, field = key) {
 const v = obj[key];
 if (typeof v !== 'string') return at(field, 'must be a string');
 if (required && v.trim() === '') return at(field, 'must not be empty');
 if (v.length > VALIDATE_LIMITS.text) at(field, 'is longer than ' + VALIDATE_LIMITS.text + ' characters');
}

function checkSources(f, at) {
 if (!Array.isArray(f.sources) || f.sources.length === 0) return at('sources', 'must list at least one source');
 if (f.sources.length > VALIDATE_LIMITS.sources) return at('sources', 'more than ' + VALIDATE_LIMITS.sources);
 f.sources.forEach((s, i) => {
  const field = 'sources[' + i + ']';
  if (!isRecord(s)) return at(field, 'must be an object');
  if (!ROLES.has(s.role)) at(field + '.role', 'must be one of ' + [...ROLES].join(', '));
  for (const k of ['name', 'licence', 'attribution']) checkText(s, k, at, true, field + '.' + k);
  for (const k of ['url', 'retrieved', 'sha256']) checkText(s, k, at, false, field + '.' + k);
 });
 if (!f.sources.some((s) => isRecord(s) && s.role === 'elevation')) at('sources', 'has no elevation source');
}

// A map with OSM-derived data is a derivative database under ODbL: it says so, and credits the source.
function checkOdbl(f, at) {
 const hasLines = (Array.isArray(f.pistes) && f.pistes.length > 0) || (Array.isArray(f.lifts) && f.lifts.length > 0);
 if (!hasLines) return;
 if (f.licence !== 'ODbL-1.0') at('licence', 'must be "ODbL-1.0": the pistes and lifts come from OpenStreetMap');
 const credited = Array.isArray(f.sources) && f.sources.some((s) => isRecord(s) &&
  (s.role === 'pistes' || s.role === 'lifts') && /ODbL/.test(String(s.licence)) &&
  /OpenStreetMap/.test(String(s.attribution)));
 if (!credited) at('sources', 'needs a pistes or lifts source with an ODbL licence crediting OpenStreetMap');
}

// Checks origin, frame, grid, bounds and latLonBounds; returns {nx, ny, cellM} if the grid can be used, else null.
function checkPlacement(f, at) {
 const o = f.origin;
 if (!isRecord(o) || !(Math.abs(o.lat) <= 85) || !(Math.abs(o.lon) <= 180)) at('origin', 'needs lat and lon (deg)');
 const fr = f.frame;
 if (!isRecord(fr) || !isNumber(fr.originX) || !isNumber(fr.originY)) return at('frame', 'needs originX, originY (m)');
 if (fr.rotation !== 0) at('frame.rotation', 'must be 0: rows run north to south');
 const g = f.grid;
 if (!isRecord(g)) return at('grid', 'must be an object');
 const side = (n) => Number.isInteger(n) && n >= 2 && n <= VALIDATE_LIMITS.gridSide;
 if (!side(g.nx) || !side(g.ny)) return at('grid', 'nx and ny must be integers 2..' + VALIDATE_LIMITS.gridSide);
 if (g.nx * g.ny > VALIDATE_LIMITS.samples) return at('grid', 'more than ' + VALIDATE_LIMITS.samples + ' samples');
 if (!(g.cellM >= 1 && g.cellM <= 100)) return at('grid.cellM', 'must be 1..100 m');
 const want = {
  minX: fr.originX, maxX: fr.originX + (g.nx - 1) * g.cellM,
  minY: fr.originY - (g.ny - 1) * g.cellM, maxY: fr.originY,
 };
 const b = f.bounds;
 if (!isRecord(b)) return at('bounds', 'must be an object');
 for (const k of Object.keys(want)) {
  if (!(Math.abs(b[k] - want[k]) <= BOUNDS_TOLERANCE_M)) return at('bounds.' + k, 'must be ' + want[k] + ' m');
 }
 const ll = f.latLonBounds;
 const okBox = isRecord(ll) && ll.south < ll.north && ll.west < ll.east && Math.abs(ll.south) <= 90 &&
  Math.abs(ll.north) <= 90 && Math.abs(ll.west) <= 180 && Math.abs(ll.east) <= 180;
 if (!okBox) at('latLonBounds', 'needs south < north and west < east (deg)');
 else if (isRecord(o) && !(o.lat > ll.south && o.lat < ll.north && o.lon > ll.west && o.lon < ll.east)) {
  at('latLonBounds', 'must contain the origin');
 }
 return { nx: g.nx, ny: g.ny, cellM: g.cellM };
}

function checkHeights(f, grid, at, report, name) {
 const h = f.heights;
 if (!isRecord(h)) return at('heights', 'must be an object');
 if (h.encoding !== HEIGHT_ENCODING) return at('heights.encoding', 'must be "' + HEIGHT_ENCODING + '"');
 if (!isNumber(h.baseM) || !(h.scaleM > 0 && h.scaleM <= 1)) return at('heights', 'needs baseM and scaleM 0..1 (m)');
 const count = grid.nx * grid.ny;
 const bytes = heightBytes(h, count);
 if (!bytes) return at('heights.data', 'must be ' + count + ' samples (nx * ny) of base64 Uint16');
 if (h.fnv1a32 !== fnv1a32(bytes)) at('heights.fnv1a32', 'does not match the data (damaged or edited)');
 const heights = new Float64Array(count);
 let min = Infinity;
 let max = -Infinity;
 for (let i = 0; i < count; i++) {
  heights[i] = h.baseM + (bytes[2 * i] | (bytes[2 * i + 1] << 8)) * h.scaleM;
  min = Math.min(min, heights[i]);
  max = Math.max(max, heights[i]);
 }
 const half = h.scaleM / 2;
 if (!(Math.abs(h.minM - min) <= half) || !(Math.abs(h.maxM - max) <= half)) {
  at('heights', 'minM and maxM must be the data\'s lowest and highest (' + min + ', ' + max + ' m)');
 }
 if (min < HEIGHT_RANGE_M.min || max > HEIGHT_RANGE_M.max) {
  at('heights', min + '..' + max + ' m is outside ' + HEIGHT_RANGE_M.min + '..' + HEIGHT_RANGE_M.max + ' m');
 }
 report.stats = surfaceStats(heights, grid, min, max);
 const w = report.warnings;
 const s = report.stats;
 if (max - min < 1) w.push(name + ' heights: the map is flat (under 1 m of relief)');
 if (s.spikes > 0) w.push(name + ' heights: ' + s.spikes + ' spike(s) above their neighbours (DEM defect, R5)');
 if (s.pits > 0) w.push(name + ' heights: ' + s.pits + ' pit(s) or hole(s) below their neighbours (DEM defect, R5)');
 if (s.maxSlopeDeg > MAX_PLAUSIBLE_SLOPE_DEG) {
  w.push(name + ' heights: slopes up to ' + s.maxSlopeDeg + ' deg (cliff or DEM artefact)');
 }
}

// Slope statistics (deg, from central differences) and defect counts (samples further than the spike limit above or
// below the median of their 8 neighbours) over the grid's interior.
function surfaceStats(heights, { nx, ny, cellM }, min, max) {
 const limit = Math.max(SPIKE_MIN_M, SPIKE_SLOPE * cellM);
 const around = new Float64Array(8);
 let sum = 0;
 let steepest = 0;
 let noGo = 0;
 let spikes = 0;
 let pits = 0;
 let n = 0;
 for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
  const k = j * nx + i;
  const gx = (heights[k + 1] - heights[k - 1]) / (2 * cellM);
  const gy = (heights[k - nx] - heights[k + nx]) / (2 * cellM);
  const slope = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI;
  sum += slope;
  steepest = Math.max(steepest, slope);
  if (slope > NO_GO_SLOPE_DEG) noGo++;
  n++;
  let a = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) around[a++] = heights[k + dj * nx + di];
  const dev = heights[k] - median8(around);
  if (dev > limit) spikes++;
  if (dev < -limit) pits++;
 }
 const r = (v) => Math.round(v * 100) / 100;
 return { minM: r(min), maxM: r(max), meanSlopeDeg: n ? r(sum / n) : 0, maxSlopeDeg: r(steepest),
  noGoShare: n ? r(noGo / n) : 0, spikes, pits };
}

function checkLines(f, key, bounds, at, report, name) {
 const list = f[key];
 if (!Array.isArray(list)) return at(key, 'must be an array');
 if (list.length > VALIDATE_LIMITS.lines) return at(key, 'more than ' + VALIDATE_LIMITS.lines + ' lines');
 let total = 0;
 list.forEach((line, i) => {
  const field = key + '[' + i + ']';
  if (!isRecord(line)) return at(field, 'must be an object');
  if (typeof line.id !== 'string' || line.id === '' || line.id.length > VALIDATE_LIMITS.text) at(field + '.id', 'needs an id');
  if (!Number.isInteger(line.part) || line.part < 0) at(field + '.part', 'must be an integer >= 0');
  if (!Array.isArray(line.osm) || !line.osm.every((id) => typeof id === 'string' && OSM_ID.test(id))) {
   at(field + '.osm', 'must list OSM ids like "way/123"');
  }
  checkText(line, 'name', at, false, field + '.name');
  if (key === 'pistes') {
   checkText(line, 'difficulty', at, false, field + '.difficulty');
   checkText(line, 'grooming', at, false, field + '.grooming');
   if (typeof line.area !== 'boolean') at(field + '.area', 'must be true or false');
   if (typeof line.difficulty === 'string' && !DIFFICULTIES.has(line.difficulty)) {
    report.warnings.push(name + ' ' + field + '.difficulty: unknown "' + line.difficulty + '"');
   }
  } else {
   checkText(line, 'kind', at, false, field + '.kind');
  }
  total += checkPoints(line.points, bounds, field + '.points', at);
 });
 if (total > VALIDATE_LIMITS.totalPoints) at(key, 'more than ' + VALIDATE_LIMITS.totalPoints + ' points');
}

// Checks a polyline [[x, y], ...] (m) lies in bounds; returns its point count.
function checkPoints(points, bounds, field, at) {
 if (!Array.isArray(points) || points.length < 2 || points.length > VALIDATE_LIMITS.points) {
  at(field, 'must be 2..' + VALIDATE_LIMITS.points + ' points');
  return 0;
 }
 const t = POINT_TOLERANCE_M;
 for (let k = 0; k < points.length; k++) {
  const p = points[k];
  if (!Array.isArray(p) || p.length !== 2 || !isNumber(p[0]) || !isNumber(p[1])) {
   at(field + '[' + k + ']', 'must be [x, y] (m)');
   return points.length;
  }
  if (bounds && (p[0] < bounds.minX - t || p[0] > bounds.maxX + t || p[1] < bounds.minY - t ||
   p[1] > bounds.maxY + t)) {
   at(field + '[' + k + ']', 'is outside the bounds');
   return points.length;
  }
 }
 return points.length;
}

/** The course validator's size limits (a course file is small and authored: far under the terrain's). */
export const COURSE_LIMITS = Object.freeze({
 fileChars: 1024 * 1024, // characters of JSON text
 osm: 200, // OSM ids in the run
 widths: 200, // width stops
 items: 500, // kickers, and rails
});
const KICKER_HALF_WIDTH_M = Object.freeze({ min: 0.5, max: 20 }); // m, a kicker's launch zone across
const KICKER_DEPTH_M = Object.freeze({ min: 1, max: 40 }); // m, a kicker's launch zone along
const KICKER_GAIN = Object.freeze({ min: 0.5, max: 3 }); // dimensionless, launchGain (sim/jump.js: 1 and 1.35)
const RAIL_HEIGHT_M = Object.freeze({ min: 0.05, max: 3 }); // m, a rail's or box's top above the snow
const COURSE_TOP_KEYS = ['format', 'kind', 'id', 'name', 'generator', 'licence', 'terrain', 'sources', 'run',
 'widths', 'startS', 'finishS', 'meanSlopeDeg', 'kickers', 'rails', 'sun', 'treeSet', 'horizon'];
const COMPASS_FULL_DEG = 360;

/**
 * Checks a course file (JSON text or a parsed value) and, when terrain is given (a terrain file that
 * validateTerrain() accepted), the course against it: the run exists and joins, lies inside the bounds, is long
 * enough, the park and finish fit on it, and meanSlopeDeg matches the run measured on that terrain. Without terrain
 * only the file itself is checked. Returns {ok, errors: [string], warnings: [string], stats: {lengthM,
 * measuredMeanSlopeDeg} or null}. Never throws on bad input.
 */
export function validateCourse(input, terrain = null) {
 const report = { errors: [], warnings: [], stats: null };
 const file = parse(input, report, COURSE_LIMITS.fileChars);
 if (file !== undefined && checkTree(file, report) && isRecord(file)) {
  const ctx = courseContext(file, report);
  checkCourseFile(file, ctx);
  if (terrain && ctx.fileOk) checkAgainstTerrain(file, terrain, ctx);
 } else if (report.errors.length === 0) report.errors.push('(root): must be an object');
 return { ok: report.errors.length === 0, errors: report.errors, warnings: report.warnings, stats: report.stats };
}

function courseContext(f, report) {
 const name = (typeof f.id === 'string' && ID_PATTERN.test(f.id) ? f.id : '(unknown id)') + '.course.json';
 const at = (field, why) => {
  if (report.errors.length < VALIDATE_LIMITS.errors) report.errors.push(name + ' ' + field + ': ' + why);
 };
 return { report, name, at, fileOk: false };
}

function checkCourseFile(f, ctx) {
 const { at, report, name } = ctx;
 const before = report.errors.length;
 if (f.format !== FORMAT) at('format', 'must be "' + FORMAT + '"');
 if (f.kind !== KIND_COURSE) at('kind', 'must be "' + KIND_COURSE + '"');
 if (typeof f.id !== 'string' || !ID_PATTERN.test(f.id)) at('id', 'must be lower-case kebab-case, 1..64 characters');
 checkText(f, 'name', at, true);
 checkText(f, 'generator', at, false);
 if (f.licence !== 'ODbL-1.0') at('licence', 'must be "ODbL-1.0": the run comes from OpenStreetMap');
 for (const key of Object.keys(f)) {
  if (!COURSE_TOP_KEYS.includes(key)) report.warnings.push(name + ': unknown field "' + key + '" is ignored');
 }
 checkTerrainRef(f, at);
 checkCourseSources(f, at);
 checkRunRef(f, at);
 const widths = checkWidths(f, at);
 const span = checkSpan(f, at);
 if (!isNumber(f.meanSlopeDeg) || f.meanSlopeDeg < 0 || f.meanSlopeDeg > MAX_MEAN_SLOPE_DEG) {
  at('meanSlopeDeg', 'must be 0..' + MAX_MEAN_SLOPE_DEG + ' deg');
 }
 if (widths && span) {
  checkKickers(f.kickers, widths, span, at);
  checkRails(f.rails, widths, span, at);
 }
 checkSun(f.sun, at);
 if (!TREE_SETS.includes(f.treeSet)) at('treeSet', 'must be one of ' + TREE_SETS.join(', '));
 checkHorizon(f.horizon, at);
 ctx.widths = widths;
 ctx.fileOk = report.errors.length === before;
}

function checkTerrainRef(f, at) {
 const t = f.terrain;
 if (!isRecord(t)) return at('terrain', 'must be {id, heightsFnv1a32}: the terrain this course was authored on');
 if (t.id !== f.id) at('terrain.id', 'must be "' + f.id + '": a course is <id>.course.json beside <id>.terrain.json');
 if (typeof t.heightsFnv1a32 !== 'string' || !/^[0-9a-f]{8}$/.test(t.heightsFnv1a32)) {
  at('terrain.heightsFnv1a32', 'must be 8 hex digits');
 }
}

// A course is OSM-derived: it carries the ODbL licence and the credit for the pistes (and the elevation source).
function checkCourseSources(f, at) {
 if (!Array.isArray(f.sources) || f.sources.length === 0) return at('sources', 'must list at least one source');
 if (f.sources.length > VALIDATE_LIMITS.sources) return at('sources', 'more than ' + VALIDATE_LIMITS.sources);
 f.sources.forEach((s, i) => {
  const field = 'sources[' + i + ']';
  if (!isRecord(s)) return at(field, 'must be an object');
  if (!ROLES.has(s.role)) at(field + '.role', 'must be one of ' + [...ROLES].join(', '));
  for (const k of ['name', 'licence', 'attribution']) checkText(s, k, at, true, field + '.' + k);
  for (const k of ['url', 'retrieved']) checkText(s, k, at, false, field + '.' + k);
 });
 const credited = f.sources.some((s) => isRecord(s) && (s.role === 'pistes' || s.role === 'lifts') &&
  /ODbL/.test(String(s.licence)) && /OpenStreetMap/.test(String(s.attribution)));
 if (!credited) at('sources', 'needs a pistes source with an ODbL licence crediting OpenStreetMap (ODbL attribution)');
}

function checkRunRef(f, at) {
 const run = f.run;
 if (!isRecord(run)) return at('run', 'must be {osm, name, difficulty}');
 const osm = run.osm;
 const hasOsm = Array.isArray(osm) && osm.length > 0;
 if (osm !== undefined && !Array.isArray(osm)) at('run.osm', 'must be a list of OSM ids like "way/123"');
 else if (hasOsm && (osm.length > COURSE_LIMITS.osm || !osm.every((id) => typeof id === 'string' && OSM_ID.test(id)))) {
  at('run.osm', 'must be at most ' + COURSE_LIMITS.osm + ' OSM ids like "way/123"');
 }
 checkText(run, 'name', at, !hasOsm, 'run.name');
 checkText(run, 'difficulty', at, false, 'run.difficulty');
 if (typeof run.difficulty === 'string' && !DIFFICULTIES.has(run.difficulty)) {
  at('run.difficulty', 'must be one of ' + [...DIFFICULTIES].map((d) => '"' + d + '"').join(', '));
 }
}

// The width stops [[s, m], ...]; returns them when usable, else null.
function checkWidths(f, at) {
 const w = f.widths;
 if (!Array.isArray(w) || w.length === 0 || w.length > COURSE_LIMITS.widths) {
  return at('widths', 'must be 1..' + COURSE_LIMITS.widths + ' stops [s, widthM]') ?? null;
 }
 let ok = true;
 w.forEach((stop, i) => {
  const field = 'widths[' + i + ']';
  if (!Array.isArray(stop) || stop.length !== 2 || !isNumber(stop[0]) || !isNumber(stop[1])) {
   ok = false;
   return at(field, 'must be [s, widthM] in metres');
  }
  if (stop[1] < WIDTH_RANGE_M.min || stop[1] > WIDTH_RANGE_M.max) {
   ok = false;
   at(field, 'width ' + stop[1] + ' m is outside ' + WIDTH_RANGE_M.min + '..' + WIDTH_RANGE_M.max + ' m');
  }
  if (i > 0 && !(stop[0] > w[i - 1][0])) {
   ok = false;
   at(field, 's ' + stop[0] + ' m must be greater than the previous stop\'s (stops are in s order)');
  }
 });
 if (ok && w[0][0] !== 0) {
  ok = false;
  at('widths[0]', 'must start at s 0');
 }
 return ok ? w : null;
}

function checkSpan(f, at) {
 if (!isNumber(f.startS) || !isNumber(f.finishS) || f.startS < 0) {
  at('startS', 'startS and finishS must be numbers of metres, startS >= 0');
  return null;
 }
 if (!(f.startS < f.finishS)) {
  at('finishS', 'finish (' + f.finishS + ' m) must be after the start (' + f.startS + ' m)');
  return null;
 }
 if (f.finishS - f.startS < MIN_LENGTH_M) {
  at('finishS', 'the run from start to finish must be at least ' + MIN_LENGTH_M + ' m');
 }
 return { startS: f.startS, finishS: f.finishS };
}

/** m, the width of the piste at s: the stops [[s, m], ...] joined by straight lines, constant past the ends. */
export function widthAtS(widths, s) {
 if (s <= widths[0][0]) return widths[0][1];
 for (let i = 1; i < widths.length; i++) {
  if (s <= widths[i][0]) {
   const t = (s - widths[i - 1][0]) / (widths[i][0] - widths[i - 1][0]);
   return widths[i - 1][1] + t * (widths[i][1] - widths[i - 1][1]);
  }
 }
 return widths[widths.length - 1][1];
}

// m, the narrowest the piste is anywhere in [a, b]: at a, at b or at a stop between them.
function narrowestOver(widths, a, b) {
 let least = Math.min(widthAtS(widths, a), widthAtS(widths, b));
 for (const [s, m] of widths) if (s > a && s < b) least = Math.min(least, m);
 return least;
}

function checkList(list, key, at) {
 if (!Array.isArray(list)) return at(key, 'must be an array') ?? false;
 if (list.length > COURSE_LIMITS.items) return at(key, 'more than ' + COURSE_LIMITS.items + ' items') ?? false;
 return true;
}

function checkKickers(list, widths, span, at) {
 if (!checkList(list, 'kickers', at)) return;
 let previous = -Infinity;
 list.forEach((k, i) => {
  const field = 'kickers[' + i + ']';
  if (!isRecord(k) || ![k.s, k.d, k.halfWidth, k.depth].every(isNumber) || typeof k.big !== 'boolean') {
   return at(field, 'must be {s, d, halfWidth, depth (m), big (true or false)}');
  }
  if (!(k.halfWidth >= KICKER_HALF_WIDTH_M.min && k.halfWidth <= KICKER_HALF_WIDTH_M.max)) {
   at(field + '.halfWidth', 'must be ' + KICKER_HALF_WIDTH_M.min + '..' + KICKER_HALF_WIDTH_M.max + ' m');
  }
  if (!(k.depth >= KICKER_DEPTH_M.min && k.depth <= KICKER_DEPTH_M.max)) {
   at(field + '.depth', 'must be ' + KICKER_DEPTH_M.min + '..' + KICKER_DEPTH_M.max + ' m');
  }
  if (k.launchGain !== undefined && !(k.launchGain >= KICKER_GAIN.min && k.launchGain <= KICKER_GAIN.max)) {
   at(field + '.launchGain', 'must be ' + KICKER_GAIN.min + '..' + KICKER_GAIN.max + ' (dimensionless)');
  }
  if (!(k.s > previous)) at(field + '.s', k.s + ' m is not after the previous kicker (kickers are in s order)');
  previous = k.s;
  if (k.s < span.startS || k.s + k.depth > span.finishS) {
   at(field + '.s', 'the kicker (' + k.s + ' to ' + (k.s + k.depth) + ' m) must lie between the start and the finish');
  }
  const half = narrowestOver(widths, k.s, k.s + k.depth) / 2;
  if (Math.abs(k.d) + k.halfWidth > half) {
   at(field + '.d', 'the kicker (d ' + k.d + ' m, half-width ' + k.halfWidth + ' m) is outside the piste width (+-' +
    half + ' m)');
  }
 });
}

function checkRails(list, widths, span, at) {
 if (!checkList(list, 'rails', at)) return;
 let previous = -Infinity;
 list.forEach((r, i) => {
  const field = 'rails[' + i + ']';
  if (!isRecord(r) || ![r.s0, r.s1, r.d, r.h].every(isNumber) || !RAIL_TYPES.includes(r.t)) {
   return at(field, 'must be {s0, s1, d, h (m), t: ' + RAIL_TYPES.map((t) => '"' + t + '"').join(' or ') + '}');
  }
  if (!(r.s1 > r.s0)) at(field + '.s1', 'must be after s0');
  if (!(r.h >= RAIL_HEIGHT_M.min && r.h <= RAIL_HEIGHT_M.max)) {
   at(field + '.h', 'must be ' + RAIL_HEIGHT_M.min + '..' + RAIL_HEIGHT_M.max + ' m');
  }
  if (!(r.s0 >= previous)) at(field + '.s0', r.s0 + ' m is before the previous rail (rails are in s order)');
  previous = r.s0;
  if (r.s0 < span.startS || r.s1 > span.finishS) {
   at(field + '.s0', 'the rail (' + r.s0 + ' to ' + r.s1 + ' m) must lie between the start and the finish');
  }
  const half = narrowestOver(widths, r.s0, r.s1) / 2;
  if (Math.abs(r.d) > half) {
   at(field + '.d', 'the rail (d ' + r.d + ' m) is outside the piste width (+-' + half + ' m)');
  }
 });
}

// The sun is the one place a course holds compass degrees (clockwise from north), as the art spec wants them.
function checkSun(sun, at) {
 if (!isRecord(sun) || !isNumber(sun.azimuthDeg) || !isNumber(sun.elevationDeg)) {
  return at('sun', 'must be {azimuthDeg, elevationDeg} in compass degrees');
 }
 if (sun.azimuthDeg < 0 || sun.azimuthDeg >= COMPASS_FULL_DEG) at('sun.azimuthDeg', 'must be 0..360 deg (compass)');
 if (sun.elevationDeg < SUN_ELEVATION_RANGE_DEG.min || sun.elevationDeg > SUN_ELEVATION_RANGE_DEG.max) {
  at('sun.elevationDeg', 'must be ' + SUN_ELEVATION_RANGE_DEG.min + '..' + SUN_ELEVATION_RANGE_DEG.max + ' deg');
 }
}

// {stepDeg, near, far}: degrees above the horizontal for each compass heading, as the spec's mountains.real wants.
function checkHorizon(h, at) {
 if (!isRecord(h)) return at('horizon', 'must be {stepDeg, near, far}');
 if (!HORIZON_STEPS_DEG.includes(h.stepDeg)) {
  return at('horizon.stepDeg', 'must be a whole number of degrees that divides 360 (1 to 10)');
 }
 checkText(h, 'source', at, false, 'horizon.source');
 const count = COMPASS_FULL_DEG / h.stepDeg;
 for (const layer of ['near', 'far']) {
  const v = h[layer];
  if (!Array.isArray(v) || v.length !== count) {
   at('horizon.' + layer, 'must be ' + count + ' angles (one per ' + h.stepDeg + ' deg of compass heading)');
  } else {
   const bad = v.findIndex((a) => !isNumber(a) || a < HORIZON_ANGLE_RANGE_DEG.min || a > HORIZON_ANGLE_RANGE_DEG.max);
   if (bad >= 0) {
    at('horizon.' + layer + '[' + bad + ']', 'must be ' + HORIZON_ANGLE_RANGE_DEG.min + '..' +
     HORIZON_ANGLE_RANGE_DEG.max + ' deg above the horizontal');
   }
  }
 }
}

// The checks that need the terrain: the run, its length and place, and its measured slope.
function checkAgainstTerrain(f, terrain, ctx) {
 const { at, report } = ctx;
 if (terrain.id !== f.id) return at('id', 'is "' + f.id + '" but the terrain file is "' + terrain.id + '"');
 if (terrain.heights && terrain.heights.fnv1a32 !== f.terrain.heightsFnv1a32) {
  report.warnings.push(ctx.name + ' terrain.heightsFnv1a32: the terrain was re-baked since this course was made; ' +
   'check the run, the park and meanSlopeDeg against it');
 }
 const { parts, problems } = selectParts(terrain, f.run);
 if (problems.length > 0) return problems.forEach((p) => at('run', p));
 let course;
 let layer;
 try {
  layer = terrainLayer(terrain);
  course = runCourse(terrain, parts, layer);
 } catch (e) {
  return at('run', 'does not make a course: ' + e.message);
 }
 if (!runIsInside(course, terrain.bounds)) at('run', 'leaves the terrain\'s bounds');
 if (course.length < MIN_LENGTH_M) at('run', 'is ' + Math.round(course.length) + ' m long, under ' + MIN_LENGTH_M + ' m');
 if (f.finishS > course.length) {
  return at('finishS', f.finishS + ' m is past the end of the run (' + Math.round(course.length * 10) / 10 + ' m)');
 }
 const measured = measureMeanSlopeDeg(course, layer, f.startS, f.finishS);
 report.stats = { lengthM: course.length, measuredMeanSlopeDeg: measured };
 if (!(measured > 0)) at('startS', 'the start must be above the finish: the run climbs ' + (-measured).toFixed(1) + ' deg');
 if (Math.abs(measured - f.meanSlopeDeg) > MEAN_SLOPE_TOLERANCE_DEG) {
  at('meanSlopeDeg', f.meanSlopeDeg + ' deg does not match the run measured on the terrain (' + measured.toFixed(2) +
   ' deg, tolerance ' + MEAN_SLOPE_TOLERANCE_DEG + ' deg)');
 }
}

function runIsInside(course, b) {
 const { xy } = course.centreline();
 const t = RUN_BOUNDS_TOLERANCE_M;
 for (let i = 0; i < xy.length; i += 2) {
  if (xy[i] < b.minX - t || xy[i] > b.maxX + t || xy[i + 1] < b.minY - t || xy[i + 1] > b.maxY + t) return false;
 }
 return true;
}
