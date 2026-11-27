// The map compiler's pure core: lat/lon to local ENU, the map grid, DEM resampling, piste clipping, the terrain file.
// No I/O, no clock, no randomness: the same inputs give the same file, byte for byte (docs/adr/0006).
import {
 FORMAT, KIND_TERRAIN, PROJECTION, POINT_ROUND_M, encodeHeights, roundTo,
} from './format.js';
import { KIND_COURSE, DEFAULT_SUN_ELEVATION_DEG } from './course-format.js';
import {
 compassBearingDeg, computeHorizon, difficultyOf, measureMeanSlopeDeg, runCourse, selectParts, terrainLayer,
} from './course-run.js';
import { DIFFICULTY_WIDTH_M } from '../../src/world/polyline-course.js';

/** The compiler's name and version, written into every file it makes. */
export const GENERATOR = 'gresca-map-compiler/1';

const WGS84_A = 6378137; // m, the WGS84 semi-major axis
const WGS84_F = 1 / 298.257223563; // WGS84 flattening
const WGS84_E2 = WGS84_F * (2 - WGS84_F); // first eccentricity squared
const DEG = Math.PI / 180;
const INVERSE_TOLERANCE_M = 1e-9; // m, when toLatLon() stops iterating
const INVERSE_MAX_STEPS = 10;
const LAT_LON_DECIMALS = 7; // deg decimals in latLonBounds: about 1 cm
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LIMITS = Object.freeze({
 minSizeM: 100, maxSizeM: 20000, // m, the map's width and length
 minCellM: 1, maxCellM: 100, // m, the grid spacing
 maxSamples: 2048 * 2048, // grid samples (the validator's limit too)
});

/**
 * The projection of WGS84 lat/lon (deg) onto the plane tangent to the ellipsoid at (lat0, lon0): x east, y north
 * (m), the east and north parts of the ENU vector of the point at height 0, dropping up. Orthographic onto the
 * tangent plane, so a distance d from the origin is shortened by about d^3 / (6 R^2): 0.5 mm at 5 km. Heights stay
 * DEM heights (the plane is not bent down by the Earth's curvature, about 2 m at 5 km): the game's world is flat.
 * Returns {toEnu(lat, lon, out) -> out.x, out.y; toLatLon(x, y, out) -> out.lat, out.lon (deg)}.
 */
export function createProjection(lat0, lon0) {
 const origin = ecef(lat0, lon0, {});
 const sinLat0 = Math.sin(lat0 * DEG);
 const cosLat0 = Math.cos(lat0 * DEG);
 const sinLon0 = Math.sin(lon0 * DEG);
 const cosLon0 = Math.cos(lon0 * DEG);
 const p = {};
 function toEnu(lat, lon, out) {
  ecef(lat, lon, p);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const dz = p.z - origin.z;
  out.x = -sinLon0 * dx + cosLon0 * dy;
  out.y = -sinLat0 * cosLon0 * dx - sinLat0 * sinLon0 * dy + cosLat0 * dz;
  return out;
 }
 // Newton-like steps with the local radii of curvature; converges to 1e-9 m in 2 or 3 steps within 20 km.
 const guess = {};
 function toLatLon(x, y, out) {
  let lat = lat0;
  let lon = lon0;
  for (let step = 0; step < INVERSE_MAX_STEPS; step++) {
   toEnu(lat, lon, guess);
   const ex = x - guess.x;
   const ey = y - guess.y;
   if (Math.abs(ex) < INVERSE_TOLERANCE_M && Math.abs(ey) < INVERSE_TOLERANCE_M) break;
   const s2 = Math.sin(lat * DEG) ** 2;
   const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * s2); // m, prime vertical radius
   const m = WGS84_A * (1 - WGS84_E2) / (1 - WGS84_E2 * s2) ** 1.5; // m, meridional radius
   lat += ey / m / DEG;
   lon += ex / (n * Math.cos(lat * DEG)) / DEG;
  }
  out.lat = lat;
  out.lon = lon;
  return out;
 }
 return Object.freeze({ lat0, lon0, toEnu, toLatLon });
}

