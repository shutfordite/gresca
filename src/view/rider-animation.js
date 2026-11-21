// Rider animation glue: game state in, RiderAnim (art/gresca-rider-anim.js) steps it, the Look's rider projects it.
import { animInput } from '../sim/anim-input.js';

const AIRBORNE_Z = 0.05;    // m above the snow, higher counts as in the air
const RESTART_JUMP_M = 8;   // m, a pose this far from the last one means a new run: start the animation afresh
const GROUND_SMOOTH_S = 0.05; // s, low-pass on the ground's vertical speed and acceleration under the feet

// rad, angle d wrapped to -PI..PI
const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

// RiderAnim's input: the sim's AnimInput (sim/anim-input.js) plus what the view measures once per drawn frame at the
// drawn pose (ground motion under the feet, path turn rate, slope, landing). Updates view.animPrev, view.riderYaw.
function riderAnimInput(view, game, dt) {
 const { rider, session, course, camera, terrain, look } = game;
 const a = animInput(rider, session, course, view.animIn);
 const x = view.drawn.x; // the drawn rider pose (interpolated), not the simulation's
 const y = view.drawn.y;
 const jz = view.drawn.z;
 const s = a.speed;
 const air = !a.grinding && jz > AIRBORNE_Z;
 const dir = a.travelDir;
 const g = terrain.height(x, y); // ground under the feet, smooth between cells
 let p = view.animPrev;
 if (!p || Math.hypot(x - p.x, y - p.y) > RESTART_JUMP_M) {
  // first frame, or the run restarted
  p = view.animPrev = { x, y, dir, g, gv: 0, ga: 0, n: a.landings, air: true };
 }
 const k = dt > 0 ? Math.min(1, dt / GROUND_SMOOTH_S) : 0;
 // Vertical speed and acceleration of the ground under the feet, low-passed over about 50 ms.
 // The first frame back on the snow only seeds the speed: the landing itself comes in through `impact`.
 let gv = 0;
 let ga = 0;
 if (dt > 0 && !air) {
  const v = (g - p.g) / dt;
  if (p.air) gv = v;
  else {
   gv = p.gv + (v - p.gv) * k;
   ga = p.ga + ((gv - p.gv) / dt - p.ga) * k;
  }
 }
 // rad/s, + turning right (clockwise in the world frame, where headings grow counter-clockwise)
 const turn = dt > 0 && s > 1 && !air ? wrap(p.dir - dir) / dt : 0;
 const landed = a.landings !== p.n && !air && !a.wiped;
 view.animPrev = { x, y, dir, g, gv, ga, n: a.landings, air: air || a.grinding };
 // deg, + with the rider turned to the right of the camera's view (clockwise)
 view.riderYaw = wrap(camera.heading - a.facing) * 180 / Math.PI;
 return {
  wiped: a.wiped, grinding: a.grinding, airborne: air, braking: a.braking, landed,
  impact: a.impact, speed: s, pathTurn: turn, riderSide: a.riderSide, approach: !air && a.approach,
  feetAccelUp: ga, facing: a.facing, travelDir: dir, slopeDeg: terrain.slopeDeg(x, y), meanSlopeDeg: look.rider.meanSlopeDeg,
 };
}

/**
 * Advances the rider animation dt (s) from the pose in view.drawn and returns its draw list (also kept in
 * view.riderList). game: {rider, session, course, camera, terrain, look, riderAnim}: riderAnim steps the animation,
 * look.rider.project draws it. Mutates view's animation state.
 */
export function animTick(view, game, dt) {
 const r = game.session.rig === 'ski' ? 'ski' : 'board';
 if (!view.anim || view.anim.rig !== r) {
  view.anim = game.riderAnim.create(r);
  view.animPrev = null;
 }
 game.riderAnim.update(view.anim, riderAnimInput(view, game, dt), dt);
 const seen = view.riderView;
 seen.yawDeg = view.riderYaw - view.anim.twist; // the upper body's heading: the equipment's, less the twist
 seen.stance = game.session.stance;
 view.riderList = game.look.rider.project(r, view.anim, seen);
 return view.riderList;
}
