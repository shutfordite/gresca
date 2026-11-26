// Every control, touch and keyboard, defined once: input.js reads its keys and swipe distance from here and the
// Controls screen (ui/controls.js) is generated from it, so the help cannot drift from the code.
import { SWIPE_PX } from '../core/config.js';

// Freezes a value and everything inside it (the table must not change at run time).
function deepFreeze(value) {
 for (const inner of Object.values(value)) if (inner && typeof inner === 'object') deepFreeze(inner);
 return Object.freeze(value);
}

// Gesture ids the Controls screen draws a diagram for.
export const GESTURES = Object.freeze({
 HOLD_LEFT: 'hold-left',   // finger held on the left half of the screen
 HOLD_RIGHT: 'hold-right', // finger held on the right half
 HOLD_BOTH: 'hold-both',   // fingers on both halves together
 SWIPE_DOWN: 'swipe-down', // a finger dragged down
 SWIPE_UP_HOLD: 'swipe-up-hold', // a finger dragged up and kept down
 DRAG_BOTH_UP_AIR: 'drag-both-up-air',     // a finger on each half dragged up in the air: a front flip
 DRAG_BOTH_DOWN_AIR: 'drag-both-down-air', // a finger on each half dragged down in the air: a backflip
 TAP_PAUSE: 'tap-pause',         // a tap on the pause button (top right)
});

// Input slots a key drives (input.keys in input.js): left, right, brake, jump, look back.
export const SLOTS = Object.freeze({ LEFT: 'L', RIGHT: 'R', BRAKE: 'B', JUMP: 'J', LOOK: 'K' });

// CSS px a finger must move up to look back: further than the brake swipe, so a thumb that drifts while steering
// does not swing the camera round.
const LOOK_SWIPE_PX = SWIPE_PX * 1.5;

// CSS px each of two fingers (one per half) must move up or down in the air before a flip starts (a dead zone, as the
// brake swipe), and how far for the full rate (InputState.flip of 1 or -1). The flip follows the fingers, so holding
// them keeps rotating.
const FLIP_DEAD_PX = SWIPE_PX;
const FLIP_FULL_PX = SWIPE_PX * 3.5;

/**
 * One control. The same drag or key can mean one thing on the ground and another in the air: input.js picks by
 * context (swipe down brakes and swipe up and hold looks back on the ground; in the air, two fingers dragged down are
 * a backflip and two dragged up a front flip). device: 'touch' | 'keyboard'; action: what the rider does (the id other code uses); label: the short
 * text on the Controls screen; gesture (touch): a GESTURES id; slot (keyboard): the SLOTS entry its keys drive, or
 * null when the row is a combination of other rows; keys (keyboard): KeyboardEvent.key values; minPx (swipe): CSS px.
 */