// Earth-centred coordinates (m) of lat, lon (deg) at ellipsoid height 0, into out.
function ecef(lat, lon, out) {
 const sinLat = Math.sin(lat * DEG);
 const cosLat = Math.cos(lat * DEG);
 const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
 out.x = n * cosLat * Math.cos(lon * DEG);
 out.y = n * cosLat * Math.sin(lon * DEG);
 out.z = n * (1 - WGS84_E2) * sinLat;
 return out;
}

/**
 * Checks a map config {id, name, centre: {lat, lon} deg, widthM, lengthM, cellM (m)} and returns the grid it
 * asks for: {nx, ny, cellM, frame: {originX, originY, rotation: 0} (m, the north-west sample), bounds (m)}, centred
 * on the ENU origin, rows north to south. Throws naming the field that is wrong.
 */
export function gridFor(config) {
 const fail = (field, why) => {
  throw new Error('map config ' + field + ': ' + why);
 };
 if (typeof config !== 'object' || config === null) fail('(root)', 'must be an object');
 if (typeof config.id !== 'string' || !ID_PATTERN.test(config.id)) fail('id', 'must be lower-case kebab-case');
 if (typeof config.name !== 'string' || !config.name) fail('name', 'must be a non-empty string');
 const c = config.centre || {};
 if (!(Math.abs(c.lat) <= 85)) fail('centre.lat', 'must be a latitude in degrees within 85 of the equator');
 if (!(Math.abs(c.lon) <= 180)) fail('centre.lon', 'must be a longitude in degrees');
 for (const k of ['widthM', 'lengthM']) {
  if (!(config[k] >= LIMITS.minSizeM && config[k] <= LIMITS.maxSizeM)) {
   fail(k, 'must be ' + LIMITS.minSizeM + '..' + LIMITS.maxSizeM + ' m');
  }
 }
 const cellM = config.cellM;
 if (!(cellM >= LIMITS.minCellM && cellM <= LIMITS.maxCellM)) {
  fail('cellM', 'must be ' + LIMITS.minCellM + '..' + LIMITS.maxCellM + ' m');
 }
 const nx = Math.round(config.widthM / cellM) + 1;
 const ny = Math.round(config.lengthM / cellM) + 1;
 if (nx * ny > LIMITS.maxSamples) fail('cellM', nx + ' x ' + ny + ' samples is over ' + LIMITS.maxSamples);
 const originX = -(nx - 1) * cellM / 2;
 const originY = (ny - 1) * cellM / 2;
 const bounds = { minX: originX, minY: originY - (ny - 1) * cellM, maxX: originX + (nx - 1) * cellM, maxY: originY };
 return { nx, ny, cellM, frame: { originX, originY, rotation: 0 }, bounds };
}

/** The lat/lon box {south, west, north, east} (deg) around the grid's edge, sampled every cell. */
export function latLonBox(grid, projection) {
 const box = { south: Infinity, west: Infinity, north: -Infinity, east: -Infinity };
 const ll = {};
 const add = (x, y) => {
  projection.toLatLon(x, y, ll);
  box.south = Math.min(box.south, ll.lat);
  box.north = Math.max(box.north, ll.lat);
  box.west = Math.min(box.west, ll.lon);
  box.east = Math.max(box.east, ll.lon);
 };
 const { minX, minY, maxX, maxY } = grid.bounds;
 for (let i = 0; i < grid.nx; i++) {
  add(minX + i * grid.cellM, minY);
  add(minX + i * grid.cellM, maxY);
 }
 for (let j = 0; j < grid.ny; j++) {
  add(minX, maxY - j * grid.cellM);
  add(maxX, maxY - j * grid.cellM);
 }
 return box;
}

