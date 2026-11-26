// The run behind a course file: which terrain pistes it names, the centreline Course.fromRun makes of them, its
// measured mean slope and the horizon seen from its middle. Pure, no Node APIs; shared by core.js and validate.js.
import { Terrain } from '../terrain.js';
import { createMapFrame } from '../map-frame.js';
import { Course } from '../polyline-course.js';
import { decodeHeights } from './format.js';
import { HORIZON_EYE_M, HORIZON_MIN_RANGE_M } from './course-format.js';

const PLACEHOLDER_WIDTH_M = 30; // m, the width fromRun needs to build a course; the file's own widths are checked apart
const RAD_TO_DEG = 180 / Math.PI;
const COMPASS_FULL_DEG = 360;

/** The Terrain layer (height(x, y) m, gradient) of a terrain file that validateTerrain() accepted. */
export function terrainLayer(file) {
 const { nx, ny, cellM } = file.grid;
 return Terrain.grid(decodeHeights(file), nx, ny, cellM, createMapFrame(file.frame));
}

/**
 * The terrain's piste parts a run names: run.osm (ids like "way/1") when it lists any, else run.name. Returns
 * {parts, problems: [string]}; problems name each OSM id or name that matches nothing.
 */
export function selectParts(terrain, run) {
 const pistes = terrain.pistes;
 const problems = [];
 const ids = Array.isArray(run.osm) ? run.osm : [];
 if (ids.length > 0) {
  const wanted = new Set(ids);
  const seen = new Set();
  const parts = pistes.filter((p) => p.osm.some((id) => wanted.has(id)));
  for (const part of parts) for (const id of part.osm) seen.add(id);
  for (const id of ids) if (!seen.has(id)) problems.push('run.osm: "' + id + '" is not a piste in the terrain file');
  return { parts, problems };
 }
 const parts = pistes.filter((p) => p.name === run.name);
 if (parts.length === 0) problems.push('run.name: no piste is called "' + run.name + '" in the terrain file');
 return { parts, problems };
}

/** The first non-empty difficulty among parts ('' when none says). */
export function difficultyOf(parts) {
 const found = parts.find((p) => p.difficulty);
 return found ? found.difficulty : '';
}

/** The Course (polyline, s from 0) Course.fromRun makes of the parts' points; throws an Error naming the problem. */
export function runCourse(terrain, parts, layer = terrainLayer(terrain)) {
 return Course.fromRun(parts.map((p) => p.points), { terrain: layer, width: PLACEHOLDER_WIDTH_M });
}

/**
 * deg, the run's mean slope between startS and finishS (m of s): the angle of the drop over the distance along the
 * run, atan(drop / (finishS - startS)). Stable against DEM noise, unlike the mean of local slopes.
 */
export function measureMeanSlopeDeg(course, layer, startS, finishS) {
 const top = course.point(startS, 0, {});
 const bottom = course.point(finishS, 0, {});
 const drop = layer.height(top.x, top.y) - layer.height(bottom.x, bottom.y);
 return Math.atan(drop / (finishS - startS)) * RAD_TO_DEG;
}

/** The compass heading (deg, clockwise from north) from point a to point b, both {x, y} m. */
export function compassBearingDeg(a, b) {
 const deg = Math.atan2(b.x - a.x, b.y - a.y) * RAD_TO_DEG;
 return (deg + COMPASS_FULL_DEG) % COMPASS_FULL_DEG;
}

/**
 * The horizon profile (deg above the horizontal, one value per compass heading at stepDeg) seen from (x, y) with an
 * eye eyeM above the ground: the highest elevation angle along each heading over the terrain grid, from
 * HORIZON_MIN_RANGE_M out to the grid's edge. Returns a Float64Array, entry i is heading i * stepDeg.
 */
export function computeHorizon(file, layer, x, y, stepDeg) {
 const { grid } = file;
 const box = file.bounds; // the file's own box: always axis-aligned, a map file's frame never rotates (ADR 0006)
 const eye = layer.height(x, y) + HORIZON_EYE_M;
 const count = COMPASS_FULL_DEG / stepDeg;
 const profile = new Float64Array(count);
 for (let i = 0; i < count; i++) {
  const heading = i * stepDeg / RAD_TO_DEG;
  const ex = Math.sin(heading);
  const ny = Math.cos(heading);
  let best = -Infinity;
  for (let r = HORIZON_MIN_RANGE_M; ; r += grid.cellM) {
   const px = x + ex * r;
   const py = y + ny * r;
   if (px < box.minX || px > box.maxX || py < box.minY || py > box.maxY) break;
   best = Math.max(best, Math.atan((layer.height(px, py) - eye) / r) * RAD_TO_DEG);
  }
  profile[i] = best === -Infinity ? 0 : best;
 }
 return profile;
}
