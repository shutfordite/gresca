// The play mountain: a steep procedural map with big kickers, the layout the game opens on (docs/adr/0009-play-slope.md).
// Same 1000 x 2450 m grid as the test slope (world/course.js), so the same texture budget; a different centreline,
// height profile, park and piste width. Pure and stateless: functions and frozen constants; world/build.js fills the grids.
import { defineRails } from './course.js';
import { fbmRows } from './noise.js';

const W = 1000; // cells (m) across the map
const H = 2450; // cells (m) down the map

// ---- the fall line: how steep each part of the mountain is ----
const START_ALT_M = 3150;      // m of altitude at the top of the map
const BASE_GRADIENT = 0.62;    // m/m, the steep pitches (tan 32 deg)
const ROLL_LONG = Object.freeze({ amp: 0.07, wavelengthM: 61 * 2 * Math.PI }); // m/m, slow rolls down the fall line
const ROLL_SHORT = Object.freeze({ amp: 0.04, wavelengthM: 23 * 2 * Math.PI }); // m/m, small bumps
// Flatter run-outs: centre y (m), half width (m), and how much gradient they take off (m/m).
const RUNOUTS = Object.freeze([
 Object.freeze({ y: 700, w: 70, cut: 0.4 }),
 Object.freeze({ y: 1480, w: 80, cut: 0.4 }),
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
const NOISE_ON_PISTE = 0.03;   // 0..1, the share of that relief left on the groomed piste
const TREE_CLEAR_M = 62;       // m, trees keep this far from the centreline
const TREELINE_M = 2450;       // m of altitude, no trees above it

/** m, x of the piste centreline at y (m): a wide, gentle S. */
export const cx = (y) => 500 + 130 * Math.sin(y / 450) + 45 * Math.sin(y / 190 + 2);

// Kickers: y of the lip (m). BIG ones are taller and launch harder. Each sits on a steep pitch, with 100 m or more of
// steep ground below it for the landing.
export const KICK = Object.freeze([260, 430, 560, 880, 1010, 1200, 1640, 1800, 1960, 2080]);
export const KBIG = Object.freeze([430, 880, 1200, 1800, 1960]);

// Rails and boxes: [start y (m), length (m), offset from the centreline (m), type], clear of every ramp.
export const RAIL_DEF = Object.freeze([
 [345, 22, -20, 'rail'], [510, 18, 20, 'box'], [960, 24, -20, 'rail'], [1090, 18, 20, 'box'], [1380, 22, -20, 'rail'],
 [1700, 20, 20, 'rail'], [1880, 18, -20, 'box'], [2120, 24, 20, 'rail'],
].map((r) => Object.freeze(r)));

const RAMP_BIG = Object.freeze({ heightM: 4.6, lengthM: 17 }); // m, a big kicker's rise and its run-up before the lip
const RAMP_SMALL = Object.freeze({ heightM: 2.6, lengthM: 12 });
const RAMP_DROP_M = 4;        // m past the lip over which the ramp falls away
const RAMP_FLAT_HALF_M = 14;  // m either side of the centreline the ramp is full height
const RAMP_FADE_M = 3;        // m over which its sides fall to the slope
const LAUNCH_DEPTH_M = 5;     // m past the lip (along s) where the launch happens

/** m/m, how steeply the ground falls along the piste at y (m): the steep pitches, the rolls and the run-outs. */
export function playGradient(y) {
 let g = BASE_GRADIENT + ROLL_LONG.amp * Math.sin(y * 2 * Math.PI / ROLL_LONG.wavelengthM) +
  ROLL_SHORT.amp * Math.sin(y * 2 * Math.PI / ROLL_SHORT.wavelengthM + 1);
 for (const r of RUNOUTS) g -= r.cut * Math.exp(-(((y - r.y) / r.w) ** 2));
 return g;
}

/** m, the kicker ramp height added at (px, py) on the grid: a curved rise up to the lip, then a short drop. */
export function bump(px, py) {
 let h = 0;
 for (const k of KICK) {
  const ramp = KBIG.includes(k) ? RAMP_BIG : RAMP_SMALL;
  if (py < k - ramp.lengthM || py > k + RAMP_DROP_M) continue;
  const d = Math.abs(px - cx(py));
  if (d > RAMP_FLAT_HALF_M + RAMP_FADE_M) continue;
  const u = py < k ? Math.pow((py - (k - ramp.lengthM)) / ramp.lengthM, 1.5) : 1 - (py - k) / RAMP_DROP_M;
  const w = d < RAMP_FLAT_HALF_M ? 1 : 1 - (d - RAMP_FLAT_HALF_M) / RAMP_FADE_M;
  h += ramp.heightM * u * w;
 }
 return h;
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
  row(y, F);
  for (let x = 0; x < W; x++) {
   const d = Math.abs(x - c);
   const t = Math.max(0, Math.min(1, (d - PISTE_FLAT_M) / PISTE_FADE_M));
   const m = 1 - t * t * (3 - 2 * t);
   const i = y * W + x;
   mask[i] = m * 255;
   heights[i] = alt + (F[x] - 0.5) * RELIEF_M * (1 - m * (1 - NOISE_ON_PISTE)) +
    Math.min(Math.max(0, d - PISTE_FLAT_M), SIDE_CAP_M) * SIDE_RISE;
  }
 }
}

/**
 * The play mountain's layout, the same fields as the test slope's (world/build.js MAPS): the grid W, H (m), the finish
 * FIN and start (m of y), the centreline cx, the park (KICK, KBIG, RAILS, bump), where the kickers launch and how
 * the ramps are stamped, the lift line, the trees' limits and fill(heights, mask), which fills the height and mask grids.
 */
export const PLAY_LAYOUT = Object.freeze({
 id: 'play', W, H, FIN, startY: START_Y, pisteHalfWidth: PISTE_HALF_WIDTH,
 kickerHalfWidth: RAMP_FLAT_HALF_M, kickerDepth: LAUNCH_DEPTH_M,
 cx, KICK, KBIG, RAIL_DEF, RAILS: defineRails(cx, RAIL_DEF), bump,
 lift: Object.freeze({ x: 880, y0: 140, y1: 2290 }),
 treeline: TREELINE_M,
 treeClearM: TREE_CLEAR_M,
 ramp: Object.freeze({ back: RAMP_BIG.lengthM, fwd: RAMP_DROP_M, half: RAMP_FLAT_HALF_M + RAMP_FADE_M }),
 fill: fillHeights,
});
