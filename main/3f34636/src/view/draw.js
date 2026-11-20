// draw(): one frame of the behind-the-rider view: camera follow, terrain raycast, sky and sun, trees, rails, flags,
// spray and the rider. Reads the simulation's state and never writes it.
import { FOV, RAY_SAMPLES, RAY_EXACT_M, CAM_BACK, RIDER_SCALE } from '../core/config.js';
import { followRider } from './camera.js';
import { fogAt, drawSky, drawSun } from './sky.js';
import { project, drawFlags, drawRails } from './sprites.js';
import { animTick } from './rider-animation.js';
import { drawRider } from './rider-draw.js';

const NS = RAY_SAMPLES;
const MAX_RENDER_W = 360;     // render px, the low-res terrain render is at most this wide
const CSS_PX_PER_RENDER_PX = 1.6; // CSS px of screen per render column
const RAY_START_M = 3;        // m, the first terrain sample along each column
const RAY_SPREAD = 0.012;     // dimensionless, each sample is 1 m plus this fraction further than the last
const BLEND_NEAR_M = 80;      // m, nearer samples blend the four colour-map cells around them (bilinear)
const TREE_FAR_M = 300;       // m along the view, further trees are not drawn
const TREE_HEIGHT_M = 9;      // m, drawn height of a tree
const TREE_RGB = Object.freeze([31, 74, 58]); // the trees' colour before fog
const SNAP_M = 8;             // m, a jump no step could make: show the current state as it is
const SHADOW_ALPHA = 0.55;    // opacity of the rider's shadow
const WIPEOUT_PIVOT = 0.9;    // rider-scale units above the feet the wipeout tumbles around

/**
 * Sets view.drawn, the rider pose the view shows: m, m, m above the ground, and the alpha it was blended with.
 * alpha 0..1 is how far from the step before the latest one (timestep.fromX...) to the latest one; 1 shows the
 * current state.
 */
export function riderPose(view, rider, timestep, alpha) {
 const d = view.drawn;
 if (alpha >= 1 || Math.abs(rider.x - timestep.fromX) + Math.abs(rider.y - timestep.fromY) > SNAP_M) {
  d.x = rider.x;
  d.y = rider.y;
  d.z = rider.z;
  d.alpha = 1;
  return;
 }
 d.x = timestep.fromX + (rider.x - timestep.fromX) * alpha;
 d.y = timestep.fromY + (rider.y - timestep.fromY) * alpha;
 d.z = timestep.fromZ + (rider.z - timestep.fromZ) * alpha;
 d.alpha = alpha;
}

/**
 * Draws one frame. dt: s since the last drawn frame (camera smoothing and animation). alpha: see riderPose().
 * scene: {canvas, ctx (the screen), camera, rider, session, input, terrain, treeArr, particles, timestep, hanga,
 * riderAnim}. Mutates view and the camera.
 */
export function draw(view, scene, dt, alpha) {
 const { canvas, ctx, camera, rider, terrain, hanga } = scene;
 riderPose(view, rider, scene.timestep, alpha);
 const pose = view.drawn; // the rider as drawn; draw() reads the simulation but never writes it
 const W = view.W;
 const Hh = view.Hh;
 const RW = Math.min(MAX_RENDER_W, Math.round(canvas.clientWidth / CSS_PX_PER_RENDER_PX));
 const RH = Math.round(RW * Hh / W);
 if (view.lo.width !== RW || view.lo.height !== RH) {
  view.lo.width = RW;
  view.lo.height = RH;
 }
 // TODO(B2b): advance the camera in the loop, not inside draw().
 const gR = followRider(camera, terrain, hanga, pose, rider, RW, RH, W, dt);
 const im = view.lx.createImageData(RW, RH);
 raycast(view, camera, terrain, hanga, im.data, RW, RH);
 view.lx.putImageData(im, 0, 0);
 drawSky(ctx, hanga, camera, W, Hh); // behind the terrain: transparent render pixels show the sky,
 drawSun(ctx, hanga, camera, W, Hh); // and ridges cover the sun
 ctx.imageSmoothingEnabled = true;
 ctx.drawImage(view.lo, 0, 0, W, Hh);
 drawTrees(ctx, view, camera, terrain, hanga, scene.treeArr, RW);
 view.railsDrawn = drawRails(ctx, camera, terrain);
 view.flagsDrawn = drawFlags(ctx, camera, terrain);
 drawSpray(ctx, camera, terrain, scene.particles);
 drawRiderOnSnow(ctx, view, scene, gR, dt);
}

