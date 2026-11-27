// The small label that names the camera view for a moment after a switch (the fade is CSS, styles/hud.css).

/** Shows text (a camera mode's label, e.g. 'Chase cam') in the label, restarting its fade. ui: dom.js getUi(). */
export function showCameraLabel(ui, text) {
 const label = ui.camLabel;
 label.textContent = text;
 label.classList.remove('show');
 label.getBoundingClientRect(); // a layout read: lets the fade start over when the label is already on screen
 label.classList.add('show');
}
