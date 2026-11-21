// The menu: the Snowboard / Skis picker with its gresca-rig storage key, the stance key, the menu texts and the
// finish screen (a SimEvent subscriber).
import { on } from '../core/events.js';

const RIG_KEY = 'gresca-rig';
const OLD_RIG_KEY = 'gv-rig'; // before the rename; still read

/** The start screen's instructions. */
export const MENU_TEXT = 'Ride from the Encampadors ridge down to Pas de la Casa. Hold the left or right side of the ' +
 'screen to turn. Press both sides together to jump, then tap left or right in the air to spin. Swipe down to brake. ' +
 'Avoid the trees.';

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
 try {
  env.localStorage.setItem(RIG_KEY, r);
 } catch (_) {
  // storage blocked (private browsing): the choice lasts this visit only
 }
}

/** Wires the picker's buttons, then restores the rig saved last visit (the new key wins over the old one). */
export function bindMenu(ui, session, env) {
 ui.pb.addEventListener('click', () => setRig(ui, session, env, 'board'));
 ui.ps.addEventListener('click', () => setRig(ui, session, env, 'ski'));
 try {
  const s = env.localStorage.getItem(RIG_KEY) || env.localStorage.getItem(OLD_RIG_KEY);
  if (s === 'ski' || s === 'board') setRig(ui, session, env, s);
 } catch (_) {
  // storage blocked: keep the default rig
 }
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