// Terrain raycast into D (RGBA, RW × RH render px), one column at a time, near to far; fills view.occ.
// Within RAY_EXACT_M of the camera the heights are terrain.height, the same surface the rider and physics use, so the
// board sits on the snow you see (docs/REAL-WORLD-DATA.md 3b). Further out they come from terrain.heightFast, its
// documented fast path (bilinear: on the groomed piste within about 3 cm of height for 99% of points and 12 cm at
// worst, at a big kicker's lip; test/terrain.test.js). Colours come from the colour map col, CW cells wide (the same
// grid as the procedural terrain's base layer).
function raycast(view, camera, terrain, hanga, D, RW, RH) {
 const occ = view.occ;
 const col = view.col;
 const FOG = view.fog;
 const camA = camera.heading;
 const camH = camera.height;
 const px = camera.x;
 const py = camera.y;
 const sc = camera.focalPx;
 const hz = camera.horizonPx;
 const pt = camera.pitchPx;
 const TB = terrain.bounds;
 const X1 = TB.maxX - 2;
 const Y1 = TB.maxY - 2;
 const CW = view.map.width;
 const CW4 = CW * 4;
 for (let c = 0; c < RW; c++) {
  const ph = (c / RW - 0.5) * FOV;
  const cs = Math.cos(ph);
  const rx = Math.cos(camA + ph);
  const ry = Math.sin(camA + ph);
  let ym = RH;
  let z = RAY_START_M;
  for (let k = 0; k < NS; k++) {
   const xx = px + rx * z;
   const yy = py + ry * z;
   occ[c * NS + k] = ym;
   if (xx >= 1 && xx < X1 && yy >= 1 && yy < Y1) {
    const ix = xx | 0;
    const iy = yy | 0;
    const fx = xx - ix;
    const fy = yy - iy;
    const mi = iy * CW + ix;
    const h = z < RAY_EXACT_M ? terrain.height(xx, yy) : terrain.heightFast(xx, yy);
    const ys = Math.floor((camH - h) / (z * cs) * sc + hz - pt);
    if (ys < ym) {
     const o4 = mi * 4;
     const f = fogAt(hanga, z);
     let c0 = col[o4];
     let c1 = col[o4 + 1];
     let c2 = col[o4 + 2];
     if (z < BLEND_NEAR_M) {
      const o1 = o4 + CW4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      c0 = c0 * w00 + col[o4 + 4] * w10 + col[o1] * w01 + col[o1 + 4] * w11;
      c1 = c1 * w00 + col[o4 + 5] * w10 + col[o1 + 1] * w01 + col[o1 + 5] * w11;
      c2 = c2 * w00 + col[o4 + 6] * w10 + col[o1 + 2] * w01 + col[o1 + 6] * w11;
     }
     const r = c0 + (FOG[0] - c0) * f;
     const g = c1 + (FOG[1] - c1) * f;
     const b = c2 + (FOG[2] - c2) * f;
     for (let q = Math.max(0, ys); q < ym; q++) {
      const o = (q * RW + c) * 4;
      D[o] = r;
      D[o + 1] = g;
      D[o + 2] = b;
      D[o + 3] = 255;
     }
     ym = Math.max(0, ys);
    }
   }
   z += 1 + z * RAY_SPREAD;
  }
 }
}