/** Heights (m, Float64Array, row-major, row 0 north) of dem.heightAt(lat, lon) at every sample of the grid. */
export function resampleToGrid(grid, projection, dem) {
 const out = new Float64Array(grid.nx * grid.ny);
 const ll = {};
 for (let j = 0; j < grid.ny; j++) {
  const y = grid.frame.originY - j * grid.cellM;
  for (let i = 0; i < grid.nx; i++) {
   projection.toLatLon(grid.frame.originX + i * grid.cellM, y, ll);
   out[j * grid.nx + i] = dem.heightAt(ll.lat, ll.lon);
  }
 }
 return out;
}

/**
 * The parts of a polyline [[x, y], ...] (m) inside the box {minX, minY, maxX, maxY}: a list of polylines, cut where
 * the line leaves the box and starts again where it comes back.
 */
export function clipPolyline(points, box) {
 const parts = [];
 let part = [];
 for (let k = 0; k + 1 < points.length; k++) {
  const seg = clipSegment(points[k], points[k + 1], box);
  if (!seg) {
   if (part.length) parts.push(part);
   part = [];
   continue;
  }
  if (part.length === 0) part.push(seg.a);
  part.push(seg.b);
  if (seg.leaves) {
   parts.push(part);
   part = [];
  }
 }
 if (part.length) parts.push(part);
 return parts.filter((p) => p.length >= 2);
}

// Liang-Barsky: the part {a, b, leaves} of segment p -> q inside the box, or null; leaves if it exits before q.
function clipSegment(p, q, box) {
 const dx = q[0] - p[0];
 const dy = q[1] - p[1];
 let t0 = 0;
 let t1 = 1;
 const edges = [[-dx, p[0] - box.minX], [dx, box.maxX - p[0]], [-dy, p[1] - box.minY], [dy, box.maxY - p[1]]];
 for (const [den, num] of edges) {
  if (den === 0) {
   if (num < 0) return null;
  } else {
   const t = num / den;
   if (den < 0) t0 = Math.max(t0, t);
   else t1 = Math.min(t1, t);
  }
 }
 if (t0 > t1) return null;
 return { a: [p[0] + t0 * dx, p[1] + t0 * dy], b: [p[0] + t1 * dx, p[1] + t1 * dy], leaves: t1 < 1 };
}

// The file records for parsed pistes or lifts (lines in [lon, lat] deg): projected, clipped, rounded, one per part.
function placeLines(items, projection, bounds, fields) {
 const out = [];
 const p = {};
 for (const item of items) {
  let part = 0;
  for (const line of item.lines) {
   const enu = line.map(([lon, lat]) => {
    projection.toEnu(lat, lon, p);
    return [p.x, p.y];
   });
   for (const piece of clipPolyline(enu, bounds)) {
    const points = dedupe(piece.map(([x, y]) => [roundTo(x, POINT_ROUND_M), roundTo(y, POINT_ROUND_M)]));
    if (points.length < 2) continue;
    out.push({ id: item.id, part: part++, osm: item.osm.slice(), ...fields(item), points });
   }
  }
 }
 return out;
}

function dedupe(points) {
 return points.filter((pt, k) => k === 0 || pt[0] !== points[k - 1][0] || pt[1] !== points[k - 1][1]);
}

// One source record, in the file's key order. Strings default to ''.
function sourceRecord(s, fixes, forCourse = false) {
 const str = (v) => (typeof v === 'string' ? v : '');
 if (forCourse) {
  return { role: str(s.role), name: str(s.name), url: str(s.url), licence: str(s.licence),
   attribution: str(s.attribution), retrieved: str(s.retrieved) };
 }
 const record = {
  role: str(s.role), name: str(s.name), url: str(s.url), licence: str(s.licence),
  attribution: str(s.attribution), retrieved: str(s.retrieved), files: Number.isInteger(s.files) ? s.files : 0,
  sha256: str(s.sha256),
 };
 if (fixes) record.fixes = { voids: fixes.voids, spikes: fixes.spikes };
 return record;
}

