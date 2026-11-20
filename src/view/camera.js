// The camera: its state, following the rider (heading, height, slope), the partial slope-follow tilt, compass heading.
import { CAM_BACK, CAM_HEIGHT, HORIZON_FRAC } from '../core/config.js';

const START_HEADING = 1.57; // rad, straight down the map
const START_SLOPE = 0.26;   // m/m, the run's mean slope
const HEADING_RATE = 3.2;   // 1/s, how fast the camera swings round behind the direction of travel
const SLOPE_RATE = 3;       // 1/s, how fast the slope estimate follows the ground ahead
const HEIGHT_RATE = 6;      // 1/s, how fast the camera height follows
const SLOPE_AHEAD_M = 20;   // m, the slope is measured to the ground this far ahead
const SLOPE_MIN = -0.3;     // m/m, the slope estimate's range
const SLOPE_MAX = 0.8;
const MIN_CLEARANCE_M = 2.5; // m, the camera stays this far above the ground under it
const JUMP_FOLLOW = 0.5;    // dimensionless, share of the rider's jump height the camera rises with
const FOCAL_FRAC = 0.75;    // focal length as a fraction of the render height
const SWITCH_SPEED = -1.5;  // m/s along the board, riding backwards faster than this counts as switch
const AIR_TRACK_SPEED = 1.5; // m/s, in the air the camera follows the direction of travel above this speed
const AIRBORNE_Z = 0.05;    // m above the snow, higher counts as in the air
const R2D = 180 / Math.PI;

/**
 * A new camera: heading (rad), height (m altitude), x, y (m, CAM_BACK behind the rider), dirX, dirY (unit view
 * direction), renderW, renderH (low-res render px), pixelScale (screen px per render px), focalPx, horizonPx
 * (render px), slope (m/m ahead, full-tilt tan), pitchPx (render px), tilt (tan, after partial follow and the clamp).
 */
export function createCamera() {
 return {
  heading: START_HEADING, height: 0, x: 0, y: 0, dirX: 0, dirY: 1, renderW: 1, renderH: 1, pixelScale: 1,
  focalPx: 1, horizonPx: 0, slope: START_SLOPE, pitchPx: 0, tilt: START_SLOPE,
 };
}

/** Puts the camera behind a rider at the top of the run: heading down, groundM (m) the ground there. */
export function resetCamera(camera, groundM) {
 camera.heading = START_HEADING;
 camera.slope = START_SLOPE;
 camera.height = groundM + CAM_HEIGHT + camera.slope * CAM_BACK;
}

/** Puts the camera over the top of the run for the menu backdrop (keeps the slope estimate). groundM: m altitude. */
export function menuCamera(camera, groundM) {
 camera.heading = START_HEADING;
 camera.height = groundM + CAM_HEIGHT;
}

/** Camera heading in compass degrees. Procedural map: world x = game x, world y = -game y. */
export function camCompass(camera) {
 return ((Math.atan2(Math.cos(camera.heading), -Math.sin(camera.heading)) * 180 / Math.PI) % 360 + 360) % 360;
}

// cam.slope is the slope ahead (metres dropped per metre). The camera height still follows it, but the view tilt
// (pitchPx = focalPx * tilt) follows it only partly, from cameraTilt below.
// Partial slope follow (spec camera.slopeFollow, HANGA.cameraPitch). The game's view is "full tilt": its look-down
// grows by atan(s). The spec's rule is applied as a change to that: aim at the ground lookAheadM ahead of the rider
// from a camera rel metres above them, and look down by (fullPitch - partialPitch) less. Level ground: no change.
/**
 * The view tilt (tan). s: full-tilt slope (tan); rel: m, camera height above the rider's ground; drop: m, how far the
 * ground lookAheadM ahead lies below the rider's. The rider clamp is applied in followRider(), in render pixels.
 */
export function cameraTilt(hanga, s, rel, drop) {
 const F = hanga.camera.slopeFollow;
 const D = CAM_BACK + F.lookAheadM;
 const level = -Math.atan(rel / D) * R2D;
 const full = -Math.atan((rel + drop) / D) * R2D;
 const part = hanga.cameraPitch(level, full, Infinity, 0); // negative = looking down
 return Math.tan(Math.atan(s) - (part - full) / R2D);
}

/**
 * Moves the camera after the rider drawn at pose (x, y m; z m above the ground), dt s after the last frame, for a
 * renderW × renderH low-res render on a screenW px wide screen. The camera follows the direction of travel, not the
 * nose: when riding switch it still looks down the slope, and it ignores the board while it spins in the air.
 * Returns the ground height under the rider (m). Mutates camera.
 */
export function followRider(camera, terrain, hanga, pose, rider, renderW, renderH, screenW, dt) {
 const x = pose.x;
 const y = pose.y;
 const jz = pose.z;
 const a = rider.heading;
 const camA = camera.heading;
 const back = rider.vx * Math.cos(a) + rider.vy * Math.sin(a) < SWITCH_SPEED;
 const airTarget = Math.hypot(rider.vx, rider.vy) > AIR_TRACK_SPEED ? Math.atan2(rider.vy, rider.vx) : camA;
 const tgt = jz > AIRBORNE_Z ? airTarget : (back ? a + Math.PI : a);
 const dT = Math.atan2(Math.sin(tgt - camA), Math.cos(tgt - camA));
 camera.heading = camA + dT * Math.min(1, dt * HEADING_RATE);
 // Ground heights from the terrain's smooth surface (it clamps to the map edge): under the rider, under the camera,
 // and SLOPE_AHEAD_M ahead (the slope the camera height follows).
 const dx = Math.cos(camera.heading);
 const dy = Math.sin(camera.heading);
 const px = x - dx * CAM_BACK;
 const py = y - dy * CAM_BACK;
 const gR = terrain.height(x, y);
 const ahead = (gR - terrain.height(x + dx * SLOPE_AHEAD_M, y + dy * SLOPE_AHEAD_M)) / SLOPE_AHEAD_M;
 camera.slope += (Math.max(SLOPE_MIN, Math.min(SLOPE_MAX, ahead)) - camera.slope) * Math.min(1, dt * SLOPE_RATE);
 const overRider = gR + CAM_HEIGHT + camera.slope * CAM_BACK + jz * JUMP_FOLLOW;
 const wantH = Math.max(overRider, terrain.height(px, py) + MIN_CLEARANCE_M);
 camera.height += (wantH - camera.height) * Math.min(1, dt * HEIGHT_RATE);
 const hz = renderH * HORIZON_FRAC;
 const sc = renderH * FOCAL_FRAC;
 // View tilt: partial slope follow, then clamp so the rider stays riderMarginDeg inside the bottom of the frame.
 const follow = hanga.camera.slopeFollow;
 const LA = follow.lookAheadM;
 const yMax = renderH - sc * Math.tan(follow.riderMarginDeg * Math.PI / 180);
 const rel = camera.height - gR;
 const tilt = Math.max(cameraTilt(hanga, camera.slope, rel, gR - terrain.height(x + dx * LA, y + dy * LA)),
  (rel / CAM_BACK * sc + hz - yMax) / sc);
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
