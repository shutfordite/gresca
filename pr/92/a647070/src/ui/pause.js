// Pause: the button in the run, the pause panel (Resume, Controls, Back to menu) and the page-hidden auto-pause.
import { resetInput } from '../input/input.js';
import { showGloves } from './hud.js';
import { showControls } from './controls.js';

/** Shows the pause button only while a run is on and not paused. ui: dom.js getUi(); hud.paused: see createHud(). */
export function updatePauseButton(ui, hud, session) {
 ui.pz.hidden = hud.paused || session.phase !== 'run';
}

/**
 * Pauses (true) or resumes (false) the run: the loop stops stepping and moving the camera while hud.paused is set.
 * A pause only starts during a run. Lifts held fingers and keys so nothing is stuck on resume. Returns whether the
 * state changed.
 */
export function setPaused(ui, hud, session, input, paused) {
 if (paused === hud.paused) return false;
 if (paused && session.phase !== 'run') return false;
 hud.paused = paused;
 if (paused) {
  resetInput(input);
  showGloves(ui, 0, 0);
 }
 ui.msg.hidden = !paused;
 showControls(ui, false, paused);
 updatePauseButton(ui, hud, session);
 return true;
}

/**
 * Wires the pause button, the panel's buttons, and the page-hidden auto-pause (env.document 'visibilitychange').
 * showMenu: ends the run and shows the start screen (app.js). Returns {toggle}, which the pause keys call.
 */
export function bindPause(ui, hud, session, input, env, showMenu) {
 const set = (paused) => setPaused(ui, hud, session, input, paused);
 ui.pz.addEventListener('click', () => set(true));
 ui.pr.addEventListener('click', () => set(false));
 ui.pm.addEventListener('click', () => {
  if (!hud.paused) return;
  showControls(ui, false, false);
  showMenu();
  updatePauseButton(ui, hud, session);
 });
 env.document.addEventListener('visibilitychange', () => {
  if (env.document.hidden) set(true);
 });
 return { toggle: () => set(!hud.paused) };
}
