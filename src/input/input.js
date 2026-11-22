// Input state from touch and keys (the controls are listed in bindings.js): hold the left or right half of the screen
// to turn (or spin in the air), both halves together jump, swipe down to brake, swipe up and hold to look back;
// arrows or A/D steer, Down or S brakes, B looks back.
import { BRAKE_SWIPE_PX, LOOK_BACK_SWIPE_PX, KEY_SLOTS } from './bindings.js';

/**
 * A new InputState (core/contracts.js): left, right, brake (0 or 1, what the rider is told), jump (0 or 1, a one-shot
 * request the physics clears), both (true while both sides are held); pre-added for S1: steer (-1..1), jumpHeld,
 * jumpPressed (0 or 1, set with jump, cleared by the sim with it), flip, spin (-1..1, 0 for now). Plus the
 * bookkeeping behind them: pointers (Map id -> {y0, side, brake, look}) and keys {L, R, B, J, K} (1 while held).
 */
export function createInput() {
 return {
  left: 0, right: 0, brake: 0, jump: 0, both: false, steer: 0, jumpHeld: false, jumpPressed: 0, flip: 0, spin: 0,
  lookBack: 0,
  pointers: new Map(), keys: { L: 0, R: 0, B: 0, J: 0, K: 0 },
 };
}

// Asks for one jump (the sim clears input.jump when it uses it).
function requestJump(input) {
 input.jump = 1;
 input.jumpPressed = 1;
}

/** Combines the held pointers and keys into input.left, right and brake; both sides pressed together request a jump. */
export function applyInput(input) {
 let l = input.keys.L;
 let r = input.keys.R;
 let b = input.keys.B;
 let k = input.keys.K;
 for (const p of input.pointers.values()) {
  if (p.look) { // a look-back finger only turns the camera: steering it too would turn the rider all the while
   k = 1;
   continue;
  }
  if (p.side < 0) l = 1;
  else r = 1;
  if (p.brake) b = 1;
 }
 if (l && r && !input.both) requestJump(input);
 input.both = !!(l && r);
 input.left = l;
 input.right = r;
 input.brake = b;
 input.steer = r - l;
 input.lookBack = k;
 input.jumpHeld = input.both || !!input.keys.J;
}

// -1 for the left half of a screen halfWidth px wide, +1 for the right
const sideOf = (px, halfWidth) => (px < halfWidth ? -1 : 1);

/** A finger down at (px, py) CSS px; halfWidth: px, half the canvas width. */
export function pointerDown(input, id, px, py, halfWidth) {
 input.pointers.set(id, { y0: py, side: sideOf(px, halfWidth), brake: false, look: false });
 applyInput(input);
}

/**
 * A finger moved: it brakes once it has moved SWIPE_PX down, looks back once it has moved further up, and can slide
 * to the other half. False if unknown.
 */
export function pointerMove(input, id, px, py, halfWidth) {
 const p = input.pointers.get(id);
 if (!p) return false;
 const dy = py - p.y0;
 p.brake = dy > BRAKE_SWIPE_PX;
 p.look = -dy > LOOK_BACK_SWIPE_PX;
 p.side = sideOf(px, halfWidth);
 applyInput(input);
 return true;
}

/** A finger lifted (or the touch cancelled). */
export function pointerUp(input, id) {
 input.pointers.delete(id);
 applyInput(input);
}

/** A key pressed (KeyboardEvent.key). Which keys do what is in bindings.js. */
export function keyDown(input, k) {
 const slot = KEY_SLOTS[k];
 if (slot === 'J') requestJump(input);
 if (slot) input.keys[slot] = 1;
 applyInput(input);
}

/** A key released. */
export function keyUp(input, k) {
 const slot = KEY_SLOTS[k];
 if (slot) input.keys[slot] = 0;
 applyInput(input);
}

/** Lifts every finger and key and clears the input. */
export function resetInput(input) {
 input.pointers.clear();
 input.keys.L = input.keys.R = input.keys.B = input.keys.J = input.keys.K = 0;
 input.left = input.right = input.brake = input.jump = 0;
 input.both = false;
 input.steer = input.flip = input.spin = input.jumpPressed = input.lookBack = 0;
 input.jumpHeld = false;
}
