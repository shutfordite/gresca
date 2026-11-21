// Connects the page's pointer and key events to the input state (input.js), and the glove hints to it.
import { pointerDown, pointerMove, pointerUp, keyDown, keyUp } from './input.js';

/**
 * Listens on canvas (pointers) and target (keys: the window). After each event, onChange(input) runs (the glove
 * hints). Pointer positions are CSS px; the canvas's current width decides which half a finger is on.
 */
export function bindInput(canvas, target, input, onChange) {
 const half = () => canvas.clientWidth / 2;
 canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try {
   canvas.setPointerCapture(e.pointerId);
  } catch (_) {
   // capture can fail for a pointer that is already gone: the touch still counts
  }
  pointerDown(input, e.pointerId, e.clientX, e.clientY, half());
  onChange(input);
 });
 canvas.addEventListener('pointermove', (e) => {
  if (pointerMove(input, e.pointerId, e.clientX, e.clientY, half())) onChange(input);
 });
 for (const n of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(n, (e) => {
   pointerUp(input, e.pointerId);
   onChange(input);
  });
 }
 target.addEventListener('keydown', (e) => {
  keyDown(input, e.key);
  onChange(input);
 });
 target.addEventListener('keyup', (e) => {
  keyUp(input, e.key);
  onChange(input);
 });
}