/**
 * The terrain file (a plain object, key order fixed) for config (see gridFor), a DEM source {heightAt(lat, lon) m,
 * fixes}, the parsed pistes and lifts (sources/openskimap.js shapes), and the source records {role: 'elevation' |
 * 'pistes' | 'lifts', name, url, licence, attribution, retrieved, files, sha256}. Write it with stringifyMap().
 */
export function compileTerrain({ config, dem, pistes = [], lifts = [], sources }) {
 const grid = gridFor(config);
 const projection = createProjection(config.centre.lat, config.centre.lon);
 const box = latLonBox(grid, projection);
 const heights = resampleToGrid(grid, projection, dem);
 const records = sources.map((s) => sourceRecord(s, s.role === 'elevation' ? dem.fixes : null));
 const osmDerived = records.some((s) => s.role === 'pistes' || s.role === 'lifts');
 const elevation = records.find((s) => s.role === 'elevation');
 const round = (v) => roundTo(v, 10 ** -LAT_LON_DECIMALS);
 return {
  format: FORMAT,
  kind: KIND_TERRAIN,
  id: config.id,
  name: config.name,
  generator: GENERATOR,
  licence: osmDerived ? 'ODbL-1.0' : elevation ? elevation.licence : '',
  sources: records,
  origin: { lat: config.centre.lat, lon: config.centre.lon },
  projection: PROJECTION,
  frame: grid.frame,
  grid: { nx: grid.nx, ny: grid.ny, cellM: grid.cellM },
  bounds: grid.bounds,
  latLonBounds: { south: round(box.south), west: round(box.west), north: round(box.north), east: round(box.east) },
  heights: encodeHeights(heights),
  pistes: placeLines(pistes, projection, grid.bounds, (r) => ({
   name: r.name, difficulty: r.difficulty, grooming: r.grooming, area: r.area,
  })),
  lifts: placeLines(lifts, projection, grid.bounds, (l) => ({ name: l.name, kind: l.kind })),
 };
}

const SUN_SIDE_DEG = 90; // deg, the default sun stands to the side of the run, which lights the slope's relief
const SLOPE_ROUND_DEG = 0.01; // deg, meanSlopeDeg's rounding
const HORIZON_ROUND_DEG = 0.1; // deg, the horizon profile's rounding
const SUN_ROUND_DEG = 1; // deg, the default sun azimuth's rounding

/**
 * The course file (a plain object, key order fixed) for a validated terrain file and a run {osm: ["way/1", ...]} or
 * {name}. Optional: name, widthM (m, default by the run's difficulty), startS and finishS (m of s, default the whole
 * run), kickers and rails (park items in (s, d), see docs/adr/0010), sun {azimuthDeg, elevationDeg} (compass deg;
 * default side light 90 deg off the run's direction, 16 deg up), treeSet (default 'pine'), horizonStepDeg (default
 * 1). The far horizon layer repeats the near one: only the terrain grid is known here. Throws an Error when the run
 * is not in the terrain or does not join. Write it with stringifyMap().
 */
/**
 * m, the default finish: the run's length (m) rounded to the file's point step, never past the end. Rounding to the
 * nearest step could round up past the end, which the course validator rejects (the first El Tarter bake, Àliga).
 */
export function lastPointS(length) {
 const steps = Math.floor(length / POINT_ROUND_M + 1e-6); // the 1e-6 keeps an exact multiple from flooring one short
 const s = roundTo(steps * POINT_ROUND_M, POINT_ROUND_M);
 return s <= length ? s : roundTo((steps - 1) * POINT_ROUND_M, POINT_ROUND_M);
}

const TOP_SEARCH_M = 300; // m of s from the run's first point searched for its high point (the default start)
const TOP_STEP_M = 5;     // m of s between the heights compared

/**
 * m, the default start: the highest point of the run's first TOP_SEARCH_M m (at most a quarter of it), on the point
 * step. A run's first metres are often flat or climb a little off a lift's top station, where a rider would slide back.
 */
