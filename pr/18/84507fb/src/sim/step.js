// One physics step: steering, gravity, grip, friction, braking, jumps, rails, trees, snow tracks and the finish.
import { TAU, RIGS, GRAVITY, GRAVITY_GAIN } from '../core/config.js';
import { W0, FIN } from '../world/course.js';
import { emit } from './particles.js';
import { jumpStep } from './jump.js';
import { railCheck, grindStep } from './grind.js';

const AIRBORNE_Z = 0.05;     // m above the snow, higher counts as in the air
const WIPEOUT_SPIN_RATE = 14; // rad/s, tumble while crashed
const CARVE_RATE = 2.7;      // rad/s, turn rate when standing still
const CARVE_SPEED_LOSS = 0.045; // rad/s less turn rate per m/s of speed (up to 30 m/s)
const CARVE_SPEED_CAP = 30;  // m/s, faster doesn't turn any slower
const CARVE_LIMIT = 0.15;    // rad, the board stays this far from straight across the slope
const BRAKE_GRAVITY = 0.3;   // dimensionless, share of the slope's pull left while braking
const AIR_GRIP = 0.4;        // 1/s, how fast sideways slip dies in the air
const BRAKE_GRIP = 2.2;      // 1/s, the same while braking (a skid)
const DRAG_PER_SPEED = 0.0035; // 1/m, air drag: fraction of speed lost per second per m/s
const SNOW_FRICTION = 0.02;  // 1/s, fraction of speed lost per second on any snow
const POWDER_FRICTION = 0.18; // 1/s, extra off the groomed piste
const BRAKE_DECEL = 16;      // m/s², braking
const EDGE_M = 6;            // m, the rider stays this far inside the map
const TREE_CELL_M = 6;       // m, the trees map's cell size (world/build.js)
const TREE_KEY_STRIDE = 10000; // the trees map key is gx * TREE_KEY_STRIDE + gy (world/build.js)
const TREE_RADIUS_M = 2.4;   // m, closer to a trunk than this is a crash
const TREE_TOP_M = 1.5;      // m above the snow, higher jumps clear the trees
const TREE_BOUNCE_S = 0.12;  // s of motion undone when hitting a tree
const CRASH_TIME = 1.1;      // s of wipeout
// Colour map offsets of the 2 × 2 cells a ski track darkens (RGBA bytes, rows W0 cells apart).
const TRACK_CELLS = Object.freeze([0, 4, W0 * 4, W0 * 4 + 4]);

/**
 * One step of dt (s). sim: {rider, input, session, terrain, trees, spray, gradient (a {gx,gy} scratch object),
 * view (colour maps col and col0, for ski tracks), ui (the menu, for the finish screen)}. Mutates rider, input.jump,
 * session, spray, view.col and the ui.
 */
export function step(sim, dt) {
 const rider = sim.rider;
 const session = sim.session;
 session.time += dt;
 if (rider.grind) {
  grindStep(rider, sim.input, session, sim.spray, dt);
  return;
 }
 const s = Math.hypot(rider.vx, rider.vy);
 steer(rider, sim.input, RIGS[session.rig], s, dt);
 const slip = rider.crashTimer > 0 ? 0 : glide(sim, s, dt);
 rider.x += rider.vx * dt;
 rider.y += rider.vy * dt;
 jumpStep(rider, sim.input, session, sim.spray, dt);
 railCheck(rider, sim.input, sim.spray);
 keepOnMap(rider, sim.terrain.bounds);
 if (rider.crashTimer <= 0 && rider.z < TREE_TOP_M) hitTrees(rider, session, sim.trees, s);
 if (rider.crashTimer <= 0 && rider.z <= AIRBORNE_Z) carveSnow(sim, slip);
 // TODO(B2b): the finish screen is the UI's job: emit a finish event instead of writing the menu here.
 if (rider.y > FIN) {
  const crashes = session.crashes;
  session.phase = 'done';
  sim.ui.msg.hidden = false;
  sim.ui.msgT.textContent = 'Finished in ' + session.time.toFixed(1) + ' s with ' + session.score + ' points and ' +
   crashes + ' crash' + (crashes == 1 ? '' : 'es') + '.';
  sim.ui.go.textContent = 'Ride again';
  sim.ui.go.hidden = false;
 }
}

// The wipeout tumble, spinning in the air, or carving on the snow (within forward or switch).
function steer(rider, input, rig, s, dt) {
 const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
 if (rider.crashTimer > 0) {
  rider.crashTimer -= dt;
  rider.wipeoutSpin += dt * WIPEOUT_SPIN_RATE;
 } else if (rider.z > AIRBORNE_Z) {
  // in the air, left and right spin the board
  rider.wipeoutSpin = 0;
  const da = turn * dt * rig.spin;
  rider.heading += da;
  rider.rotation += da;
 } else {
  rider.wipeoutSpin = 0;
  let a = rider.heading + turn * dt * (CARVE_RATE - Math.min(s, CARVE_SPEED_CAP) * CARVE_SPEED_LOSS) * rig.turn;
  a = ((a % TAU) + TAU) % TAU;
  const bs = a >= Math.PI ? Math.PI : 0;
  rider.heading = bs + Math.max(CARVE_LIMIT, Math.min(Math.PI - CARVE_LIMIT, a - bs));
 }
}

