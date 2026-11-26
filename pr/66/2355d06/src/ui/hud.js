// The compact HUD: score, speed, metres to go, the trick popup (a SimEvent subscriber) and the minimap dot.
import { on, onStep } from '../core/events.js';

const MS_TO_KMH = 3.6;   // km/h per m/s
const MINIMAP_W_PX = 42; // CSS px, the minimap's size (index.html #mini)
const MINIMAP_H_PX = 103;
const POPUP_TIME = 1.6;  // s of sim time a trick popup stays on screen

/**
 * The HUD's own state: paused (true while the pause panel is up), popup {text, t: s left on screen}, where (scratch:
 * the drawn rider on the course).
 */
export function createHud() {
 return { paused: false, popup: { text: '', t: 0 }, where: { s: 0, d: 0, tx: 0, ty: 1 } };
}

/** The popup text for a score SimEvent: '+82p 180 Air', '+24p Rail', '+10p Box'. */
export function popupText(event) {
 const what = event.kind === 'air' ? (event.degrees ? event.degrees + ' ' : '') + 'Air'
  : (event.kind === 'box' ? 'Box' : 'Rail');
 return '+' + event.points + 'p ' + what;
}

/** Subscribes the popup to the bus: each score shows for POPUP_TIME s of sim time, counted down after every step. */
export function subscribeHud(bus, hud) {
 on(bus, 'score', (e) => {
  hud.popup.text = popupText(e);
  hud.popup.t = POPUP_TIME;
 });
 onStep(bus, (dt) => {
  hud.popup.t = Math.max(0, hud.popup.t - dt);
 });
}

/**
 * Writes the HUD elements of ui from the rider as drawn (pose: world m), its speed (rider.vx, vy: m/s), the session's
 * score, the popup (hud), the map's rectangle (bounds: terrain.bounds, m) for the minimap dot and the course (metres
 * to go: finishS - s). The minimap is a picture of the map's grid: the dot goes where the pose is across (a) and down
 * (b) that rectangle.
 */
export function updateHud(ui, hud, pose, rider, session, bounds, course) {
 const sp = Math.hypot(rider.vx, rider.vy);
 const toGo = course.finishS - course.project(pose.x, pose.y, hud.where).s;
 ui.scoreEl.textContent = session.score;
 ui.info.textContent = Math.round(sp * MS_TO_KMH) + ' km/h · ' + Math.max(0, Math.round(toGo)) + ' m to go';
 ui.pop.textContent = hud.popup.text;
 ui.pop.style.opacity = Math.min(1, hud.popup.t * 2);
 const ex = pose.x - bounds.x0;
 const ey = pose.y - bounds.y0;
 const a = ex * bounds.ax + ey * bounds.ay; // m across the map
 const b = ex * bounds.bx + ey * bounds.by; // m down the map
 ui.dot.style.left = a / bounds.width * MINIMAP_W_PX + 'px';
 ui.dot.style.top = b / bounds.length * MINIMAP_H_PX + 'px';
}

/** Shows the glove hint for each side that is held (left, right: truthy when held). */
export function showGloves(ui, left, right) {
 ui.gl.classList.toggle('on', !!left);
 ui.gr.classList.toggle('on', !!right);
}
