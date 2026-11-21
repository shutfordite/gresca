// Named scenes: fixed, deterministic game states (rig, place on the course, speed, input, a pose) that agents and the
// screenshot tool open with Gresca.scene(name) or ?scene=<name>. Data first; applyScene() is the one interpreter.
// Units: metres (m), seconds (s), m/s, radians (rad). Positions are course coordinates (s along, d across), never
// grid axes, so every scene works at any map placement (docs/adr/0005-enu-frame.md).

const DT = 1 / 120;       // s per sim step while a scene runs up (the loop's own step)
const SETTLE_DT = 1 / 30; // s per drawn frame while the pose settles
const SETTLE_FRAMES = 12; // frames drawn after the run-up, so the rider animation reaches its pose (0.4 s)

// The practice stretch of piste, empty of features (s 460..740, AGENTS.md "Do not break"), and the first small kicker.
const PRACTICE_S = 540; // m
const SMALL_KICKER = 3; // index into course.kickers (a small one)
const BIG_KICKER = 0;   // index into the big kickers (course.kickers filtered by big)

/**
 * Every scene: {note, rig 'board' | 'ski', at, speed (m/s along the piste), turn (rad the board is turned from the
 * direction of travel; PI rides switch), run: [{input, seconds, untilZ (m: stop early once this high), atPeak (stop only when also falling)}]}.
 * at is {s, d} or {kicker: index, back: m before the lip} or {rail: index, t: m along it} or {bigKicker, back}.
 * The input of the last run step stays held while the scene is paused (a held brake shows the brake pose).
 */
export const SCENES = Object.freeze({
 'ride-board': scene('board', { s: PRACTICE_S, d: 0 }, 12, 0, [step({ right: 1 }, 0.8), step({}, 0.3)],
  'Snowboard carving right on the empty practice stretch.'),
 'ride-ski': scene('ski', { s: PRACTICE_S, d: 0 }, 12, 0, [step({ left: 1 }, 0.8), step({}, 0.3)],
  'Skis carving left on the empty practice stretch.'),
 'brake': scene('board', { s: PRACTICE_S, d: 0 }, 14, 0, [step({ brake: 1 }, 0.4)],
  'Brake held, still sliding at about 8 m/s: the skid and brake pose.'),
 'switch-ski-left': scene('ski', { s: PRACTICE_S, d: 0 }, 10, Math.PI, [step({ left: 1 }, 0.6), step({}, 0.2)],
  'Skis ridden switch (tail first), turning left.'),
 'switch-ski-right': scene('ski', { s: PRACTICE_S, d: 0 }, 10, Math.PI, [step({ right: 1 }, 0.6), step({}, 0.2)],
  'Skis ridden switch (tail first), turning right.'),
 'kicker-air': scene('board', { kicker: SMALL_KICKER, back: 14 }, 15, 0, [airStep(1.0, false)],
  'Just off a small kicker, rising.'),
 'flip': scene('board', { bigKicker: BIG_KICKER, back: 18 }, 20, 0, [airStep(2.0, true)],
  'High air off a big kicker, at the top. Flips do not exist yet (S2, F3): this is where one would start.'),
 'grind': scene('board', { rail: 0, t: 0.3 }, 12, 0, [step({}, 0.3)],
  'Sliding a rail.'),
});

function step(input, seconds, untilZ, atPeak = false) {
 return Object.freeze({ input: Object.freeze(input), seconds, untilZ, atPeak });
}

// A run-up of at most 3 s that stops once the rider is minZ (m) high: on the way up, or at the top of the arc.
function airStep(minZ, atPeak) {
 return step({}, 3, minZ, atPeak);
}

function scene(rig, at, speed, turn, run, note) {
 return Object.freeze({ note, rig, at: Object.freeze(at), speed, turn, run: Object.freeze(run) });
}

// The world position and the direction of travel (rad) a scene's `at` names. course: the Course.
function resolveAt(at, course) {
 const out = { x: 0, y: 0, heading: 0 };
 if ('rail' in at) {
  const rail = course.rails[at.rail];
  out.x = rail.x0 + rail.dx * at.t;
  out.y = rail.y0 + rail.dy * at.t;
  out.heading = Math.atan2(rail.dy, rail.dx);
  return out;
 }
 let s = at.s;
 let d = at.d || 0;
 if ('kicker' in at || 'bigKicker' in at) {
  const kickers = 'kicker' in at ? course.kickers : course.kickers.filter((k) => k.big);
  const k = kickers['kicker' in at ? at.kicker : at.bigKicker];
  s = k.s - at.back;
  d = k.d;
 }
 course.point(s, d, out);
 const tangent = course.project(out.x, out.y, { s: 0, d: 0, tx: 0, ty: 1 });
 out.heading = Math.atan2(tangent.ty, tangent.tx);
 return out;
}

// Runs one step of a scene's run-up through the façade: holds the input for seconds, or until airborne past minZ.
function runStep(api, st) {
 api.input(st.input);
 const n = Math.round(st.seconds / DT);
 for (let i = 0; i < n; i++) {
  api.sim(DT, DT);
  const s = api.state();
  if (st.untilZ !== undefined && s.z >= st.untilZ && (!st.atPeak || s.vz <= 0)) break;
 }
}

/**
 * Puts the game in the named scene and pauses it (phase 'ready': the loop draws but does not step). api: the façade's
 * {place, set, input, sim(sec, dt), state, frame(dt), course}. Throws on an unknown name. Returns the scene's note.
 */
export function applyScene(name, api) {
 if (!Object.hasOwn(SCENES, name)) {
  throw new Error('Gresca.scene: unknown scene ' + name + ' (known: ' + Object.keys(SCENES).join(', ') + ')');
 }
 const sc = SCENES[name];
 const at = resolveAt(sc.at, api.course);
 const travel = at.heading;
 api.place({
  x: at.x, y: at.y, vx: Math.cos(travel) * sc.speed, vy: Math.sin(travel) * sc.speed, heading: travel + sc.turn,
 });
 api.set({ rig: sc.rig });
 for (const st of sc.run) runStep(api, st);
 for (let i = 0; i < SETTLE_FRAMES; i++) api.frame(SETTLE_DT);
 api.set({ phase: 'ready' });
 return sc.note;
}