// Trees, far to near, hidden when a nearer ridge covers them (view.occ from the raycast).
function drawTrees(ctx, view, camera, terrain, hanga, treeArr, RW) {
 const FOG = view.fog;
 const occ = view.occ;
 const kx = camera.pixelScale;
 const sc = camera.focalPx;
 const vis = [];
 for (const T of treeArr) {
  // project() would drop it anyway: skip the height lookup
  const f = (T.x - camera.x) * camera.dirX + (T.y - camera.y) * camera.dirY;
  if (f < 3 || f > TREE_FAR_M) continue;
  const P = project(camera, T.x, T.y, terrain.height(T.x, T.y));
  if (!P || P.f > TREE_FAR_M) continue;
  vis.push({ P });
 }
 vis.sort((u, v) => v.P.f - u.P.f);
 for (const { P } of vis) {
  const ci = Math.min(RW - 1, Math.max(0, (P.X / kx) | 0));
  // the terrain sample nearest P.z: samples sit at z_k with z_{k+1} = 1 + 1.012 z_k from 3 m (closed form below)
  const k = Math.max(0, Math.min(NS - 1, Math.floor(Math.log((P.z + 83.33) / 86.33) / Math.log(1.012))));
  const ysb = P.Y / kx;
  const hs = TREE_HEIGHT_M / P.f * sc;
  if (occ[ci * NS + k] < ysb - hs * 0.6) continue;
  const fg = fogAt(hanga, P.z);
  const X = P.X;
  const Y = P.Y;
  const hh = hs * kx;
  const r = (TREE_RGB[0] + (FOG[0] - TREE_RGB[0]) * fg) | 0;
  const gn = (TREE_RGB[1] + (FOG[1] - TREE_RGB[1]) * fg) | 0;
  const b = (TREE_RGB[2] + (FOG[2] - TREE_RGB[2]) * fg) | 0;
  ctx.fillStyle = `rgb(${r},${gn},${b})`;
  for (let j = 0; j < 3; j++) {
   const by = Y - hh * (0.12 + 0.27 * j);
   const w = hh * (0.34 - 0.07 * j);
   ctx.beginPath();
   ctx.moveTo(X - w, by);
   ctx.lineTo(X + w, by);
   ctx.lineTo(X, by - hh * 0.42);
   ctx.fill();
  }
 }
}

// Snow spray particles, fading and growing as they age.
function drawSpray(ctx, camera, terrain, particles) {
 for (const p of particles) {
  const P = project(camera, p.x, p.y, terrain.height(p.x, p.y) + p.z);
  if (!P) continue;
  const k = p.t / p.life;
  ctx.fillStyle = 'rgba(246,248,255,' + (0.8 * (1 - k)).toFixed(2) + ')';
  ctx.beginPath();
  ctx.arc(P.X, P.Y, Math.max(1, P.s * (0.2 + 0.5 * k)), 0, 7);
  ctx.fill();
 }
}

// The rider, small, in the lower third: its shadow on the snow, then the Hanga rider (tumbling in a wipeout).
// gR: m, the ground under the rider.
function drawRiderOnSnow(ctx, view, scene, gR, dt) {
 const { camera, rider, hanga } = scene;
 const jz = view.drawn.z;
 const sc = camera.focalPx;
 const kx = camera.pixelScale;
 const mf = sc / CAM_BACK * kx;
 const m = mf * RIDER_SCALE;
 const list = animTick(view, scene, dt);
 const shd = list[0];
 const ss = 1 / (1 + jz * 0.25);
 ctx.save();
 ctx.translate(view.W / 2, ((camera.height - gR) / CAM_BACK * sc + camera.horizonPx - camera.pitchPx) * kx);
 ctx.globalAlpha = SHADOW_ALPHA;
 ctx.fillStyle = hanga.colour(shd.colour);
 ctx.beginPath();
 ctx.ellipse(shd.c[0] * m, -shd.c[1] * m, shd.rx * m * ss, shd.ry * m * ss, 0, 0, 7);
 ctx.fill();
 ctx.globalAlpha = 1;
 ctx.translate(0, -jz * mf);
 if (rider.crashTimer > 0) {
  ctx.translate(0, -WIPEOUT_PIVOT * m);
  ctx.rotate(rider.wipeoutSpin);
  ctx.translate(0, WIPEOUT_PIVOT * m);
 }
 drawRider(ctx, hanga, m, list);
 ctx.restore();
}
