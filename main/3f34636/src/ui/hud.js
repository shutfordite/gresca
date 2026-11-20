// The compact HUD: score, speed, metres to go, the trick popup and the rider's dot on the minimap.
import { FIN } from '../world/course.js';

const MS_TO_KMH = 3.6;   // km/h per m/s
const MINIMAP_W_PX = 42; // CSS px, the minimap's size (index.html #mini)
const MINIMAP_H_PX = 103;

/**
 * Writes the HUD elements of ui from the rider as drawn (pose: m), its speed (rider.vx, vy: m/s), the session's score
 * and popup, and the map bounds (m) for the minimap dot.
 */
export function updateHud(ui, pose, rider, session, bounds) {
 const sp = Math.hypot(rider.vx, rider.vy);
 ui.scoreEl.textContent = session.score;
 ui.info.textContent = Math.round(sp * MS_TO_KMH) + ' km/h · ' + Math.max(0, Math.round(FIN - pose.y)) + ' m to go';
 ui.pop.textContent = session.popup.text;
 ui.pop.style.opacity = Math.min(1, session.popup.t * 2);
 ui.dot.style.left = pose.x / bounds.maxX * MINIMAP_W_PX + 'px';
 ui.dot.style.top = pose.y / bounds.maxY * MINIMAP_H_PX + 'px';
}

/** Shows the glove hint for each side that is held (left, right: truthy when held). */
export function showGloves(ui, left, right) {
 ui.gl.classList.toggle('on', !!left);
 ui.gr.classList.toggle('on', !!right);
}
