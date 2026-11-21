// The colour map the raycaster reads (D2 replaces it with per-pixel shading): snow, rock, lift, trees, park, village.
import { W0, H0, FIN, KICK, KBIG, RAILS, cx } from '../world/course.js';
import { hash } from '../world/noise.js';

const MINIMAP_W = 42;  // px, the minimap canvas (index.html #mc)
const MINIMAP_H = 103;
const CORDUROY_RAD_PER_M = 2.1; // rad per m across the piste, the corduroy stripes' wave
const RELIEF_RADIUS_M = 4;      // m, how far around a texel the relief (hollow or ridge) is measured
const RELIEF_FULL_M = 1;        // m below its surroundings that counts as a full hollow (above: a full ridge)
const DRIFT_CELL_M = 8;         // m, the size of the soft wind-blown drifts in the snow's grain
const DRIFT_SHARE = 0.6;        // 0..1, how much of the grain is drifts (the rest is per-texel speckle)

/**
 * Paints the colour map of the built world into view.map (one px per m of the map's grid), keeps its pixels as
 * view.col (live, ski tracks go here) and view.col0 (as built) and the frame that places it in the world as
 * view.mapFrame, and draws the minimap from it. look: the Look (view/look/look.js), for every colour.
 */
export function buildColourMap(view, world, minimap, look) {
 view.mapFrame = world.frame;
 paintColourMap(view.mx, world, look);
 view.col = view.mx.getImageData(0, 0, W0, H0).data;
 view.col0 = view.col.slice();
 minimap.getContext('2d').drawImage(view.map, 0, 0, W0, H0, 0, 0, MINIMAP_W, MINIMAP_H);
}

/**
 * Paints the built world (world/build.js) into mx, the 2D context of a W0 × H0 canvas, one pixel per map metre:
 * lavender shadows, warm lit snow, grey rock, corduroy on the groomed piste, then the lift line, the trees and their
 * shadows, the kickers, the rails, the village and the finish. Reads world.H, world.M, world.treeArr and world.frame.
 */
function paintColourMap(mx, world, look) {
 const colour = look.colour;
 paintSnow(mx, world.H, world.M, look.terrainTone);
 paintLift(mx, colour);
 paintTrees(mx, world.treeArr, world.frame, colour);
 paintPark(mx, colour);
 paintVillage(mx, colour);
}

// Colour map: lavender shadows, warm lit snow, grey rock, fine corduroy stripes on the groomed piste, bluer hollows,
// brighter ridges and a wind-blown grain. tone: the Look's terrainTone.
function paintSnow(mx, H, M, tone) {
 const img = mx.createImageData(W0, H0);
 const D = img.data;
 const rgb = [0, 0, 0];
 const drift = driftLattice();
 const R = RELIEF_RADIUS_M;
 for (let y = 0; y < H0; y++) {
  const c = cx(y);
  const yUp = Math.max(0, y - R) * W0;
  const yDown = Math.min(H0 - 1, y + R) * W0;
  for (let x = 0; x < W0; x++) {
   const i = y * W0 + x;
   const row = y * W0;
   const around = (H[row + Math.max(0, x - R)] + H[row + Math.min(W0 - 1, x + R)] + H[yUp + x] + H[yDown + x]) / 4;
   const cavity = Math.max(-1, Math.min(1, (around - H[i]) / RELIEF_FULL_M));
   const grain = DRIFT_SHARE * driftAt(drift, x, y) + (1 - DRIFT_SHARE) * speckle(x, y);
   let gx = 0;
   let gy = 0;
   if (x > 0 && x < W0 - 1 && y > 0 && y < H0 - 1) {
    gx = (H[i + 1] - H[i - 1]) / 2;
    gy = (H[i + W0] - H[i - W0]) / 2;
   }
   const sl = Math.hypot(gx, gy);
   const sh = Math.max(0.55, Math.min(1.12, 0.86 - (gx + gy) * 0.22));
   const lit = Math.max(0, Math.min(1, (sh - 0.55) / 0.5));
   const m = M[i] / 255;
   const rk = Math.max(0, Math.min(1, (sl - 0.5) * 4)) * (1 - m);
   const wave = m > 0 ? Math.sin((x - c) * CORDUROY_RAD_PER_M) : 0;
   tone(lit, m, wave, rk, rgb, cavity, grain);
   const o = i * 4;
   D[o] = rgb[0];
   D[o + 1] = rgb[1];
   D[o + 2] = rgb[2];
   D[o + 3] = 255;
  }
 }
 mx.putImageData(img, 0, 0);
}

// The drifts' lattice: one value -1..1 every DRIFT_CELL_M m of the grid, read smoothly by driftAt(). Built once per
// map (about 40 000 values, 160 KB, dropped after painting).
function driftLattice() {
 const nx = Math.ceil(W0 / DRIFT_CELL_M) + 2;
 const ny = Math.ceil(H0 / DRIFT_CELL_M) + 2;
 const v = new Float32Array(nx * ny);
 for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = hash(i + 517, j + 911) * 2 - 1;
 return { nx, v };
}

