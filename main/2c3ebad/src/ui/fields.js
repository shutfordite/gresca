// The UI's façade fields (debug.js state() and set()): the trick popup and paused.
import { field, nested, prop } from '../core/facade-fields.js';

/**
 * The UI's fields, from the HUD's state (ui/hud.js createHud()): paused (true while the run is paused, read only) and
 * popup {text, t: s left on screen}.
 */
export function uiFields(hud) {
 return {
  paused: field(() => hud.paused),
  popup: nested('popup', { text: prop(hud.popup, 'text'), t: prop(hud.popup, 't') }),
 };
}
