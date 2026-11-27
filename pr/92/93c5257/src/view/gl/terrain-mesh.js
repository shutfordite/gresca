// The GL terrain's mesh: nested square grids (clipmap levels) on the map's grid, centred on the camera, 1 m to 8 m.
// Level 0 is a full grid of 1 m cells; each further level doubles the spacing and leaves a hole where the finer level
// is. All levels share one centre, snapped to the coarsest spacing, so every vertex sits on a whole height texel and
// stays on it as the camera moves (no swimming), and each level's outer edge meets the next level's hole exactly. The
// odd vertices on a level's outer edge take the mean of their two neighbours (morph), so the edge is the coarser
// level's straight line: no cracks.

/**
 * The layout: levels (count), cells (per side of a level), spacing of level 0 (m), snapM (m, the centre's snap).
 * Level L covers ±cells / 2 × 2^L m: 64, 128, 256 and 512 m, past the far end of the render (about 440 m).
 * Vertices: 4 × 129² = 66 564 (12 bytes each, 0.8 MB); triangles: 32 768 + 3 × 24 576 = 106 496 (indices 1.3 MB).
 */
export const CLIPMAP = Object.freeze({ levels: 4, cells: 128, spacingM: 1, snapM: 8 });

/** Morph codes in a vertex's third component: 0 none, 1 mean of the neighbours along i, 2 along j. */
export const MORPH = Object.freeze({ NONE: 0, ALONG_I: 1, ALONG_J: 2 });

/** The spacing (m) of level L. */
export const levelSpacing = (level) => CLIPMAP.spacingM * 2 ** level;

/** True if cell (i, j) of a level with n cells per side is in the hole the finer level fills. */
export const inHole = (i, j, n) => i >= n / 4 && i < 3 * n / 4 && j >= n / 4 && j < 3 * n / 4;

// Which morph a vertex (i, j) on an n-cell grid gets: odd vertices on the outer edge follow the edge's coarse line.
function morphOf(i, j, n) {
 if ((j === 0 || j === n) && i % 2 === 1) return MORPH.ALONG_I;
 if ((i === 0 || i === n) && j % 2 === 1) return MORPH.ALONG_J;
 return MORPH.NONE;
}

/**
 * One level's grid, n cells per side: positions (Float32Array, (i, j, morph) per vertex, (n + 1)² vertices, i
 * fastest) and index (Uint32Array, two triangles per cell, none in the hole when hasHole). Allocates (once, at boot).
 */
export function levelGrid(n, hasHole) {
 const side = n + 1;
 const positions = new Float32Array(side * side * 3);
 for (let j = 0; j <= n; j++) {
  for (let i = 0; i <= n; i++) {
   const o = (j * side + i) * 3;
   positions[o] = i;
   positions[o + 1] = j;
   positions[o + 2] = morphOf(i, j, n);
  }
 }
 const cells = hasHole ? n * n - (n / 2) * (n / 2) : n * n;
 const index = new Uint32Array(cells * 6);
 let k = 0;
 for (let j = 0; j < n; j++) {
  for (let i = 0; i < n; i++) {
   if (hasHole && inHole(i, j, n)) continue;
   const a = j * side + i;
   const b = a + 1;
   const c = a + side;
   const d = c + 1;
   index.set([a, c, b, b, c, d], k);
   k += 6;
  }
 }
 return { positions, index };
}

/**
 * The grid position (u, v m) of vertex (0, 0) of level L for a camera at grid (u, v): the shared centre is the
 * camera's position snapped to CLIPMAP.snapM. Writes out.u, out.v and returns out.
 */
export function levelOrigin(level, camU, camV, out) {
 const snap = CLIPMAP.snapM;
 const half = CLIPMAP.cells / 2 * levelSpacing(level);
 out.u = Math.round(camU / snap) * snap - half;
 out.v = Math.round(camV / snap) * snap - half;
 return out;
}
