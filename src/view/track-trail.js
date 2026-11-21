// The ski track as the equipment cut it: a ring of track samples (one quad of snow each) per contact line, appended
// from RiderState after each sim step. Pure data for the GPU ribbon (gl/track-ribbon.js); no GL, no allocation.

export const TRAIL_CAPACITY = 16384; // samples in the ring, shared by both lines (2 lines x 8192, or 1 line x 16384)
export const SAMPLE_FLOATS = 8;      // floats per sample: x, y, prevX, prevY, halfWidth, prevHalfWidth, depth, smear
export const TRAIL_BYTES = TRAIL_CAPACITY * SAMPLE_FLOATS * 4; // bytes of the ring (512 KiB)
export const SPACING_M = 0.12;       // m the rider moves along a line before it adds another sample
export const MAX_GAP_M = 4;          // m between steps beyond which the rider was moved (a restart), not ridden
export const AIRBORNE_Z = 0.05;      // m above the snow, higher leaves no track (as sim/step.js)
export const SKID_DEEP = 3;          // m/s of sideways slip above which the cut is deeper (as the colour-map track)
export const DEPTH_CARVE = 0.55;     // 0..1 groove depth of a plain carve
export const DEPTH_DEEP = 1;         // 0..1 groove depth when braking or skidding
export const EDGE_FULL_RAD = 1;      // rad of edge angle (RiderState.edge) that cuts the deepest, narrowest groove
export const EDGE_DEPTH_GAIN = 0.4;  // extra depth (0..1 scale) at EDGE_FULL_RAD; the edge is 0 until package F6
export const MAX_HALF_WIDTH_M = 1.2; // m, the widest swath half-width

// Equipment on the snow, by rig (session.rig): contact lines and their size (the art spec's board and skis).
export const EQUIPMENT = Object.freeze({
 board: Object.freeze({ lines: 1, lengthM: 1.55, widthM: 0.27, centreSpacingM: 0 }),
 ski: Object.freeze({ lines: 2, lengthM: 1.7, widthM: 0.09, centreSpacingM: 0.2 }),
});

/**
 * A new trail. data is the ring, SAMPLE_FLOATS per sample (the GPU reads it as it is); written counts samples ever
 * appended (the next goes to slot written % TRAIL_CAPACITY); epoch changes when the trail is cleared. The prev*
 * arrays are the last point of each line (open: it is on a segment).
 */
export function createTrail() {
 return {
  data: new Float32Array(TRAIL_CAPACITY * SAMPLE_FLOATS),
  written: 0,
  epoch: 0,
  open: [false, false],
  lastX: new Float64Array(2),
  lastY: new Float64Array(2),
  lastHalf: new Float64Array(2),
 };
}

/** Empties the trail (a new run): nothing is drawn and the next sample starts a new segment. */
export function clearTrail(trail) {
 trail.data.fill(0);
 trail.written = 0;
 trail.epoch++;
 trail.open[0] = trail.open[1] = false;
}

/** Ends the open segments: the next sample starts a new one, so no ribbon bridges the gap. */
export function breakTrail(trail) {
 trail.open[0] = trail.open[1] = false;
}

/** The swath half-width (m) of equipment (EQUIPMENT entry) at the angle between where it points and where it goes. */
export function swathHalfWidth(equip, slipRad) {
 const half = equip.widthM / 2 + equip.lengthM / 2 * Math.abs(Math.sin(slipRad));
 return Math.min(MAX_HALF_WIDTH_M, half);
}

/**
 * Appends the track of one sim step to trail: the rider (RiderState) on rig ('board' | 'ski'). Off the snow (grinding,
 * crashed, airborne) or after a jump of more than MAX_GAP_M it ends the open segments. Reads the rider, writes only
 * the trail, allocates nothing.
 */
export function recordTrail(trail, rider, rig) {
 if (rider.grind || rider.crashTimer > 0 || rider.z > AIRBORNE_Z) {
  breakTrail(trail);
  return;
 }
 const equip = EQUIPMENT[rig] || EQUIPMENT.board;
 const slip = rider.boardHeading - rider.travelHeading;
 const half = swathHalfWidth(equip, slip);
 const smear = Math.min(1, Math.abs(Math.sin(slip)));
 const cutting = rider.isBraking || rider.skid > SKID_DEEP;
 const edge = Math.min(1, Math.abs(rider.edge) / EDGE_FULL_RAD);
 const depth = Math.min(1, (cutting ? DEPTH_DEEP : DEPTH_CARVE) + EDGE_DEPTH_GAIN * edge);
 const nx = -Math.sin(rider.boardHeading); // unit vector across the board, to its left
 const ny = Math.cos(rider.boardHeading);
 for (let line = 0; line < equip.lines; line++) {
  const across = equip.lines === 1 ? 0 : (line - 0.5) * equip.centreSpacingM; // m, + to the left
  addPoint(trail, line, rider.x + nx * across, rider.y + ny * across, half, depth, smear);
 }
}

// One contact line's point (x, y m): starts a segment, or appends a sample from the line's last point when far enough.
function addPoint(trail, line, x, y, half, depth, smear) {
 if (trail.open[line]) {
  const dx = x - trail.lastX[line];
  const dy = y - trail.lastY[line];
  const dist = Math.hypot(dx, dy);
  if (dist > MAX_GAP_M) {
   trail.open[line] = false; // moved, not ridden
  } else if (dist < SPACING_M) {
   return;
  } else {
   const o = (trail.written % TRAIL_CAPACITY) * SAMPLE_FLOATS;
   const d = trail.data;
   d[o] = x;
   d[o + 1] = y;
   d[o + 2] = trail.lastX[line];
   d[o + 3] = trail.lastY[line];
   d[o + 4] = half;
   d[o + 5] = trail.lastHalf[line];
   d[o + 6] = depth;
   d[o + 7] = smear;
   trail.written++;
  }
 }
 trail.open[line] = true;
 trail.lastX[line] = x;
 trail.lastY[line] = y;
 trail.lastHalf[line] = half;
}
