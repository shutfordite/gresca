// Park features (docs/adr/0012-park-features.md): a course's jumps and rails, authored in (s, d, h), resolved to world
// points (ENU metres, z absolute) when the world is built. Pure: no DOM; returns frozen copies.
import { checkParkFeatures } from '../core/contracts.js';

/** A course with no park features: what the procedural maps have until K1 to K3. */
export const NO_FEATURES = Object.freeze({ jumps: Object.freeze([]), rails: Object.freeze([]) });

// A frozen world point (m) at (s, d) on the course, h m above the base snow there.
function worldPoint(course, heightAt, s, d, h) {
 const at = course.point(s, d, { x: 0, y: 0 });
 return Object.freeze({ x: at.x, y: at.y, z: heightAt(at.x, at.y) + h });
}

// A frozen copy of a jump with its four world points (JUMP_WORLD_POINTS): the takeoff's start, the lip, the knuckle
// and the landing's foot.
function resolveJump(j, course, heightAt) {
 const knuckleS = j.s + j.table.length;
 const world = [
  worldPoint(course, heightAt, j.s - j.takeoff.length, j.d, 0),
  worldPoint(course, heightAt, j.s, j.d, j.takeoff.height),
  worldPoint(course, heightAt, knuckleS, j.d, j.landing.height),
  worldPoint(course, heightAt, knuckleS + j.landing.length, j.d, 0),
 ];
 return Object.freeze({
  s: j.s,
  d: j.d,
  size: j.size,
  designSpeed: j.designSpeed,
  takeoff: Object.freeze({ ...j.takeoff }),
  table: Object.freeze({ ...j.table }),
  landing: Object.freeze({ ...j.landing }),
  world: Object.freeze(world),
 });
}

// A frozen copy of a rail or box with one world point per point of its line.
function resolveRail(r, course, heightAt) {
 return Object.freeze({
  points: Object.freeze(r.points.map((p) => Object.freeze({ s: p.s, d: p.d, h: p.h }))),
  profile: r.profile,
  width: r.width,
  legs: r.legs,
  entry: r.entry,
  world: Object.freeze(r.points.map((p) => worldPoint(course, heightAt, p.s, p.d, p.h))),
 });
}

/**
 * The ParkFeatures (core/contracts.js) of features {jumps, rails} as authored (no world points), resolved on course
 * (anything with point(s, d, out) -> {x, y} world m) over heightAt(x, y) -> m, the base snow under the park (the
 * terrain without its features layer). Frozen. Throws an Error naming the field when features do not validate.
 */
export function resolveFeatures(features, course, heightAt) {
 const bad = checkParkFeatures(features, false);
 if (bad.length) throw new Error('park features: ' + bad.slice(0, 3).join('; '));
 return Object.freeze({
  jumps: Object.freeze(features.jumps.map((j) => resolveJump(j, course, heightAt))),
  rails: Object.freeze(features.rails.map((r) => resolveRail(r, course, heightAt))),
 });
}
