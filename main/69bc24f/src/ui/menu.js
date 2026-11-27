// The menu: the Snowboard / Skis picker (gresca-rig), the Regular / Goofy picker (gresca-stance), the menu texts and
// the finish screen (a SimEvent subscriber).
import { on } from '../core/events.js';
import { bindControls } from './controls.js';

const RIG_KEY = 'gresca-rig';
const OLD_RIG_KEY = 'gv-rig'; // before the rename; still read

/** The start screen's text: where the run goes, and a pointer to the Controls screen. */
export const MENU_TEXT = 'Ride from the Encampadors ridge down to Pas de la Casa. Avoid the trees. Tap Controls to see ' +
 'how to turn, jump, spin and brake.';

/**
 * Picks the rig ('board' | 'ski'): writes session.rig, shows it on the buttons and remembers it in storage where the
 * browser allows it. env: anything with a localStorage property (read at each call: touching it can throw).
 */
export function setRig(ui, session, env, r) {
 session.rig = r;
 ui.pb.classList.toggle('on', r === 'board');
 ui.ps.classList.toggle('on', r === 'ski');
 ui.pb.setAttribute('aria-pressed', r === 'board');
 ui.ps.setAttribute('aria-pressed', r === 'ski');
 ui.stance.hidden = r !== 'board'; // the stance only matters on a snowboard
 try {
  env.localStorage.setItem(RIG_KEY, r);
 } catch (_) {
  // storage blocked (private browsing): the choice lasts this visit only
 }
}

/**
 * Picks the snowboard stance ('regular' | 'goofy'): writes session.stance, shows it on the buttons and saves it under
 * storageKey where the browser allows it. env: anything with a localStorage property (read at each call).
 */
export function setStance(ui, session, env, storageKey, stance) {
 session.stance = stance;
 showStance(ui, stance);
 try {
  env.localStorage.setItem(storageKey, stance);
 } catch (_) {
  // storage blocked (private browsing): the choice lasts this visit only
 }
}

/**
 * Wires the picker's buttons and the Controls screen, then restores the rig saved last visit (the new key wins over
 * the old one) and shows session.stance (already loaded by loadStance) on the stance buttons. stanceKey: the Look's
 * rider.stanceStorageKey.
 */
export function bindMenu(ui, session, env, hud, stanceKey) {
 ui.pb.addEventListener('click', () => setRig(ui, session, env, 'board'));
 ui.ps.addEventListener('click', () => setRig(ui, session, env, 'ski'));
 ui.sr.addEventListener('click', () => setStance(ui, session, env, stanceKey, 'regular'));
 ui.sg.addEventListener('click', () => setStance(ui, session, env, stanceKey, 'goofy'));
 showStance(ui, session.stance);
 bindControls(ui, hud);
 try {
  const s = env.localStorage.getItem(RIG_KEY) || env.localStorage.getItem(OLD_RIG_KEY);
  if (s === 'ski' || s === 'board') setRig(ui, session, env, s);
 } catch (_) {
  // storage blocked: keep the default rig
 }
}

// Marks the stance buttons for stance without saving anything (the saved stance was just read).
function showStance(ui, stance) {
 ui.sr.classList.toggle('on', stance === 'regular');
 ui.sg.classList.toggle('on', stance === 'goofy');
 ui.sr.setAttribute('aria-pressed', stance === 'regular');
 ui.sg.setAttribute('aria-pressed', stance === 'goofy');
}

/**
 * Reads the snowboard stance from storage under storageKey (the Look's rider.stanceStorageKey, 'gresca-stance'):
 * writes session.stance 'goofy' if saved so.
 */
export function loadStance(session, env, storageKey) {
 try {
  if (env.localStorage.getItem(storageKey) === 'goofy') session.stance = 'goofy';
 } catch (_) {
  // storage blocked: regular stance
 }
}

/** The finish screen's text for a finish SimEvent {time s, score, crashes}. */
export function finishText(event) {
 const crashes = event.crashes;
 return 'Finished in ' + event.time.toFixed(1) + ' s with ' + event.score + ' points and ' + crashes + ' crash' +
  (crashes == 1 ? '' : 'es') + '.';
}

/** Subscribes the finish screen to the bus: the result and a Ride again button when the rider crosses the line. */
export function subscribeFinish(bus, ui) {
 on(bus, 'finish', (e) => {
  ui.msg.hidden = false;
  ui.msgT.textContent = finishText(e);
  ui.go.textContent = 'Ride again';
  ui.go.hidden = false;
 });
}
