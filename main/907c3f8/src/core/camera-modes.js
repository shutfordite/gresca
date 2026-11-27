// Looking up a camera mode (CAM_MODES) by its id; the game holds the index and saves it (app.js, gresca-cam).
import { CAM_MODES } from './config.js';

/** The index in CAM_MODES of the mode with this id (case is ignored), or -1. id: any value. */
export function cameraModeIndex(id) {
 const wanted = String(id).toUpperCase();
 return CAM_MODES.findIndex((mode) => mode.id === wanted);
}
