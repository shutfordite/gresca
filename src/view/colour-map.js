// The colour map the raycaster reads (D2 replaces it with per-pixel shading): snow, rock, lift, trees, park, village.
import { W0, H0, FIN, KICK, KBIG, RAILS, cx } from '../world/course.js';
import { hash } from '../world/noise.js';

/**
 * Paints the built world (world/build.js) into mx, the 2D context of a W0 × H0 canvas, one pixel per map metre:
 * lavender shadows, warm lit snow, grey rock, corduroy on the groomed piste, then the lift line, the trees and their
 * shadows, the kickers, the rails, the village and the finish. Reads world.H, world.M and world.treeArr.
 */
export function paintColourMap(mx, world) {
 paintSnow(mx, world.H, world.M);
 paintLift(mx);
 paintTrees(mx, world.treeArr);
 paintPark(mx);
 paintVillage(mx);
}

// Colour map: lavender shadows, warm lit snow, grey rock, and fine corduroy stripes on the groomed piste.
function paintSnow(mx, H, M) {
 const img = mx.createImageData(W0, H0);
 const D = img.data;
 for (let y = 0; y < H0; y++) {
  const c = cx(y);
  for (let x = 0; x < W0; x++) {
   const i = y * W0 + x;
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
   let r = 170 + lit * 74 + m * 6;
   let g = 168 + lit * 78 + m * 6;
   let b = 214 + lit * 38 + m * 4;
   if (m > 0) {
    const st = 1 + 0.045 * m * Math.sin((x - c) * 2.1);
    r *= st;
    g *= st;
    b *= st;
   }
   r += (118 - r) * rk;
   g += (120 - g) * rk;
   b += (130 - b) * rk;
   const o = i * 4;
   D[o] = r;
   D[o + 1] = g;
   D[o + 2] = b;
   D[o + 3] = 255;
  }
 }
 mx.putImageData(img, 0, 0);
}

function paintLift(mx) {
 mx.strokeStyle = '#39424f';
 mx.lineWidth = 1.2;
 mx.beginPath();
 mx.moveTo(820, 2290);
 mx.lineTo(820, 140);
 mx.stroke();
 for (let y = 140; y <= 2290; y += 70) {
  mx.fillStyle = '#39424f';
  mx.fillRect(818, y - 2, 5, 5);
 }
 for (let y = 200; y < 2290; y += 420) {
  mx.fillStyle = '#ff6b3d';
  mx.fillRect(817, y, 6, 4);
 }
}

// Each tree with a long soft shadow, in placement order.
function paintTrees(mx, treeArr) {
 for (const { x, y } of treeArr) {
  mx.fillStyle = 'rgba(96,86,150,.30)';
  mx.beginPath();
  mx.moveTo(x - 1.4, y);
  mx.lineTo(x + 1.4, y);
  mx.lineTo(x + 9, y - 10);
  mx.closePath();
  mx.fill();
  mx.fillStyle = '#1f4a3a';
  mx.beginPath();
  mx.arc(x, y, 1.6, 0, 7);
  mx.fill();
 }
}

// Kickers: a bluish pad up the ramp, then a pale lip with an orange edge (stronger for the big ones). Painted row by
// row so it follows the curve of the piste. Then each rail's shadow.
function paintPark(mx) {
 for (const k of KICK) {
  const big = KBIG.includes(k);
  const w = big ? 10 : 9;
  for (let yy = k - 11; yy < k + 5; yy++) {
   const c = cx(yy);
   mx.fillStyle = yy < k ? (big ? 'rgba(110,124,196,.45)' : 'rgba(120,134,196,.34)') : (big ? '#b7c6dd' : '#9fb0c8');
   mx.fillRect(c - w, yy, w * 2, 1);
   if (yy === k) {
    mx.fillStyle = '#ff6b3d';
    mx.fillRect(c - w, yy, w * 2, 1.3);
   }
  }
 }
 for (const r of RAILS) {
  mx.strokeStyle = 'rgba(96,86,150,.35)';
  mx.lineWidth = 1.4;
  mx.beginPath();
  mx.moveTo(r.x0 + 1.2, r.y0 - 0.8);
  mx.lineTo(r.x0 + r.dx * r.len + 1.2, r.y0 + r.dy * r.len - 0.8);
  mx.stroke();
 }
}

function paintVillage(mx) {
 for (let k = 0; k < 26; k++) {
  const x = cx(FIN + 60) - 230 + hash(k, 1) * 460;
  const y = FIN + 40 + hash(k, 2) * 70;
  const w = 12 + hash(k, 3) * 8;
  mx.fillStyle = 'rgba(30,40,60,.3)';
  mx.fillRect(x + 2, y + 2, w, 10);
  mx.fillStyle = hash(k, 4) > 0.5 ? '#b5543a' : '#8a6a5a';
  mx.fillRect(x, y, w, 10);
  mx.fillStyle = '#f2f6fa';
  mx.fillRect(x, y, w, 3);
 }
 const fc = cx(FIN);
 for (let k = 0; k < 16; k++) {
  mx.fillStyle = k % 2 ? '#fff' : '#d33';
  mx.fillRect(fc - 40 + k * 5, FIN, 5, 3);
 }
 mx.fillStyle = '#d33';
 mx.fillRect(fc - 42, FIN - 8, 3, 11);
 mx.fillRect(fc + 39, FIN - 8, 3, 11);
 mx.fillStyle = '#16202e';
 mx.font = 'bold 13px Trebuchet MS,sans-serif';
 mx.textAlign = 'center';
 mx.fillText('PAS DE LA CASA', fc, FIN + 30);
}
