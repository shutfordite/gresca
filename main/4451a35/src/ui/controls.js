// The Controls screen: Touch and Keyboard sections generated from the bindings table (input/bindings.js), with a small
// diagram for each gesture, and the menu's Controls and Back buttons.
import { BINDINGS, GESTURES, keyName } from '../input/bindings.js';

// How each gesture reads in words. Every GESTURES id needs an entry: controlsHtml throws on a missing one.
const GESTURE_TEXT = Object.freeze({
 [GESTURES.HOLD_LEFT]: 'Hold the left half of the screen',
 [GESTURES.HOLD_RIGHT]: 'Hold the right half of the screen',
 [GESTURES.HOLD_BOTH]: 'Hold both halves together',
 [GESTURES.SWIPE_DOWN]: 'Swipe down',
 [GESTURES.SWIPE_UP_HOLD]: 'Swipe up and keep your finger down',
});

// Gesture diagrams: a screen outline (48 x 64) with the touched area filled. Colours come from CSS classes (var(--…)).
const SCREEN = '<rect class="ctl-screen" x="4" y="4" width="40" height="56" rx="5"/>';
const LEFT_HALF = '<rect class="ctl-hit" x="6" y="6" width="18" height="52" rx="3"/>';
const RIGHT_HALF = '<rect class="ctl-hit" x="24" y="6" width="18" height="52" rx="3"/>';
const SWIPE = '<circle class="ctl-hit" cx="24" cy="18" r="6"/>' +
 '<path class="ctl-arrow" d="M24 26v22M17 41l7 8 7-8"/>';
const SWIPE_UP = '<circle class="ctl-hit" cx="24" cy="46" r="6"/>' +
 '<path class="ctl-arrow" d="M24 38V16M17 23l7-8 7 8"/>';
const DIAGRAMS = Object.freeze({
 [GESTURES.HOLD_LEFT]: SCREEN + LEFT_HALF,
 [GESTURES.HOLD_RIGHT]: SCREEN + RIGHT_HALF,
 [GESTURES.HOLD_BOTH]: SCREEN + LEFT_HALF + RIGHT_HALF,
 [GESTURES.SWIPE_DOWN]: SCREEN + SWIPE,
 [GESTURES.SWIPE_UP_HOLD]: SCREEN + SWIPE_UP,
});

const ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });

// Text made safe to put in HTML (the table is our own constants, but the screen never trusts what it prints).
function escapeHtml(text) {
 return String(text).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// The diagram and words for a touch row.
function touchHow(row) {
 const text = GESTURE_TEXT[row.gesture];
 const drawing = DIAGRAMS[row.gesture];
 if (!text || !drawing) throw new Error('controls.js: no diagram or text for gesture ' + row.gesture);
 return '<svg class="ctl-fig" viewBox="0 0 48 64" aria-hidden="true">' + drawing + '</svg>' +
  '<span class="ctl-how">' + escapeHtml(text) + '</span>';
}

// The keycaps for a keyboard row.
function keyboardHow(row) {
 const caps = row.keys.map((k) => '<kbd>' + escapeHtml(keyName(k)) + '</kbd>').join(' ');
 return '<span class="ctl-keys">' + caps + '</span>';
}

// The rows of one device, in table order.
function bindingsOf(bindings, device) {
 return bindings.filter((b) => b.device === device);
}

// One list item per binding; data-device and data-action let tests (and styles) find it.
function rowHtml(row) {
 const how = row.device === 'touch' ? touchHow(row) : keyboardHow(row);
 return '<li class="ctl-row" data-device="' + escapeHtml(row.device) + '" data-action="' + escapeHtml(row.action) +
  '"><span class="ctl-label">' + escapeHtml(row.label) + '</span>' + how + '</li>';
}

/** The Controls screen's inner HTML, made from the bindings table: a Touch and a Keyboard section. */
export function controlsHtml(bindings = BINDINGS) {
 const section = (device, title) => '<section><h2>' + title + '</h2><ul class="ctl-list">' +
  bindingsOf(bindings, device).map(rowHtml).join('') + '</ul></section>';
 return '<h1>Controls</h1>' + section('touch', 'Touch') + section('keyboard', 'Keyboard');
}

/**
 * Opens (true) or closes (false) the Controls screen in place of its home panel: the pause panel while paused, the
 * menu otherwise; closing shows that home panel again. ui: dom.js getUi().
 */
export function showControls(ui, open, paused = false) {
 ui.ctl.hidden = !open;
 ui.menuMain.hidden = paused || open;
 ui.pausep.hidden = !paused || open;
}

/**
 * Fills the Controls screen from the table and wires the Controls buttons (menu, pause panel) and Back.
 * hud.paused says which panel is home.
 */
export function bindControls(ui, hud) {
 ui.ctlBody.innerHTML = controlsHtml();
 for (const button of [ui.cb, ui.pc]) button.addEventListener('click', () => showControls(ui, true, hud.paused));
 ui.cc.addEventListener('click', () => showControls(ui, false, hud.paused));
}
