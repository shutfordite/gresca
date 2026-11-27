// The camera: its state, following the rider (heading, height, slope), the partial slope-follow tilt, compass heading.
import { compassDeg } from '../world/map-frame.js';

const START_HEADING = 1.57; // rad on the map's grid (clockwise from across, MapFrame): just short of straight down
const START_SLOPE = 0.26;   // m/m, the run's mean slope
const HEADING_RATE = 3.2;   // 1/s, how fast the camera swings round behind the direction of travel
const SLOPE_RATE = 3;       // 1/s, how fast the slope estimate follows the ground ahead
const HEIGHT_RATE = 6;      // 1/s, how fast the camera height follows
const SLOPE_AHEAD_M = 20;   // m, the slope is measured to the ground this far ahead
const SLOPE_MIN = -0.3;     // m/m, the slope estimate's range
const SLOPE_MAX = 0.8;
const MIN_CLEARANCE_M = 2.5; // m, the camera stays this far above the ground under it
const JUMP_FOLLOW = 0.5;    // dimensionless, share of the rider's jump height the camera rises with
const MODE_TAU = 0.1;       // s, time constant of the ease to a new camera mode (98% there in 0.4 s)
const MODE_DONE = 1e-3;     // a framing value this close to the mode's snaps to it (under a pixel of focal length)
const TRACK_SPEED = 1.5;    // m/s, faster than this the camera turns toward the direction of travel; slower, it holds
const LOOK_TAU = 0.35;       // s, time constant of the swing to look back uphill and of the swing home again
const LOOK_DONE = 1e-3;     // dimensionless, a look blend this close to 0 or 1 snaps to it
const AIRBORNE_Z = 0.05;    // m above the snow, higher counts as in the air
const R2D = 180 / Math.PI;
// The framing the camera carries (eased to the mode): [camera field, CAM_MODES field]. See createCamera().
const MODE_FIELDS = Object.freeze([
 Object.freeze(['back', 'back']),
 Object.freeze(['rise', 'height']),
 Object.freeze(['fov', 'fov']),
 Object.freeze(['focalFrac', 'focalFrac']),
 Object.freeze(['horizonFrac', 'horizonFrac']),
]);

/**
 * A new camera, in world metres and radians (docs/adr/0005-enu-frame.md): heading (rad, counter-clockwise from east),
 * height (m altitude), x, y (m, back behind the rider), dirX, dirY (unit view direction), renderW, renderH
 * (low-res render px), pixelScale (screen px per render px), focalPx, horizonPx (render px), slope (m/m ahead,
 * full-tilt tan), pitchPx (render px), tilt (tan, after partial follow and the clamp), look (0..1, how far the swing
 * to look back uphill has got), lookOffset (rad the view is turned from the follow heading, 0..PI). The framing, which
 * eases to the camera mode (CAM_MODES): back (m behind the rider), rise (m above the rider's ground), fov (rad),
 * focalFrac and horizonFrac (of the render height). frame: the map's MapFrame. mode: the CAM_MODES entry to start in.
 */
export function createCamera(frame, mode) {
 const dir = frame.vecToWorld(0, 1, { x: 0, y: 0 }); // down the map until the first frame sets it
 return {
  heading: frame.headingToWorld(START_HEADING), height: 0, x: 0, y: 0, dirX: dir.x, dirY: dir.y, renderW: 1,
  renderH: 1, pixelScale: 1, look: 0, lookOffset: 0,
  focalPx: 1, horizonPx: 0, slope: START_SLOPE, pitchPx: 0, tilt: START_SLOPE,
  back: mode.back, rise: mode.height, fov: mode.fov, focalFrac: mode.focalFrac, horizonFrac: mode.horizonFrac,
 };
}

/** Sets the camera's framing to mode (a CAM_MODES entry) at once, with no ease. */
export function snapMode(camera, mode) {
 for (let i = 0; i < MODE_FIELDS.length; i++) camera[MODE_FIELDS[i][0]] = mode[MODE_FIELDS[i][1]];
}

// Eases the framing toward mode over MODE_TAU (frame-rate independent): no snap when the player switches views.
function easeMode(camera, mode, dt) {
 const k = 1 - Math.exp(-dt / MODE_TAU);
 for (let i = 0; i < MODE_FIELDS.length; i++) {
  const own = MODE_FIELDS[i][0];
  const wanted = mode[MODE_FIELDS[i][1]];
  const gap = wanted - camera[own];
  camera[own] = Math.abs(gap) < MODE_DONE ? wanted : camera[own] + gap * k;
 }
}

/**
 * Puts the camera behind a rider at the top of the run: heading down the map (frame), groundM (m) the ground, framed
 * as mode (a CAM_MODES entry).
 */
export function resetCamera(camera, groundM, frame, mode) {
 snapMode(camera, mode);
 camera.heading = frame.headingToWorld(START_HEADING);
 camera.look = camera.lookOffset = 0;
 camera.slope = START_SLOPE;
 camera.height = groundM + camera.rise + camera.slope * camera.back;
}

/**
 * Puts the camera over the top of the run for the menu backdrop, heading down the map (frame), keeping the slope
 * estimate. groundM: m altitude. mode: the CAM_MODES entry to frame it with.
 */
export function menuCamera(camera, groundM, frame, mode) {
 snapMode(camera, mode);
 camera.heading = frame.headingToWorld(START_HEADING);
 camera.look = camera.lookOffset = 0;
 camera.height = groundM + camera.rise;
}

