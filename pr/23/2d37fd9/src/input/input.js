// Input state from touch and keys: hold the left or right half of the screen to turn (or spin in the air), both halves
// together jump, swipe down to brake; arrows or A/D steer, Down or S brakes, Space, Up or W jumps.
import { SWIPE_PX } from '../core/config.js';

/**
 * A new input state: left, right, brake (0 or 1, what the rider is told), jump (0 or 1, a one-shot request the
 * physics clears), both (true while both sides are held), pointers (Map id -> {y0, side, brake}) and keys {L, R, B}.
 */
export function createInput() {
 return { left: 0, right: 0, brake: 0, jump: 0, both: false, pointers: new Map(), keys: { L: 0, R: 0, B: 0 } };
}

/** Combines the held pointers and keys into input.left, right and brake; both sides pressed together request a jump. */
export function applyInput(input) {
 let l = input.keys.L;
 let r = input.keys.R;
 let b = input.keys.B;
 for (const p of input.pointers.values()) {
  if (p.side < 0) l = 1;
  else r = 1;
  if (p.brake) b = 1;
 }
 if (l && r && !input.both) input.jump = 1;
 input.both = !!(l && r);
 input.left = l;
 input.right = r;
 input.brake = b;
}

// -1 for the left half of a screen halfWidth px wide, +1 for the right
const sideOf = (px, halfWidth) => (px < halfWidth ? -1 : 1);

/** A finger down at (px, py) CSS px; halfWidth: px, half the canvas width. */
export function pointerDown(input, id, px, py, halfWidth) {
 input.pointers.set(id, { y0: py, side: sideOf(px, halfWidth), brake: false });
 applyInput(input);
}

/** A finger moved: it brakes once it has moved SWIPE_PX down, and can slide to the other half. False if unknown. */
export function pointerMove(input, id, px, py, halfWidth) {
 const p = input.pointers.get(id);
 if (!p) return false;
 const dy = py - p.y0;
 p.brake = dy > SWIPE_PX;
 p.side = sideOf(px, halfWidth);
 applyInput(input);
 return true;
}

/** A finger lifted (or the touch cancelled). */
export function pointerUp(input, id) {
 input.pointers.delete(id);
 applyInput(input);
}

/** A key pressed (KeyboardEvent.key). */
export function keyDown(input, k) {
 if (k == 'ArrowLeft' || k == 'a') input.keys.L = 1;
 if (k == 'ArrowRight' || k == 'd') input.keys.R = 1;
 if (k == 'ArrowDown' || k == 's') input.keys.B = 1;
 if (k == ' ' || k == 'ArrowUp' || k == 'w') input.jump = 1;
 applyInput(input);
}

/** A key released. */
export function keyUp(input, k) {
 if (k == 'ArrowLeft' || k == 'a') input.keys.L = 0;
 if (k == 'ArrowRight' || k == 'd') input.keys.R = 0;
 if (k == 'ArrowDown' || k == 's') input.keys.B = 0;
 applyInput(input);
}

/** Lifts every finger and key and clears the input. */
export function resetInput(input) {
 input.pointers.clear();
 input.keys.L = input.keys.R = input.keys.B = 0;
 input.left = input.right = input.brake = input.jump = 0;
 input.both = false;
}
