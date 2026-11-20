// Rider animation glue: game state in, RiderAnim (art/gresca-rider-anim.js) on top of the Hanga spec out.
import { KICK, cx } from '../world/course.js';

const AIRBORNE_Z = 0.05;    // m above the snow, higher counts as in the air
const RESTART_JUMP_M = 8;   // m, a pose this far from the last one means a new run: start the animation afresh
const GROUND_SMOOTH_S = 0.05; // s, low-pass on the ground's vertical speed and acceleration under the feet
const APPROACH_M = 14;      // m before a kicker lip the rider crouches
const KICKER_HALF_WIDTH = 9; // m either side of the centreline that counts as lined up with a kicker

// rad, angle d wrapped to -PI..PI
const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

// Everything the animation needs from the game, measured once per drawn frame. Updates view.animPrev, view.riderYaw.
function animInput(view, game, dt) {
 const { rider, session, input, camera, terrain, hanga } = game;
 const x = view.drawn.x; // the drawn rider pose (interpolated), not the simulation's
 const y = view.drawn.y;
 const jz = view.drawn.z;
 const s = Math.hypot(rider.vx, rider.vy);
 const air = !rider.grind && jz > AIRBORNE_Z;
 const dir = s > 0.5 ? Math.atan2(rider.vy, rider.vx) : rider.heading;
 const g = terrain.height(x, y); // ground under the feet, smooth between cells
 let p = view.animPrev;
 if (!p || Math.hypot(x - p.x, y - p.y) > RESTART_JUMP_M) {
  // first frame, or the run restarted
  p = view.animPrev = { x, y, dir, g, gv: 0, ga: 0, n: rider.landings, air: true };
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
 const turn = dt > 0 && s > 1 && !air ? wrap(dir - p.dir) / dt : 0;
 // The rider's facing: the board heading, turned round for goofy because the spec mirrors that rig in z.
 const aR = rider.heading + (session.rig === 'board' && session.stance === 'goofy' ? Math.PI : 0);
 const side = Math.cos(aR - dir) >= 0 ? 1 : -1;
 const landed = rider.landings !== p.n && !air && rider.crashTimer <= 0;
 view.animPrev = { x, y, dir, g, gv, ga, n: rider.landings, air: air || !!rider.grind };
 view.riderYaw = wrap(aR - camera.heading) * 180 / Math.PI;
 return {
  wiped: rider.crashTimer > 0, grinding: !!rider.grind, airborne: air, braking: !!input.brake, landed,
  impact: rider.landingSpeed, speed: s, pathTurn: turn, riderSide: side,
  approach: !air && s > 4 && Math.abs(x - cx(y)) < KICKER_HALF_WIDTH && KICK.some((k) => y >= k - APPROACH_M && y < k),
  feetAccelUp: ga, slopeDeg: terrain.slopeDeg(x, y), meanSlopeDeg: hanga.maps.procedural.meanSlopeDeg,
 };
}

/**
 * Advances the rider animation dt (s) from the pose in view.drawn and returns its draw list (also kept in
 * view.riderList). game: {rider, session, input, camera, terrain, hanga, riderAnim}. Mutates view's animation state.
 */
export function animTick(view, game, dt) {
 const r = game.session.rig === 'ski' ? 'ski' : 'board';
 if (!view.anim || view.anim.rig !== r) {
  view.anim = game.riderAnim.create(r);
  view.animPrev = null;
 }
 game.riderAnim.update(view.anim, animInput(view, game, dt), dt);
 view.riderList = game.riderAnim.project(view.anim, view.riderYaw, null, game.session.stance);
 return view.riderList;
}
