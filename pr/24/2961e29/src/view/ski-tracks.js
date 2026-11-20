// Ski tracks: the view's track buffer is its live colour map (view.col), darkened under the rider after each sim
// step.

const AIRBORNE_Z = 0.05; // m above the snow, higher leaves no track (as sim/step.js)
const SKID_DEEP = 3;     // m/s of sideways slip, more cuts a deeper track
const DEPTH = 0.9;       // dimensionless, colour kept in a normal track
const DEPTH_DEEP = 0.8;  // the same braking or skidding

/**
 * Marks the track under the rider (RiderState) after a sim step, if it is on the snow. The track is a fixed depth
 * below the snow as built (col0), never compounded per step: a slow rider stays over one cell for many steps, which
 * turned it black. Reads the rider, writes only view.col.
 */
export function markTrack(view, rider) {
 if (rider.grind || rider.crashTimer > 0 || rider.z > AIRBORNE_Z) return;
 const col = view.col;
 const col0 = view.col0;
 const dk = (rider.isBraking || rider.skid > SKID_DEEP) ? DEPTH_DEEP : DEPTH;
 const row = view.map.width * 4; // RGBA bytes per colour map row (one cell per m)
 const o = (rider.y | 0) * row + (rider.x | 0) * 4;
 // the 2 × 2 cells from (x, y): this one, the next across, and the two below them
 darken(col, col0, o, dk);
 darken(col, col0, o + 4, dk);
 darken(col, col0, o + row, dk);
 darken(col, col0, o + row + 4, dk);
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
}