// -1..1, the drifts at texel (x, y): smoothstep between the four lattice values around it.
function driftAt(drift, x, y) {
 const fx = x / DRIFT_CELL_M;
 const fy = y / DRIFT_CELL_M;
 const i = Math.floor(fx);
 const j = Math.floor(fy);
 const u = (fx - i) * (fx - i) * (3 - 2 * (fx - i));
 const w = (fy - j) * (fy - j) * (3 - 2 * (fy - j));
 const k = j * drift.nx + i;
 const v = drift.v;
 return (v[k] * (1 - u) + v[k + 1] * u) * (1 - w) + (v[k + drift.nx] * (1 - u) + v[k + drift.nx + 1] * u) * w;
}

// -1..1, a fixed speckle for texel (x, y): an integer hash, no Math.sin, so the whole map costs little.
function speckle(x, y) {
 let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
 h = Math.imul(h ^ (h >>> 13), 1274126177);
 return ((h ^ (h >>> 16)) & 0xffff) / 32767.5 - 1;
}

function paintLift(mx, colour) {
 mx.strokeStyle = colour('mapLift');
 mx.lineWidth = 1.2;
 mx.beginPath();
 mx.moveTo(820, 2290);
 mx.lineTo(820, 140);
 mx.stroke();
 for (let y = 140; y <= 2290; y += 70) {
  mx.fillStyle = colour('mapLift');
  mx.fillRect(818, y - 2, 5, 5);
 }
 for (let y = 200; y < 2290; y += 420) {
  mx.fillStyle = colour('mapLiftMarker');
  mx.fillRect(817, y, 6, 4);
 }
}

// Each tree with a long soft shadow, in placement order (trees are in world metres: back to the grid).
function paintTrees(mx, treeArr, frame, colour) {
 const at = { u: 0, v: 0 };
 for (const T of treeArr) {
  frame.toGrid(T.x, T.y, at);
  const x = at.u;
  const y = at.v;
  mx.fillStyle = colour('mapTreeShadow');
  mx.beginPath();
  mx.moveTo(x - 1.4, y);
  mx.lineTo(x + 1.4, y);
  mx.lineTo(x + 9, y - 10);
  mx.closePath();
  mx.fill();
  mx.fillStyle = colour('treeCrown');
  mx.beginPath();
  mx.arc(x, y, 1.6, 0, 7);
  mx.fill();
 }
}

// Kickers: a bluish pad up the ramp, then a pale lip with an orange edge (stronger for the big ones). Painted row by
// row so it follows the curve of the piste. Then each rail's shadow.
function paintPark(mx, colour) {
 for (const k of KICK) {
  const big = KBIG.includes(k);
  const w = big ? 10 : 9;
  for (let yy = k - 11; yy < k + 5; yy++) {
   const c = cx(yy);
   const pad = big ? 'mapBigKickerPad' : 'mapKickerPad';
   mx.fillStyle = colour(yy < k ? pad : (big ? 'mapBigKickerLip' : 'mapKickerLip'));
   mx.fillRect(c - w, yy, w * 2, 1);
   if (yy === k) {
    mx.fillStyle = colour('mapKickerEdge');
    mx.fillRect(c - w, yy, w * 2, 1.3);
   }
  }
 }
 for (const r of RAILS) {
  mx.strokeStyle = colour('mapRailShadow');
  mx.lineWidth = 1.4;
  mx.beginPath();
  mx.moveTo(r.x0 + 1.2, r.y0 - 0.8);
  mx.lineTo(r.x0 + r.dx * r.len + 1.2, r.y0 + r.dy * r.len - 0.8);
  mx.stroke();
 }
}

function paintVillage(mx, colour) {
 for (let k = 0; k < 26; k++) {
  const x = cx(FIN + 60) - 230 + hash(k, 1) * 460;
  const y = FIN + 40 + hash(k, 2) * 70;
  const w = 12 + hash(k, 3) * 8;
  mx.fillStyle = colour('mapHouseShadow');
  mx.fillRect(x + 2, y + 2, w, 10);
  mx.fillStyle = colour(hash(k, 4) > 0.5 ? 'mapRoof' : 'mapRoofAlt');
  mx.fillRect(x, y, w, 10);
  mx.fillStyle = colour('mapRoofSnow');
  mx.fillRect(x, y, w, 3);
 }
 const fc = cx(FIN);
 for (let k = 0; k < 16; k++) {
  mx.fillStyle = colour(k % 2 ? 'mapFinishLight' : 'mapFinishDark');
  mx.fillRect(fc - 40 + k * 5, FIN, 5, 3);
 }
 mx.fillStyle = colour('mapFinishPost');
 mx.fillRect(fc - 42, FIN - 8, 3, 11);
 mx.fillRect(fc + 39, FIN - 8, 3, 11);
 mx.fillStyle = colour('mapLabel');
 mx.font = 'bold 13px Trebuchet MS,sans-serif';
 mx.textAlign = 'center';
 mx.fillText('PAS DE LA CASA', fc, FIN + 30);
}
