// The UI's façade fields (debug.js state() and set()): the trick popup.
import { nested, prop } from '../core/facade-fields.js';

/** The UI's fields: popup {text, t: s left on screen} from the HUD's state (ui/hud.js createHud()). */
export function uiFields(hud) {
 return { popup: nested('popup', { text: prop(hud.popup, 'text'), t: prop(hud.popup, 't') }) };
}
