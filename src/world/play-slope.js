// The play mountain: a procedural map with a snow park (K1) above a steep finish run, the layout the game opens on
// (ADR 0009).
// Same 1000 x 2450 m grid as the test slope (world/course.js), so the same texture budget; a different centreline,
// height profile, park (jumps and rails as features, world/park/) and piste width. Pure and stateless: functions and
// frozen constants; build.js fills the grids.
import { defineRails } from './course.js';
import { fbmRows } from './noise.js';
import { createPlayPark } from './park/play-park.js';

const W = 1000; // cells (m) across the map
const H = 2450; // cells (m) down the map

// ---- the fall line: how steep each part of the mountain is ----
// The park (K1, world/park/play-park.js) is ridden at steady speeds, so each part has its own pitch: the rider's speed
// settles where gravity along the slope (1.6 * 9.81 * pitch) meets the snow and air drag, about 10 m/s at 0.04, 14 at
// 0.07, 17 at 0.10, 20 at 0.13 and 24 at 0.18, and every jump is sized for the speed at its lip. The pitch eases
// between the parts; the finish run is steep (0.66, 33 degrees).
const START_ALT_M = 2600;      // m of altitude at the top of the map
const PITCH = Object.freeze([  // [y (m), fall m/m along the piste]: the pitch at each y, eased between
 [0, 0.04], [330, 0.04],       // the start and the jib section: nearly level, about 10 m/s
 [400, 0.09], [700, 0.09],     // the S line
 [790, 0.115], [1080, 0.115],  // the M line
 [1170, 0.14], [1540, 0.14],   // the L line
 [1620, 0.18], [2010, 0.18],   // the mega ramp: its run-in, drop-in and landing
 [2090, 0.66], [2450, 0.66],   // the steep finish run
].map((p) => Object.freeze(p)));
const PARK_FROM_Y = 100;       // m, the roll and the noise are gone from here on (the park is groomed flat)...
const PARK_TO_Y = 2020;        // m, ...to here, easing over PARK_EASE_M at each end
const PARK_EASE_M = 80;        // m
const ROLL_LONG = Object.freeze({ amp: 0.07, wavelengthM: 61 * 2 * Math.PI }); // m/m, slow rolls down the fall line
const ROLL_SHORT = Object.freeze({ amp: 0.04, wavelengthM: 23 * 2 * Math.PI }); // m/m, small bumps
// A flatter run-out near the finish: centre y (m), half width (m), and how much gradient it takes off (m/m).
const RUNOUTS = Object.freeze([
 Object.freeze({ y: 2270, w: 100, cut: 0.44 }), // the finish run-out
]);

// ---- the piste and its sides ----
const FIN = 2330;              // m, y of the finish line
const START_Y = 60;            // m, y where a run starts
const PISTE_FLAT_M = 30;       // m either side of the centreline the groomed mask is full and the snow level across
const PISTE_FADE_M = 24;       // m over which the groomed mask fades out (half at PISTE_FLAT_M + 12 = 42 m)
const PISTE_HALF_WIDTH = 42;   // m either side of the centreline where the groomed mask is half (piste 84 m wide)
const SIDE_RISE = 0.45;        // m/m, how steeply the ground rises away from the piste
const SIDE_CAP_M = 240;        // m from the centreline beyond which the side stops rising
const RELIEF_M = 160;          // m, peak-to-peak of the fractal noise off the piste (the test slope's is 110)
const NOISE_ON_PISTE = 0.03;   // 0..1, the share of that relief left on the groomed piste (none inside the park)
const TREE_CLEAR_M = 62;       // m, trees keep this far from the centreline
const TREELINE_M = 2450;       // m of altitude, no trees above it

// The centreline: a bend at the top and another at the bottom, dead straight between them (the park: a jump faces
// down the line and the snow is level across it).
const CENTRE_X = 500;          // m, x of the straight middle
const BEND_TOP = Object.freeze({ fromY: 0, toY: 140, swingM: 40 });       // m: x is CENTRE_X + swing at fromY
const BEND_BOTTOM = Object.freeze({ fromY: 2000, toY: 2450, swingM: -90 }); // m: x is CENTRE_X + swing at toY

const smooth = (t) => t * t * (3 - 2 * t);
const unit = (v, from, to) => Math.max(0, Math.min(1, (v - from) / (to - from)));

/** m, x of the piste centreline at y (m): straight through the park, with a gentle bend at each end. */
export function cx(y) {
 const top = BEND_TOP.swingM * (1 - smooth(unit(y, BEND_TOP.fromY, BEND_TOP.toY)));
 const bottom = BEND_BOTTOM.swingM * smooth(unit(y, BEND_BOTTOM.fromY, BEND_BOTTOM.toY));
 return CENTRE_X + top + bottom;
}