/** Camera heading in compass degrees (0..360, clockwise from north): the art spec's unit. */
export function camCompass(camera) {
 return compassDeg(camera.heading);
}

// cam.slope is the slope ahead (metres dropped per metre). The camera height still follows it, but the view tilt
// (pitchPx = focalPx * tilt) follows it only partly, from cameraTilt below.
// Partial slope follow (the Look's camera framing, spec camera.slopeFollow). The game's view is "full tilt": its
// look-down grows by atan(s). The spec's rule is applied as a change to that: aim at the ground lookAheadM ahead of the rider
// from a camera rel metres above them, and look down by (fullPitch - partialPitch) less. Level ground: no change.
/**
 * The view tilt (tan). s: full-tilt slope (tan); rel: m, camera height above the rider's ground; drop: m, how far the
 * ground lookAheadM ahead lies below the rider's. framing: the Look's camera. back: m, the camera's distance behind
 * the rider. The rider clamp is applied in followRider(), in render pixels.
 */
export function cameraTilt(framing, s, rel, drop, back) {
 const D = back + framing.lookAheadM;
 const level = -Math.atan(rel / D) * R2D;
 const full = -Math.atan((rel + drop) / D) * R2D;
 const part = framing.partialPitchDeg(level, full); // negative = looking down
 return Math.tan(Math.atan(s) - (part - full) / R2D);
}

// The swing eased at both ends: 0..1 in, 0..1 out (smoothstep).
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Moves the camera after the rider drawn at pose (x, y m; z m above the ground), dt s after the last frame, for a
 * renderW × renderH low-res render on a screenW px wide screen. The camera follows the direction of travel, not the
 * nose: when riding switch it still looks down the slope, and it ignores the board while it spins in the air.
 * lookBack (0..1, InputState.lookBack, a view request): above 0 the camera swings round to face uphill (heading + PI),
 * placed downhill of the rider so it looks back at them and the slope above; it eases there and back with
 * LOOK_TAU. framing: the Look's camera. mode: the CAM_MODES entry to frame the rider with; the camera eases to it
 * (MODE_TAU). Returns the ground height under the rider (m). Mutates camera.
 */
export function followRider(camera, terrain, framing, pose, rider, renderW, renderH, screenW, dt, lookBack, mode) {
 easeMode(camera, mode, dt);
 const back = camera.back;
 const x = pose.x;
 const y = pose.y;
 const jz = pose.z;
 // camera.heading is the view heading: the follow heading plus the swing offset applied last frame.
 const camA = camera.heading - camera.lookOffset;
 // The camera follows the direction of travel (the velocity's heading, as rider.travelHeading), never the equipment
 // heading, on the snow and in the air: a brake that yaws the board across the slope, a skid or riding switch doesn't
 // swing it (F5). Near a standstill the direction of travel is noise, so the camera holds its heading.
 const tgt = Math.hypot(rider.vx, rider.vy) > TRACK_SPEED ? Math.atan2(rider.vy, rider.vx) : camA;
 const dT = Math.atan2(Math.sin(tgt - camA), Math.cos(tgt - camA));
 const followA = camA + dT * Math.min(1, dt * HEADING_RATE);
 // Look back: ease the blend toward the request (frame-rate independent), snapping when it has arrived.
 camera.look += (lookBack - camera.look) * (1 - Math.exp(-dt / LOOK_TAU));
 if (camera.look < LOOK_DONE) camera.look = 0;
 else if (camera.look > 1 - LOOK_DONE) camera.look = 1;
 camera.lookOffset = Math.PI * ease(camera.look);
 camera.heading = followA + camera.lookOffset;
 // Ground heights from the terrain's smooth surface (it clamps to the map edge): under the rider, under the camera,
 // and SLOPE_AHEAD_M ahead (the slope the camera height follows).
 const dx = Math.cos(camera.heading);
 const dy = Math.sin(camera.heading);
 const px = x - dx * back;
 const py = y - dy * back;
 const gR = terrain.height(x, y);
 const ahead = (gR - terrain.height(x + dx * SLOPE_AHEAD_M, y + dy * SLOPE_AHEAD_M)) / SLOPE_AHEAD_M;
 camera.slope += (Math.max(SLOPE_MIN, Math.min(SLOPE_MAX, ahead)) - camera.slope) * Math.min(1, dt * SLOPE_RATE);
 const overRider = gR + camera.rise + camera.slope * back + jz * JUMP_FOLLOW;
 const wantH = Math.max(overRider, terrain.height(px, py) + MIN_CLEARANCE_M);
 camera.height += (wantH - camera.height) * Math.min(1, dt * HEIGHT_RATE);
 const hz = renderH * camera.horizonFrac;
 const sc = renderH * camera.focalFrac;
 // View tilt: partial slope follow, then clamp so the rider stays riderMarginDeg inside the bottom of the frame.
 const LA = framing.lookAheadM;
 const yMax = renderH - sc * Math.tan(framing.riderMarginDeg * Math.PI / 180);
 const rel = camera.height - gR;
 const tilt = Math.max(cameraTilt(framing, camera.slope, rel, gR - terrain.height(x + dx * LA, y + dy * LA), back),
  (rel / back * sc + hz - yMax) / sc);
 camera.tilt = tilt;
 camera.x = px;
 camera.y = py;
 camera.dirX = dx;
 camera.dirY = dy;
 camera.renderW = renderW;
 camera.renderH = renderH;
 camera.pixelScale = screenW / renderW;
 camera.focalPx = sc;
 camera.horizonPx = hz;
 camera.pitchPx = sc * tilt;
 return gR;
}
