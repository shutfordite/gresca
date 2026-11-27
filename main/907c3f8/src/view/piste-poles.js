// The piste's edge poles on a real map: both edges of the run, in the run's difficulty colour, the right-hand ones
// (going down) with an orange top, as European resorts mark them (Andorra, France). Placed once at the boot.

const SPACING_M = 20;   // m of s between poles on each edge
const OUTSIDE_M = 1;    // m past the piste's edge (half its width) that a pole stands
/** m, a pole's height above the snow, and the orange top of a right-hand pole. */
export const PISTE_POLE = Object.freeze({ HEIGHT_M: 2.3, TOP_M: 0.5, HALF_M: 0.05 });
/** The pole colour (a key of the Look's sprites.pistePole) for each OpenSkiMap difficulty, as Europe colours them. */
export const DIFFICULTY_TONE = Object.freeze({
 novice: 'green', easy: 'blue', intermediate: 'red', advanced: 'black', expert: 'black', extreme: 'black',
 freeride: 'yellow',
});

/**
 * The poles along course (the Course) from its start to its finish for a run of difficulty (an OpenSkiMap value):
 * {s (m), x, y (m, world), right (true on the rider's right going down), tone (DIFFICULTY_TONE)}, sorted by s. None
 * when the difficulty is unknown (the procedural maps). Allocates (boot only).
 */
export function pistePoles(course, difficulty) {
 const tone = DIFFICULTY_TONE[difficulty];
 if (!tone) return [];
 const out = [];
 const p = { x: 0, y: 0 };
 for (let s = course.startS; s <= course.finishS; s += SPACING_M) {
  const d = course.widthAt(s) / 2 + OUTSIDE_M;
  for (const side of [-1, 1]) {
   course.point(s, side * d, p);
   out.push({ s, x: p.x, y: p.y, right: side < 0, tone }); // d > 0 is left of the way down (core/contracts.js)
  }
 }
 return out;
}