/** m/m, how steeply the piste falls along y at y (m): PITCH eased between its anchors (no rolls here). */
export function pitchAt(y) {
 const last = PITCH.length - 1;
 let g = PITCH[last][1];
 if (y <= PITCH[0][0]) g = PITCH[0][1];
 for (let i = 0; i < last; i++) {
  if (y >= PITCH[i][0] && y < PITCH[i + 1][0]) {
   g = PITCH[i][1] + (PITCH[i + 1][1] - PITCH[i][1]) * smooth(unit(y, PITCH[i][0], PITCH[i + 1][0]));
  }
 }
 return g;
}

// 0..1, how much of the park's flat grooming applies at y: 1 inside, easing out over PARK_EASE_M at each end.
function parkness(y) {
 const easeIn = smooth(unit(y, PARK_FROM_Y - PARK_EASE_M, PARK_FROM_Y));
 return easeIn * (1 - smooth(unit(y, PARK_TO_Y, PARK_TO_Y + PARK_EASE_M)));
}

/** m/m, how steeply the ground falls along the piste at y (m): the pitch, rolls outside the park, the run-out. */
export function playGradient(y) {
 const roll = ROLL_LONG.amp * Math.sin(y * 2 * Math.PI / ROLL_LONG.wavelengthM) +
  ROLL_SHORT.amp * Math.sin(y * 2 * Math.PI / ROLL_SHORT.wavelengthM + 1);
 let g = pitchAt(y) + roll * (1 - parkness(y));
 for (const r of RUNOUTS) g -= r.cut * Math.exp(-(((y - r.y) / r.w) ** 2));
 return g;
}

/**
 * m, s (arc length along the centreline) at the whole grid row y (m): the course starts at START_Y with s = START_Y
 * and follows one-metre chords of cx, so s - y is the length the bends add.
 */
export function sOfY(y) {
 let s = START_Y;
 for (let row = START_Y; row < y; row++) s += Math.hypot(cx(row + 1) - cx(row), 1);
 return s;
}

// Heights (m) and the groomed mask: the fall line integrated down the map, noise flattened on the piste, the sides
// rising away from it.
function fillHeights(heights, mask) {
 const row = fbmRows(W, H);
 const F = new Float64Array(W);
 let alt = START_ALT_M; // m, altitude of the piste at this y
 for (let y = 0; y < H; y++) {
  const c = cx(y);
  alt -= playGradient(y);
  const noiseOnPiste = NOISE_ON_PISTE * (1 - parkness(y)); // none on the piste in the park
  row(y, F);
  for (let x = 0; x < W; x++) {
   const d = Math.abs(x - c);
   const t = Math.max(0, Math.min(1, (d - PISTE_FLAT_M) / PISTE_FADE_M));
   const m = 1 - t * t * (3 - 2 * t);
   const i = y * W + x;
   mask[i] = m * 255;
   heights[i] = alt + (F[x] - 0.5) * RELIEF_M * (1 - m * (1 - noiseOnPiste)) +
    Math.min(Math.max(0, d - PISTE_FLAT_M), SIDE_CAP_M) * SIDE_RISE;
  }
 }
}

// The park (K1): the jumps and rails designed for this mountain's pitches, and the straight stand-ins for its rails
// that today's grind still slides on (until K3 grinds on the features' own lines).
const PARK = createPlayPark({ pitchAt, sOfY });
const RAIL_DEF = PARK.legacyRails;

/**
 * The play mountain's layout, the same fields as the test slope's (world/build.js MAPS): the grid W, H (m), the finish
 * FIN and start (m of y), the centreline cx, the park (park(): the authored jumps and rails, world/park/play-park.js),
 * the rails' stand-ins (RAIL_DEF, RAILS), the lift line, the trees' limits and fill(heights, mask), which fills the
 * grids. No kickers (KICK is empty, bump is flat): the jumps are snow in the terrain's features layer.
 */
export const PLAY_LAYOUT = Object.freeze({
 id: 'play', W, H, FIN, startY: START_Y, pisteHalfWidth: PISTE_HALF_WIDTH,
 cx, KICK: Object.freeze([]), KBIG: Object.freeze([]), RAIL_DEF, RAILS: defineRails(cx, RAIL_DEF), bump: () => 0,
 park: PARK.authored,
 lift: Object.freeze({ x: 880, y0: 140, y1: 2290 }),
 treeline: TREELINE_M,
 treeClearM: TREE_CLEAR_M,
 ramp: Object.freeze({ back: 0, fwd: 0, half: 0 }),
 fill: fillHeights,
});
