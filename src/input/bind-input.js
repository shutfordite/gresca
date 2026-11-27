// Connects the page's pointer and key events to the input state (input.js), and the glove hints to it.
import { PAUSE_KEYS, CAMERA_KEYS } from './bindings.js';
import { pointerDown, pointerMove, pointerUp, keyDown, keyUp, onRider } from './input.js';

// Without a camera to switch: no rider box, nothing to call.
const NO_CAMERA = Object.freeze({ riderBox: () => null, onCamera: () => {} });

/**
 * Listens on canvas (pointers) and target (keys: the window). After each event, onChange(input) runs (the glove
 * hints). onPause() runs on the pause keys (a press, not a key repeat). camera: {riderBox () -> {x, y, w, h} (the
 * rider's drawn box, CSS px, or null), onCamera ()}: a tap on the rider and the camera key (a press, not a repeat) call
 * onCamera(). Pointer positions are CSS px and event times ms; the canvas's current width decides which half a finger
 * is on.
 */
export function bindInput(canvas, target, input, onChange, onPause = () => {}, camera = NO_CAMERA) {
 const half = () => canvas.clientWidth / 2;
 canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try {
   canvas.setPointerCapture(e.pointerId);
  } catch (_) {
   // capture can fail for a pointer that is already gone: the touch still counts
  }
  const startsOnRider = onRider(camera.riderBox(), e.clientX, e.clientY);
  pointerDown(input, e.pointerId, e.clientX, e.clientY, half(), e.timeStamp, startsOnRider);
  onChange(input);
 });
 canvas.addEventListener('pointermove', (e) => {
  if (pointerMove(input, e.pointerId, e.clientX, e.clientY, half())) onChange(input);
 });
 for (const n of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(n, (e) => {
   const tapped = pointerUp(input, e.pointerId, e.timeStamp);
   onChange(input);
   if (tapped && n === 'pointerup') camera.onCamera();
  });
 }
 target.addEventListener('keydown', (e) => {
  if (PAUSE_KEYS.includes(e.key) || PAUSE_KEYS.includes(String(e.key).toLowerCase())) {
   if (!e.repeat) onPause();
   return;
  }
  if (CAMERA_KEYS.includes(e.key) || CAMERA_KEYS.includes(String(e.key).toLowerCase())) {
   if (!e.repeat) camera.onCamera();
   return;
  }
  keyDown(input, e.key);
  onChange(input);
 });
 target.addEventListener('keyup', (e) => {
  keyUp(input, e.key);
  onChange(input);
 });
}
