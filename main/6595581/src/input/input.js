// Input state from touch and keys (the controls are listed in bindings.js): hold the left or right half of the screen
// to turn (or spin in the air), both halves together jump, swipe down to brake, swipe up and hold to look back;
// arrows or A/D steer, Down or S brakes, B looks back. A touch that starts on the rider does not steer: a quick tap
// there (pointerUp returns true) changes the camera view; moving further makes it the gesture it would have been.
// In the air (setAirborne) a finger on each half dragged the same way, and Up/W, Down/S, are flips instead:
// input.flip, -1..1, + front flip; brake and look back are ground-only.
import {
 BRAKE_SWIPE_PX, LOOK_BACK_SWIPE_PX, KEY_SLOTS, FLIP_KEYS, FLIP_DEAD_ZONE_PX, FLIP_FULL_RATE_PX, RIDER_TAP_MAX_PX,
 RIDER_TAP_MAX_MS, RIDER_BOX_MIN_PX,
} from './bindings.js';

/**
 * A new InputState (core/contracts.js): left, right, brake (0 or 1, what the rider is told), jump (0 or 1, a one-shot
 * request the physics clears), both (true while both sides are held); pre-added for S1: steer (-1..1), jumpHeld,
 * jumpPressed (0 or 1, set with jump, cleared by the sim with it), flip, spin (-1..1, 0 for now). Plus the
 * bookkeeping behind them: air, pointers (Map id -> {x0, y0, y, t0, side, brake, look, rider}) and keys
 * {L, R, B, J, K, U, D} (1 while held; U and D are the flip keys).
 */
export function createInput() {
 return {
  left: 0, right: 0, brake: 0, jump: 0, both: false, steer: 0, jumpHeld: false, jumpPressed: 0, flip: 0, spin: 0,
  lookBack: 0,
  air: false, // bookkeeping: true while the rider is airborne (setAirborne)
  pointers: new Map(), keys: { L: 0, R: 0, B: 0, J: 0, K: 0, U: 0, D: 0 },
 };
}

// The flip a vertical drag of dist CSS px (positive = past the dead zone in one direction) asks for, 0..1: 0 inside the
// dead zone, then growing to 1 at FLIP_FULL_RATE_PX.
function flipAmount(dist) {
 const span = FLIP_FULL_RATE_PX - FLIP_DEAD_ZONE_PX;
 const amount = (dist - FLIP_DEAD_ZONE_PX) / span;
 return amount > 0 ? Math.min(1, amount) : 0;
}

// The two-finger flip: the furthest up drag and furthest down drag (CSS px, 0 if none) of the fingers on each half,
// then + for both halves dragged up, - for both dragged down, 0 if only one half is touched or they disagree. The
// rate comes from the smaller of the two drags, so both fingers must move. No allocation: runs on every pointer event.
function twoFingerFlip(input) {
 let upLeft = 0;
 let upRight = 0;
 let downLeft = 0;
 let downRight = 0;
 for (const p of input.pointers.values()) {
  if (p.rider) continue; // a finger on the rider is not part of a flip
  const dy = p.y - p.y0;
  if (p.side < 0) {
   if (-dy > upLeft) upLeft = -dy;
   if (dy > downLeft) downLeft = dy;
  } else {
   if (-dy > upRight) upRight = -dy;
   if (dy > downRight) downRight = dy;
  }
 }
 const up = flipAmount(Math.min(upLeft, upRight));
 const down = flipAmount(Math.min(downLeft, downRight));
 return up && down ? 0 : up - down; // extra fingers pulling both ways: no flip
}

// Asks for one jump (the sim clears input.jump when it uses it).
function requestJump(input) {
 input.jump = 1;
 input.jumpPressed = 1;
}

// The flip the held keys and fingers ask for: 0 on the ground; in the air the keys' +-1 or the two-finger drag,
// whichever is larger.
function currentFlip(input) {
 if (!input.air) return 0;
 const keys = input.keys.U - input.keys.D;
 const fingers = twoFingerFlip(input);
 return Math.abs(fingers) > Math.abs(keys) ? fingers : keys;
}

/**
 * Combines the held pointers and keys into input.left, right, brake, lookBack and flip; both sides pressed together
 * request a jump. On the ground a finger dragged down brakes and one dragged up looks back, and flip is 0; in the
 * air those drags and the Up and Down keys set flip instead, and brake and look back are off.
 */
export function applyInput(input) {
 const air = input.air;
 let l = input.keys.L;
 let r = input.keys.R;
 let b = air ? 0 : input.keys.B;
 let k = input.keys.K;
 for (const p of input.pointers.values()) {
  if (p.rider) continue; // a finger on the rider only taps (or turns into a gesture once it moves): it does not steer
  if (p.look && !air) { // a look-back finger only turns the camera: steering it too would turn the rider all the while
   k = 1;
   continue;
  }
  if (p.side < 0) l = 1;
  else r = 1;
  if (p.brake && !air) b = 1;
}
 if (l && r && !input.both && !air) requestJump(input);
 input.both = !!(l && r);
 input.flip = currentFlip(input);
 const fingerFlip = air && twoFingerFlip(input) !== 0;
 input.left = fingerFlip ? 0 : l;
 input.right = fingerFlip ? 0 : r;
 input.brake = b;
 input.steer = fingerFlip ? 0 : r - l;
 input.lookBack = k;
 input.jumpHeld = input.both || !!input.keys.J;
}

