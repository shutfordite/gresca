// The play mountain's park (K1, docs/ROADMAP.md "a real snow park"): an S, an M and an L jump line of 3 to 4 tables
// each at the steady speed their pitch gives, a jib section of nine rails and boxes, and one mega ramp with its
// drop-in, from the top of the mountain down. Authored in grid rows (y, m down the map; the centreline is dead straight
// through the park, so s - y is constant there) and turned into (s, d) features; the jumps are designed for the speed
// the rider has at each lip (world/park/jump-design.js). Pure: functions and frozen constants.
import { designJump } from './jump-design.js';
import { railLine } from './rail-shapes.js';

// The jump lines: [y of the lip (m), size, speed (m/s) a rider has at the lip], the speed measured riding the centre
// with no brake (test/park-play.test.js keeps them honest). The speeds climb along a line as the rider settles into its
// pitch, so each jump is sized for its own.
const JUMP_LINES = Object.freeze([
 Object.freeze({ name: 'S line', lips: [[490, 's', 13.9], [550, 's', 15.1], [610, 's', 15.3], [670, 's', 15.4]] }),
 Object.freeze({ name: 'M line', lips: [[880, 'm', 16.9], [960, 'm', 17.1], [1040, 'm', 17.4]] }),
 Object.freeze({ name: 'L line', lips: [[1260, 'l', 16.6], [1350, 'l', 17.2], [1440, 'l', 17.6]] }),
 Object.freeze({ name: 'mega ramp', lips: [[1920, 'xl', 16.9]] }),
]);
// The jib section, three rows of three: [y of the start (m), d (m to the left), profile, shape, length (m)].
const JIB = Object.freeze([
 [200, -22, 'rail', 'straight', 10], [200, 0, 'rail', 'down', 9], [200, 22, 'box', 'flat', 8],
 [250, -22, 'rail', 'flat-down', 12], [250, 0, 'rail', 'down-flat-down', 14], [250, 22, 'box', 'kinked', 10],
 [300, -18, 'rail', 'c-rail', 14], [300, 0, 'box', 'rainbow', 9], [300, 20, 'rail', 's-rail', 16],
].map((r) => Object.freeze(r)));

/**
 * The park of the play mountain: {authored()}. pitchAt(y): m/m the piste falls along y; sOfY(y): m of s at
 * grid row y. authored() returns {jumps, rails} as the course's features are authored (core/contracts.js, no world
 * points).
 */
export function createPlayPark({ pitchAt, sOfY }) {
 function authored() {
  const jumps = [];
  for (const line of JUMP_LINES) {
   for (const [y, size, speed] of line.lips) {
    jumps.push(designJump({ size, speed, slope: pitchAt(y), s: sOfY(y), d: 0 }));
   }
  }
  const rails = JIB.map(([y, d, profile, shape, length]) => railLine({
   shape, profile, s: sOfY(y), d, length, slope: pitchAt(y), entry: profile === 'box' ? 'side' : 'ramp',
  }));
  return { jumps, rails };
 }
 return Object.freeze({ authored });
}