export function topS(course, layer) {
 const p = { x: 0, y: 0 };
 let best = 0;
 let bestH = -Infinity;
 for (let s = 0; s <= Math.min(TOP_SEARCH_M, course.length / 4); s += TOP_STEP_M) {
  course.point(s, 0, p);
  const h = layer.height(p.x, p.y);
  if (h > bestH) {
   bestH = h;
   best = s;
  }
 }
 return roundTo(best, POINT_ROUND_M);
}

export function compileCourse({ terrain, run, name, widthM, startS, finishS, kickers = [], rails = [], sun,
 treeSet = 'pine', horizonStepDeg = 1 }) {
 const layer = terrainLayer(terrain);
 const { parts, problems } = selectParts(terrain, run);
 if (problems.length > 0) throw new Error('compileCourse: ' + problems.join('; '));
 const course = runCourse(terrain, parts, layer);
 const start = startS ?? topS(course, layer);
 const end = finishS ?? lastPointS(course.length);
 const difficulty = difficultyOf(parts);
 const width = widthM ?? DIFFICULTY_WIDTH_M[difficulty];
 const top = course.point(start, 0, {});
 const bottom = course.point(end, 0, {});
 const middle = course.point((start + end) / 2, 0, {});
 const profile = Array.from(computeHorizon(terrain, layer, middle.x, middle.y, horizonStepDeg),
  (v) => roundTo(v, HORIZON_ROUND_DEG));
 const slope = measureMeanSlopeDeg(course, layer, start, end);
 const runName = name ?? (parts.find((p) => p.name)?.name || terrain.name);
 return {
  format: FORMAT,
  kind: KIND_COURSE,
  id: terrain.id,
  name: runName,
  generator: GENERATOR,
  licence: 'ODbL-1.0',
  terrain: { id: terrain.id, heightsFnv1a32: terrain.heights.fnv1a32 },
  sources: terrain.sources.map((s) => sourceRecord(s, null, true)),
  run: { osm: [...new Set(parts.flatMap((p) => p.osm))].sort(), name: run.name || runName, difficulty },
  widths: [[0, roundTo(width, POINT_ROUND_M)]],
  startS: roundTo(start, POINT_ROUND_M),
  finishS: roundTo(end, POINT_ROUND_M),
  meanSlopeDeg: roundTo(slope, SLOPE_ROUND_DEG),
  kickers,
  rails,
  sun: sun ?? {
   azimuthDeg: roundTo((compassBearingDeg(top, bottom) + SUN_SIDE_DEG) % 360, SUN_ROUND_DEG),
   elevationDeg: DEFAULT_SUN_ELEVATION_DEG,
  },
  treeSet,
  horizon: { stepDeg: horizonStepDeg, source: 'terrain-grid', near: profile, far: profile.slice() },
 };
}

/**
 * The file's text: JSON with 1-space indent, except that arrays of plain values or points (an osm list, a polyline)
 * stay on one line,
 * ending in a newline. Stable: key order is the objects' own.
 */
export function stringifyMap(value) {
 return write(value, '') + '\n';
}

function write(v, indent) {
 const isFlat = Array.isArray(v) && v.every((e) => e === null || typeof e !== 'object' ||
  (Array.isArray(e) && e.every((n) => typeof n === 'number')));
 if (v === null || typeof v !== 'object' || isFlat) return JSON.stringify(v);
 const inner = indent + ' ';
 if (Array.isArray(v)) {
  if (v.length === 0) return '[]';
  return '[\n' + v.map((e) => inner + write(e, inner)).join(',\n') + '\n' + indent + ']';
 }
 const keys = Object.keys(v);
 if (keys.length === 0) return '{}';
 return '{\n' + keys.map((k) => inner + JSON.stringify(k) + ': ' + write(v[k], inner)).join(',\n') + '\n' + indent +
  '}';
}