// -1 for the left half of a screen halfWidth px wide, +1 for the right
const sideOf = (px, halfWidth) => (px < halfWidth ? -1 : 1);

/**
 * Whether (px, py) CSS px is on the rider. box: the rider's drawn box {x, y, w, h} (CSS px, top left corner) or null;
 * it counts as at least RIDER_BOX_MIN_PX square around its centre. Allocates nothing.
 */
export function onRider(box, px, py) {
 if (!box) return false;
 const halfW = Math.max(box.w, RIDER_BOX_MIN_PX) / 2;
 const halfH = Math.max(box.h, RIDER_BOX_MIN_PX) / 2;
 return Math.abs(px - (box.x + box.w / 2)) <= halfW && Math.abs(py - (box.y + box.h / 2)) <= halfH;
}

/**
 * A finger down at (px, py) CSS px at time t (ms); halfWidth: px, half the canvas width. startsOnRider: the touch
 * began on the rider (onRider()): it does not steer unless it moves further than RIDER_TAP_MAX_PX.
 */
export function pointerDown(input, id, px, py, halfWidth, t = 0, startsOnRider = false) {
 input.pointers.set(id, {
  x0: px, y0: py, y: py, t0: t, side: sideOf(px, halfWidth), brake: false, look: false, rider: startsOnRider,
 });
 applyInput(input);
}

/**
 * A finger moved: it brakes once it has moved SWIPE_PX down, looks back once it has moved further up, and can slide
 * to the other half. A finger that began on the rider is still only a possible tap until it has moved
 * RIDER_TAP_MAX_PX; from then on it is the gesture it would have been. False if unknown, or if nothing changed.
 */
export function pointerMove(input, id, px, py, halfWidth) {
 const p = input.pointers.get(id);
 if (!p) return false;
 const dy = py - p.y0;
 p.y = py;
 if (p.rider) {
  if (Math.hypot(px - p.x0, dy) < RIDER_TAP_MAX_PX) return false;
  p.rider = false;
 }
 p.brake = dy > BRAKE_SWIPE_PX;
 p.look = -dy > LOOK_BACK_SWIPE_PX;
 p.side = sideOf(px, halfWidth);
 applyInput(input);
 return true;
}

/**
 * The rider took off (true) or landed (false). Every finger's drag starts again from where it is, so a swipe made on
 * the ground does not flip, and one made in the air does not brake or look back, the moment the context changes.
 */
export function setAirborne(input, isAirborne) {
 if (input.air === isAirborne) return;
 input.air = isAirborne;
 for (const p of input.pointers.values()) {
  p.y0 = p.y;
  p.brake = false;
  p.look = false;
 }
 // Only what the context changes: left, right and the one-shots may have been set by hand (the façade) and stay.
 input.flip = currentFlip(input);
 if (isAirborne) input.lookBack = input.keys.K;
 input.brake = isAirborne ? 0 : input.keys.B || input.brake;
}

/**
 * A finger lifted at time t (ms), or the touch cancelled (a cancelled touch is never a tap: do not act on the result).
 * Returns true when it was a tap on the rider: it began there, moved under RIDER_TAP_MAX_PX and lifted within
 * RIDER_TAP_MAX_MS.
 */
export function pointerUp(input, id, t = 0) {
 const p = input.pointers.get(id);
 const isTap = !!p && p.rider && t - p.t0 <= RIDER_TAP_MAX_MS;
 input.pointers.delete(id);
 applyInput(input);
 return isTap;
}

/** A key pressed (KeyboardEvent.key). Which keys do what is in bindings.js. */
export function keyDown(input, k) {
 const slot = KEY_SLOTS[k];
 if (slot === 'J' && !input.air) requestJump(input);
 if (slot) input.keys[slot] = 1;
 if (FLIP_KEYS[k]) input.keys[FLIP_KEYS[k] > 0 ? 'U' : 'D'] = 1;
 applyInput(input);
}

/** A key released. */
export function keyUp(input, k) {
 const slot = KEY_SLOTS[k];
 if (slot) input.keys[slot] = 0;
 if (FLIP_KEYS[k]) input.keys[FLIP_KEYS[k] > 0 ? 'U' : 'D'] = 0;
 applyInput(input);
}

/** Lifts every finger and key and clears the input. */
export function resetInput(input) {
 input.pointers.clear();
 input.keys.L = input.keys.R = input.keys.B = input.keys.J = input.keys.K = input.keys.U = input.keys.D = 0;
 input.left = input.right = input.brake = input.jump = 0;
 input.both = false;
 input.steer = input.flip = input.spin = input.jumpPressed = input.lookBack = 0;
 input.jumpHeld = false;
}
