// Park features for the tests (docs/adr/0012-park-features.md): a medium table jump and a down-flat-down rail with
// two kinks, as authored in a course file (no world points). parkAt(s0) places them from s0 m along the course.

/** {jumps, rails}: a fresh copy each call, from s0 (m of s, default 180), so a test may break it. */
export function parkAt(s0 = 180) {
 return {
  jumps: [
   {
    s: s0,
    d: -3,
    size: 'm',
    designSpeed: 14,
    takeoff: { length: 8, height: 2, angle: 0.47, width: 6 },
    table: { length: 10, gap: false },
    landing: { height: 1.6, angle: 0.5, length: 18 },
   },
  ],
  rails: [
   {
    points: [
     { s: s0 + 60, d: 4, h: 0.6 },
     { s: s0 + 64, d: 4, h: 1.2 },
     { s: s0 + 70, d: 4, h: 1.2 },
     { s: s0 + 74, d: 4, h: 0.6 },
    ],
    profile: 'rail',
    width: 0.06,
    legs: true,
    entry: 'ramp',
   },
  ],
 };
}
