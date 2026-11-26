// The air hints: the arrows that teach the flips (up front flip, down backflip, left and right spin), shown over the
// first few jumps of a profile and on the Controls screen; and the per-step link from the rider to the input.
import { onStep } from '../core/events.js';
import { setAirborne } from '../input/input.js';

const HINTS_KEY = 'gresca-hints'; // localStorage: how many jumps have shown the hints
const HINT_JUMPS = 3;             // the hints show for this many jumps, then stop

// Arrow and what it does, in the order shown.
const HINTS = Object.freeze([
 { arrow: '↑', what: 'front flip' },
 { arrow: '↓', what: 'backflip' },
 { arrow: '◀ ▶', what: 'spin' },
]);

/** The hint arrows as HTML (constants only): one span per hint, used by the air overlay and the Controls screen. */
export function airHintsHtml() {
 return HINTS.map((h) => '<span class="air-hint"><b>' + h.arrow + '</b> ' + h.what + '</span>').join('');
}

// The saved jump count; 0 when storage is blocked or holds nothing usable.
function loadJumps(env) {
 try {
  const saved = Number(env.localStorage.getItem(HINTS_KEY));
  return Number.isFinite(saved) && saved > 0 ? Math.floor(saved) : 0;
 } catch (_) {
  return 0; // storage blocked (private browsing): the hints show again next visit
 }
}

/**
 * The hint overlay's state for ui.hints: jumps (how many jumps have shown them, saved under HINTS_KEY), air (was the
 * rider airborne at the last step), showing. env: anything with a localStorage property.
 */
export function createAirHints(ui, env) {
 ui.hints.innerHTML = airHintsHtml();
 ui.hints.hidden = true;
 return { jumps: loadJumps(env), air: false, showing: false };
}

/** Takes the rider's airborne flag after a step: a take-off counts a jump (saved) and the hints show while it lasts. */
export function updateAirHints(ui, hints, env, isAirborne) {
 if (isAirborne && !hints.air && hints.jumps < HINT_JUMPS) {
  hints.jumps++;
  hints.showing = true;
  try {
   env.localStorage.setItem(HINTS_KEY, String(hints.jumps));
  } catch (_) {
   // storage blocked: the count lasts this visit only
  }
 }
 hints.air = isAirborne;
 if (!isAirborne) hints.showing = false;
 ui.hints.hidden = !hints.showing;
}

/**
 * After every sim step tells the input whether the rider is airborne (rider.z, m, above the snow: flips are an air
 * control) and updates the hints. Returns the hints state.
 */
export function bindAirControls(bus, ui, input, rider, env) {
 const hints = createAirHints(ui, env);
 onStep(bus, () => {
  const isAirborne = rider.z > 0;
  setAirborne(input, isAirborne);
  updateAirHints(ui, hints, env, isAirborne);
 });
 return hints;
}