// Gravity along the slope, grip against sideways slip, friction and braking. Returns the sideways slip (m/s).
function glide(sim, s, dt) {
 const rider = sim.rider;
 const isBraking = sim.input.brake;
 const rig = RIGS[sim.session.rig];
 const grav = sim.terrain.gradient(rider.x, rider.y, sim.gradient);
 const m = sim.terrain.groomed(rider.x, rider.y);
 const air = rider.z > AIRBORNE_Z;
 const gk = (air ? 0 : (isBraking ? BRAKE_GRAVITY : 1)) * GRAVITY * GRAVITY_GAIN;
 let vx = rider.vx - grav.gx * gk * dt;
 let vy = rider.vy - grav.gy * gk * dt;
 const dx = Math.cos(rider.heading);
 const dy = Math.sin(rider.heading);
 const al = vx * dx + vy * dy;
 const sx = vx - al * dx;
 const sy = vy - al * dy;
 const k = Math.exp(-(air ? AIR_GRIP : (isBraking ? BRAKE_GRIP : rig.grip)) * dt);
 const slip = Math.hypot(sx, sy);
 vx = dx * al + sx * k;
 vy = dy * al + sy * k;
 const f = Math.max(0, 1 - (DRAG_PER_SPEED * s + SNOW_FRICTION + (air ? 0 : (1 - m) * POWDER_FRICTION)) * dt);
 vx *= f;
 vy *= f;
 if (isBraking && !air) {
  const sn = Math.hypot(vx, vy);
  if (sn > 0) {
   const ns = Math.max(0, sn - BRAKE_DECEL * dt);
   vx *= ns / sn;
   vy *= ns / sn;
  }
 }
 rider.vx = vx;
 rider.vy = vy;
 return slip;
}

function keepOnMap(rider, bounds) {
 if (rider.x < EDGE_M) {
  rider.x = EDGE_M;
  rider.vx = 0;
 }
 if (rider.x > bounds.maxX - EDGE_M) {
  rider.x = bounds.maxX - EDGE_M;
  rider.vx = 0;
 }
 if (rider.y < EDGE_M) {
  rider.y = EDGE_M;
  rider.vy = 0;
 }
}

// A crash for each tree trunk in the 3 × 3 tree cells around the rider that it is moving into (s: speed, m/s).
function hitTrees(rider, session, trees, s) {
 const gx0 = (rider.x / TREE_CELL_M) | 0;
 const gy0 = (rider.y / TREE_CELL_M) | 0;
 for (let u = -1; u <= 1; u++) {
  for (let v = -1; v <= 1; v++) {
   const T = trees.get((gx0 + u) * TREE_KEY_STRIDE + gy0 + v);
   if (T && Math.hypot(T.x - rider.x, T.y - rider.y) < TREE_RADIUS_M && s > 1) {
    rider.crashTimer = CRASH_TIME;
    session.crashes++;
    rider.x -= rider.vx * TREE_BOUNCE_S;
    rider.y -= rider.vy * TREE_BOUNCE_S;
    rider.vx = rider.vy = 0;
   }
  }
 }
}

// On the snow: a deeper track, and spray when carving hard or braking (slip: sideways slip, m/s).
function carveSnow(sim, slip) {
 const rider = sim.rider;
 const isBraking = sim.input.brake;
 // TODO(B2b): ski tracks belong to the view: a track buffer the view owns, not paint in the colour map from here.
 // The track is a fixed depth below the snow as built (col0), never compounded per step: a slow rider stays over one
 // cell for many steps, which turned it black.
 const col = sim.view.col;
 const col0 = sim.view.col0;
 const dk = (isBraking || slip > 3) ? 0.8 : 0.9;
 const o = ((rider.y | 0) * W0 + (rider.x | 0)) * 4;
 const dg = dk + 0.02;
 const db = Math.min(1, dk + 0.07);
 for (const q of TRACK_CELLS) {
  const i = o + q;
  col[i] = Math.min(col[i], col0[i] * dk);
  col[i + 1] = Math.min(col[i + 1], col0[i + 1] * dg);
  col[i + 2] = Math.min(col[i + 2], col0[i + 2] * db);
 }
 const sn = Math.hypot(rider.vx, rider.vy);
 if (isBraking && sn > 3) emit(sim.spray, 1, rider.x, rider.y, 0.15, 2.2, 1.6, -rider.vx * 0.15, -rider.vy * 0.15);
 else if (slip > 4) emit(sim.spray, 1, rider.x, rider.y, 0.15, 2.2, 1.4, 0, 0);
}
