// The procedural course: map size, the piste centreline cx(), the finish, and where the kickers, rails and boxes go.

export const W0 = 1000; // cells (m) across the map
export const H0 = 2450; // cells (m) down the map
export const FIN = 2330; // m, y of the finish line

// Terrain park. Kickers launch fast riders; KBIG ones have taller ramps and give more air. Values are y of the lip, m.
export const KICK = Object.freeze([260, 340, 400, 760, 840, 920, 1060, 1250, 1400, 1560, 1680, 1850, 1990, 2150]);
export const KBIG = Object.freeze([400, 920, 1250, 1680, 2150]);

// Rails and boxes: [start y (m), length (m), offset from the piste centreline (m), type]. They sit between the kickers.
export const RAIL_DEF = Object.freeze([
 [285, 20, -9, 'rail'], [355, 18, 9, 'box'], [775, 22, -9, 'rail'], [855, 18, 9, 'box'], [940, 24, -9, 'rail'],
 [1080, 16, 9, 'box'], [1125, 22, -9, 'rail'], [1275, 20, 9, 'rail'], [1420, 24, -9, 'box'], [1590, 20, 9, 'rail'],
 [1700, 22, -9, 'rail'], [1880, 18, 9, 'box'], [2020, 24, -9, 'rail'],
].map((r) => Object.freeze(r)));

const RAIL_HEIGHT_M = 0.75; // m, top of a rail above the snow
const BOX_HEIGHT_M = 0.55;  // m, top of a box above the snow

/** m, x of the piste centreline at y (m). */
export const cx = (y) => 500 + 170 * Math.sin(y / 350) + 70 * Math.sin(y / 130 + 1);

/** A rail is a straight chord that follows the piste: x0,y0 to its end, unit direction dx,dy, length len (m). */
function makeRail([ya, n, off, t]) {
 const yb = ya + n;
 const x0 = cx(ya) + off;
 const x1 = cx(yb) + off;
 const len = Math.hypot(x1 - x0, yb - ya);
 return Object.freeze({
  y0: ya, y1: yb, x0, x1, len, dx: (x1 - x0) / len, dy: (yb - ya) / len, h: t === 'box' ? BOX_HEIGHT_M : RAIL_HEIGHT_M, t,
 });
}

/** The rails and boxes, {y0,y1,x0,x1,len,dx,dy,h,t}, in RAIL_DEF order (frozen). */
export const RAILS = Object.freeze(RAIL_DEF.map(makeRail));

/** m, the kicker ramp height added at (px,py): a curved rise up to the lip, then a short drop. */
export function bump(px, py) {
 let h = 0;
 for (const k of KICK) {
  if (py < k - 11 || py > k + 4) continue;
  const d = Math.abs(px - cx(py));
  if (d > 10) continue;
  const hk = KBIG.includes(k) ? 2.2 : 1.3;
  const u = py < k ? Math.pow((py - (k - 11)) / 11, 1.5) : 1 - (py - k) / 4;
  const w = d < 7 ? 1 : 1 - (d - 7) / 3;
  h += hk * u * w;
 }
 return h;
}
