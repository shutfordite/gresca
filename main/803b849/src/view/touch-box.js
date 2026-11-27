// Where the rider is on the screen, as a box in CSS px: what a finger has to touch to tap the rider (input/input.js).
import { RIDER_SCALE } from '../core/config.js';

const RIDER_HEIGHT_M = 1.9;    // m, boots to the top of the head, in the rider's own units (scaled by px per m)
const RIDER_WIDTH_M = 0.9;     // m, shoulder to shoulder with a little for the arms and the board's tip
const HEAD_ROOM = 1;           // dimensionless, the box reaches the head and no further

/**
 * The rider's drawn box in CSS px {x, y (top left), w, h}, from the camera as the last frame drew it (the rider is at
 * the bottom centre of the screen, its boots on the snow line, size from the camera's distance; see draw.js
 * drawRiderOnSnow).
 * Writes into out and returns it, so a touch allocates nothing. A tiny box is padded by input/input.js onRider().
 */
export function riderScreenBox(view, camera, out) {
 const kx = camera.pixelScale;
 const toCss = view.cssW / view.W; // CSS px per canvas px
 const metrePx = camera.focalPx / camera.back * kx * RIDER_SCALE; // canvas px per rider metre
 const feetY = ((camera.height - view.groundM) / camera.back * camera.focalPx + camera.horizonPx - camera.pitchPx) * kx;
 out.w = RIDER_WIDTH_M * metrePx * toCss;
 out.h = RIDER_HEIGHT_M * HEAD_ROOM * metrePx * toCss;
 out.x = view.cssW / 2 - out.w / 2;
 out.y = feetY * toCss - out.h;
 return out;
}
