// The name of a trick, from the flips and spin a score SimEvent carries (the sim holds no naming code).

const FLIP_WORDS = Object.freeze(['', '', 'Double ', 'Triple ', 'Quad ']); // the prefix for n flips; more are '5x '

/**
 * The name of a trick: turns is the signed whole flip rotations (+ front, - back, 0 none), degrees the spin rounded to
 * 180. '' with no flip (a plain spin keeps its '<degrees> Air'), else 'Front flip', 'Double backflip 360', ...
 */
export function trickName(turns, degrees) {
 const n = Math.abs(turns);
 if (n === 0) return '';
 const count = n < FLIP_WORDS.length ? FLIP_WORDS[n] : n + 'x ';
 const base = turns > 0 ? (count ? 'front flip' : 'Front flip') : (count ? 'backflip' : 'Backflip');
 return count + base + (degrees ? ' ' + degrees : '');
}
