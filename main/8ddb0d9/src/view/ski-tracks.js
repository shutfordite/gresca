// Ski tracks: after each sim step the colour map (view.col, the CPU raycaster's tracks) is darkened under the rider
// and the equipment's trail (view.trail, the GPU ribbon's) is extended.
import { recordTrail, clearTrail } from './track-trail.js';

const AIRBORNE_Z = 0.05; // m above the snow, higher leaves no track (as sim/step.js)
const SKID_DEEP = 3;     // m/s of sideways slip, more cuts a deeper track
const DEPTH = 0.9;       // dimensionless, colour kept in a normal track
const DEPTH_DEEP = 0.8;  // the same braking or skidding

/**
 * Marks the track under the rider (RiderState) after a sim step, if it is on the snow. The track is a fixed depth
 * below the snow as built (col0), never compounded per step: a slow rider stays over one cell for many steps, which
 * turned it black. Also extends view.trail for rig ('board' | 'ski'). Reads the rider, writes only view.col and the
 * changed rows, view.trackRows, and view.trail.
 */
export function markTrack(view, rider, rig) {
 recordTrail(view.trail, rider, rig);
 if (rider.grind || rider.crashTimer > 0 || rider.z > AIRBORNE_Z) return;
 const col = view.col;
 const col0 = view.col0;
 const dk = (rider.isBraking || rider.skid > SKID_DEEP) ? DEPTH_DEEP : DEPTH;
 const row = view.map.width * 4; // RGBA bytes per colour map row (one cell per m)
 const at = view.mapFrame.toGrid(rider.x, rider.y, view.texel); // the rider in colour map texels
 const o = (at.v | 0) * row + (at.u | 0) * 4;
 // the 2 × 2 texels from (u, v): this one, the next across, and the two below them
 darken(col, col0, o, dk);
 darken(col, col0, o + 4, dk);
 darken(col, col0, o + row, dk);
 darken(col, col0, o + row + 4, dk);
 const rows = view.trackRows; // for the GPU terrain, which uploads only the rows that changed
 rows.v0 = rows.v1 < rows.v0 ? at.v | 0 : Math.min(rows.v0, at.v | 0);
 rows.v1 = Math.max(rows.v1, (at.v | 0) + 1);
}

// One cell at byte offset i, at least dk (red; green and blue a little lighter) of its built colour.
function darken(col, col0, i, dk) {
 col[i] = Math.min(col[i], col0[i] * dk);
 col[i + 1] = Math.min(col[i + 1], col0[i + 1] * (dk + 0.02));
 col[i + 2] = Math.min(col[i + 2], col0[i + 2] * Math.min(1, dk + 0.07));
}

/** Wipes every track (a new run). */
export function clearTracks(view) {
 view.col.set(view.col0);
 view.trackRows.v0 = 0;
 view.trackRows.v1 = view.map.height - 1;
 clearTrail(view.trail);
}