export const BINDINGS = deepFreeze([
 { device: 'touch', action: 'steer-left', label: 'Turn left', gesture: GESTURES.HOLD_LEFT },
 { device: 'touch', action: 'steer-right', label: 'Turn right', gesture: GESTURES.HOLD_RIGHT },
 { device: 'touch', action: 'jump', label: 'Jump', gesture: GESTURES.HOLD_BOTH },
 { device: 'touch', action: 'spin-left', label: 'Spin left in the air', gesture: GESTURES.HOLD_LEFT },
 { device: 'touch', action: 'spin-right', label: 'Spin right in the air', gesture: GESTURES.HOLD_RIGHT },
 { device: 'touch', action: 'brake', label: 'Brake', gesture: GESTURES.SWIPE_DOWN, minPx: SWIPE_PX },
 { device: 'touch', action: 'look-back', label: 'Look back uphill (hold)', gesture: GESTURES.SWIPE_UP_HOLD,
  minPx: LOOK_SWIPE_PX },
 { device: 'touch', action: 'flip-front', label: 'Front flip in the air: both fingers drag up (hold to keep rotating)',
  gesture: GESTURES.DRAG_BOTH_UP_AIR, minPx: FLIP_DEAD_PX, fullPx: FLIP_FULL_PX },
 { device: 'touch', action: 'flip-back', label: 'Backflip in the air: both fingers drag down (hold to keep rotating)',
  gesture: GESTURES.DRAG_BOTH_DOWN_AIR, minPx: FLIP_DEAD_PX, fullPx: FLIP_FULL_PX },
 { device: 'touch', action: 'pause', label: 'Pause', gesture: GESTURES.TAP_PAUSE },
 { device: 'keyboard', action: 'steer-left', label: 'Turn left', slot: SLOTS.LEFT, keys: ['ArrowLeft', 'a'] },
 { device: 'keyboard', action: 'steer-right', label: 'Turn right', slot: SLOTS.RIGHT, keys: ['ArrowRight', 'd'] },
 { device: 'keyboard', action: 'brake', label: 'Brake', slot: SLOTS.BRAKE, keys: ['ArrowDown', 's'] },
 { device: 'keyboard', action: 'jump', label: 'Jump', slot: SLOTS.JUMP, keys: [' ', 'ArrowUp', 'w'] },
 { device: 'keyboard', action: 'look-back', label: 'Look back uphill (hold)', slot: SLOTS.LOOK, keys: ['b'] },
 { device: 'keyboard', action: 'spin-left', label: 'Spin left in the air', slot: null, keys: ['ArrowLeft', 'a'] },
 { device: 'keyboard', action: 'spin-right', label: 'Spin right in the air', slot: null, keys: ['ArrowRight', 'd'] },
 // Flips: slot null, as the spins: Up, W and Down, S also jump and brake on the ground, and input.js reads them as
 // flips only in the air (+1 front flip, -1 backflip).
 { device: 'keyboard', action: 'flip-front', label: 'Front flip in the air', slot: null, keys: ['ArrowUp', 'w'] },
 { device: 'keyboard', action: 'flip-back', label: 'Backflip in the air', slot: null, keys: ['ArrowDown', 's'] },
 // No slot: pause is not part of the InputState; bind-input.js hands these keys to the pause toggle (ui/pause.js).
 { device: 'keyboard', action: 'pause', label: 'Pause', keys: ['Escape', 'p'] },
]);

/** The bindings of one device ('touch' | 'keyboard'), in table order. */
export function bindingsFor(device) {
 return BINDINGS.filter((b) => b.device === device);
}

/** The binding for a device and action id; throws if there is none (a typo should not pass silently). */
export function binding(device, action) {
 const found = BINDINGS.find((b) => b.device === device && b.action === action);
 if (!found) throw new Error('bindings.js: no ' + device + ' binding for ' + action);
 return found;
}

/** KeyboardEvent.key -> slot ('L' | 'R' | 'B' | 'J') for every key that drives a slot. */
export const KEY_SLOTS = Object.freeze(Object.fromEntries(
 BINDINGS.filter((b) => b.device === 'keyboard' && b.slot)
  .flatMap((b) => b.keys.map((k) => [k, b.slot])),
));

/** CSS px a finger must move down to brake (the touch brake row). */
export const BRAKE_SWIPE_PX = binding('touch', 'brake').minPx;

/** CSS px a finger must move up, and keep down, to look back (the touch look-back row). */
export const LOOK_BACK_SWIPE_PX = binding('touch', 'look-back').minPx;

/** KeyboardEvent.key -> flip direction (+1 front flip, -1 backflip) for the keys that flip in the air. */
export const FLIP_KEYS = Object.freeze(Object.fromEntries([
 ...binding('keyboard', 'flip-front').keys.map((k) => [k, 1]),
 ...binding('keyboard', 'flip-back').keys.map((k) => [k, -1]),
]));

/** CSS px each of the two fingers must move in the air before a flip starts, and for the full rate (the touch flip rows). */
export const FLIP_DEAD_ZONE_PX = binding('touch', 'flip-front').minPx;
export const FLIP_FULL_RATE_PX = binding('touch', 'flip-front').fullPx;

/** KeyboardEvent.key values that pause or resume the run (the keyboard pause row). */
export const PAUSE_KEYS = binding('keyboard', 'pause').keys;

// Readable names for keys whose KeyboardEvent.key is not what the player sees on the keycap.
const KEY_NAMES = Object.freeze({
 ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Escape: 'Esc',
});

/** The name to show for a key: 'Space' for ' ', 'Left' for ArrowLeft, upper case for letters. */
export function keyName(key) {
 return KEY_NAMES[key] || key.toUpperCase();
}
