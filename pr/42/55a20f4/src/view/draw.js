// draw(): one frame of the behind-the-rider view: terrain raycast, sky and sun, trees, rails, flags, spray and the
// rider; updateCamera() moves the camera before it, in the loop. Reads the simulation's state and never writes it.
import { FOV, RAY_SAMPLES, RAY_EXACT_M, CAM_BACK, RIDER_SCALE } from '../core/config.js';
import { followRider } from './camera.js';
import { fogAt, drawSky, drawSun } from './sky.js';
import { projectInto, drawFlags, drawRails } from './sprites.js';
import { animTick } from './rider-animation.js';
import { drawRider } from './rider-draw.js';
import { cssRgba } from './look/look.js';
import { STAGE, TREE_SLICES, treeStyle } from './view-state.js';

const NS = RAY_SAMPLES;
const MAX_RENDER_W = 360;     // render px, the low-res terrain render is at most this wide
const CSS_PX_PER_RENDER_PX = 1.6; // CSS px of screen per render column
const RAY_START_M = 3;        // m, the first terrain sample along each column
const RAY_SPREAD = 0.012;     // dimensionless, each sample is 1 m plus this fraction further than the last
const BLEND_NEAR_M = 80;      // m, nearer samples blend the four colour-map cells around them (bilinear)
const TREE_FAR_M = 300;       // m along the view, further trees are not drawn
const TREE_HEIGHT_M = 9;      // m, drawn height of a tree
const SNAP_M = 8;             // m, a jump no step could make: show the current state as it is
const SHADOW_ALPHA = 0.55;    // opacity of the rider's shadow
const TREE_NEAR_M = 3;        // m along the view, nearer trees are not drawn (sprites.js drops them too)
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
 * Before a frame is drawn, in the loop (app.js): sets the drawn rider pose (riderPose(), alpha 0..1), sizes the
 * low-res render to the canvas and moves the camera after the rider, dt s after the last frame. Writes view.drawn,
 * view.lo's size, view.groundM (m, the ground under the drawn rider) and the camera; reads the sim's state only.
 */
export function updateCamera(view, scene, dt, alpha) {
 const { camera, rider, terrain, look } = scene;
 riderPose(view, rider, scene.timestep, alpha);
 const W = view.W;
 const RW = Math.min(MAX_RENDER_W, Math.round(view.cssW / CSS_PX_PER_RENDER_PX));
 const RH = Math.round(RW * view.Hh / W);
 if (view.lo.width !== RW || view.lo.height !== RH) {
  view.lo.width = RW;
  view.lo.height = RH;
 }
 view.groundM = followRider(camera, terrain, look.camera, view.drawn, rider, RW, RH, W, dt);
 if (view.timer !== null) view.timer.lap(STAGE.CAMERA);
}

/**
 * Draws one frame from the camera and pose updateCamera() set. dt: s since the last drawn frame (animation).
 * scene: {canvas, ctx (the screen), camera, rider, session, input, terrain, course, frame (the MapFrame), treeArr,
 * particles, timestep, look (the Look), riderAnim}. Mutates view (render buffers, animation, counts); reads the
 * rest.
 */
export function draw(view, scene, dt) {
 const { ctx, camera, terrain, look } = scene;
 const W = view.W;
 const Hh = view.Hh;
 const RW = view.lo.width;
 const RH = view.lo.height;
 const timer = view.timer;
 const im = renderImage(view, RW, RH);
 raycast(view, camera, terrain, look.fog, im.data, RW, RH);
 view.lx.putImageData(im, 0, 0);
 if (timer !== null) timer.lap(STAGE.RAYCAST);
 drawSky(ctx, look.sky, camera, W, Hh); // behind the terrain: transparent render pixels show the sky,
 drawSun(ctx, look.sky, camera, W, Hh, scene.frame, view.sun); // and ridges cover the sun
 if (timer !== null) timer.lap(STAGE.SKY);
 ctx.imageSmoothingEnabled = true;
 ctx.drawImage(view.lo, 0, 0, W, Hh);
 if (timer !== null) timer.lap(STAGE.BLIT);
 drawSprites(view, scene, dt);
}

/**
 * Everything over the terrain, on the screen canvas: trees (hidden behind ridges by view.occ, filled by the raycast
 * or, with the GPU terrain, by gl/horizon.js), rails, flags, spray and the rider. Same scene and dt as draw().
 */
export function drawSprites(view, scene, dt) {
 const { ctx, camera, terrain, look } = scene;
 const timer = view.timer;
 drawTrees(ctx, view, camera, terrain, look, scene.treeArr, view.lo.width);
 if (timer !== null) timer.lap(STAGE.TREES);
 view.railsDrawn = drawRails(ctx, camera, terrain, scene.course, view, look.sprites);
 view.flagsDrawn = drawFlags(ctx, camera, terrain, scene.course, view, scene.frame, look.sprites);
 drawSpray(ctx, camera, terrain, view, scene.particles, look.sprites.spray);
 if (timer !== null) timer.lap(STAGE.SPRITES);
 drawRiderOnSnow(ctx, view, scene, view.groundM, dt);
 if (timer !== null) timer.lap(STAGE.RIDER);
}

// The low-res render's pixels, all transparent: view.loImage, made again only when the render size changes (the
// raycast then fills in the terrain, and what it leaves is the sky showing through).
function renderImage(view, RW, RH) {
 let im = view.loImage;
 if (im === null || im.width !== RW || im.height !== RH) im = view.loImage = view.lx.createImageData(RW, RH);
 else im.data.fill(0);
 return im;
}

// The terrain samples' distance and fog, the same for every column, in view.rayZ and rayFog; made again only if the
// Look's fog is a different one.
function rayTables(view, fog) {
 if (view.rayFogFor === fog) return;
 let z = RAY_START_M;
 for (let k = 0; k < NS; k++) {
  view.rayZ[k] = z;
  view.rayFog[k] = fogAt(fog, z);
  z += 1 + z * RAY_SPREAD;
 }
 view.rayFogFor = fog;
}

// Terrain raycast into D (RGBA, RW × RH render px), one column at a time, near to far; fills view.occ.
// Within RAY_EXACT_M of the camera the heights are terrain.height, the same surface the rider and physics use, so the
// board sits on the snow you see (docs/REAL-WORLD-DATA.md 3b). Further out they come from terrain.heightFast, its
// documented fast path (bilinear: on the groomed piste within about 3 cm of height for 99% of points and 12 cm at
// worst, at a big kicker's lip; test/terrain.test.js). Colours come from the colour map col, a texture CW × CH cells
// (one per m) placed in the world by view.mapFrame (the map's MapFrame): each ray also walks its texel position
// (u, v), a straight line in texels, so the lookup costs no transform per sample. fog: the Look's fog.
function raycast(view, camera, terrain, fog, D, RW, RH) {
 const occ = view.occ;
 const col = view.col;
 const FOG = view.fog;
 const frame = view.mapFrame;
 const camA = camera.heading;
 const camH = camera.height;
 const px = camera.x;
 const py = camera.y;
 const sc = camera.focalPx;
 const hz = camera.horizonPx;
 const pt = camera.pitchPx;
 const CW = view.map.width;
 const U1 = CW - 2;
 const V1 = view.map.height - 2;
 const CW4 = CW * 4;
 const cam = frame.toGrid(px, py, view.texel);
 const pu = cam.u;
 const pv = cam.v;
 const ray = view.rayTexel;
 rayTables(view, fog);
 const rayZ = view.rayZ;
 const rayFog = view.rayFog;
 for (let c = 0; c < RW; c++) {
  const ph = (c / RW - 0.5) * FOV;
  const cs = Math.cos(ph);
  // columns run left to right, clockwise in the world (headings grow counter-clockwise)
  const rx = Math.cos(camA - ph);
  const ry = Math.sin(camA - ph);
  frame.vecToGrid(rx, ry, ray);
  const ru = ray.u;
  const rv = ray.v;
  let ym = RH;
  for (let k = 0; k < NS; k++) {
   const z = rayZ[k];
   const uu = pu + ru * z;
   const vv = pv + rv * z;
   occ[c * NS + k] = ym;
   if (uu >= 1 && uu < U1 && vv >= 1 && vv < V1) {
    const xx = px + rx * z;
    const yy = py + ry * z;
    const ix = uu | 0;
    const iy = vv | 0;
    const fx = uu - ix;
    const fy = vv - iy;
    const mi = iy * CW + ix;
    const h = z < RAY_EXACT_M ? terrain.height(xx, yy) : terrain.heightFast(xx, yy);
    const ys = Math.floor((camH - h) / (z * cs) * sc + hz - pt);
    if (ys < ym) {
     const o4 = mi * 4;
     const f = rayFog[k];
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
  }
 }
}

// The trees' x and y (m) as two arrays, which the cull below reads faster than 15 000 objects: made on the first frame
// after the world is built (and again if the list changes), in view.treePos.
function treePositions(view, treeArr) {
 const pos = view.treePos;
 if (pos.src === treeArr && pos.n === treeArr.length) return pos;
 pos.x = new Float64Array(treeArr.length);
 pos.y = new Float64Array(treeArr.length);
 for (let i = 0; i < treeArr.length; i++) {
  pos.x[i] = treeArr[i].x;
  pos.y[i] = treeArr[i].y;
 }
 pos.src = treeArr;
 pos.n = treeArr.length;
 return pos;
}

// Trees, far to near, hidden when a nearer ridge covers them (view.occ from the raycast). look: the Look. The visible
// trees go in view.trees (typed arrays, no objects), sorted far to near (sortTrees()).
function drawTrees(ctx, view, camera, terrain, look, treeArr, RW) {
 const FOG = view.fog;
 const TREE = look.sprites.tree.rgb; // before fog
 const occ = view.occ;
 const kx = camera.pixelScale;
 const sc = camera.focalPx;
 const buf = view.trees;
 const P = view.projA;
 const pos = treePositions(view, treeArr);
 const xs = pos.x;
 const ys = pos.y;
 buf.n = 0;
 for (let i = 0; i < pos.n; i++) {
  // projectInto() would drop it anyway: skip the height lookup
  const f = (xs[i] - camera.x) * camera.dirX + (ys[i] - camera.y) * camera.dirY;
  if (f < TREE_NEAR_M || f > TREE_FAR_M) continue;
  if (!projectInto(camera, xs[i], ys[i], terrain.height(xs[i], ys[i]), P) || P.f > TREE_FAR_M) continue;
  buf.grow();
  const n = buf.n++;
  buf.X[n] = P.X;
  buf.Y[n] = P.Y;
  buf.f[n] = P.f;
  buf.z[n] = P.z;
 }
 sortTrees(buf);
 for (let i = 0; i < buf.n; i++) {
  const t = buf.order[i];
  const X = buf.X[t];
  const Y = buf.Y[t];
  const pz = buf.z[t];
  const ci = Math.min(RW - 1, Math.max(0, (X / kx) | 0));
  // the terrain sample nearest pz: samples sit at z_k with z_{k+1} = 1 + 1.012 z_k from 3 m (closed form below)
  const k = Math.max(0, Math.min(NS - 1, Math.floor(Math.log((pz + 83.33) / 86.33) / Math.log(1.012))));
  const ysb = Y / kx;
  const hs = TREE_HEIGHT_M / buf.f[t] * sc;
  if (occ[ci * NS + k] < ysb - hs * 0.6) continue;
  const fg = fogAt(look.fog, pz);
  const hh = hs * kx;
  const r = (TREE[0] + (FOG[0] - TREE[0]) * fg) | 0;
  const gn = (TREE[1] + (FOG[1] - TREE[1]) * fg) | 0;
  const b = (TREE[2] + (FOG[2] - TREE[2]) * fg) | 0;
  ctx.fillStyle = treeStyle(view, r, gn, b);
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

// Which of the TREE_SLICES depth slices a tree f m along the view is in: 0 is the farthest.
const depthSlice = (f) => Math.min(TREE_SLICES - 1, ((TREE_FAR_M - f) * TREE_SLICES / (TREE_FAR_M - TREE_NEAR_M)) | 0);

// Puts buf.order[0..n) in far-to-near order (f descending), trees at equal f in the order they were found: a counting
// sort into TREE_SLICES depth slices, then an insertion sort that only has to settle trees within a slice.
function sortTrees(buf) {
 const n = buf.n;
 const counts = buf.counts;
 const f = buf.f;
 const order = buf.order;
 counts.fill(0);
 for (let t = 0; t < n; t++) counts[depthSlice(f[t]) + 1]++;
 for (let b = 0; b < TREE_SLICES; b++) counts[b + 1] += counts[b];
 for (let t = 0; t < n; t++) order[counts[depthSlice(f[t])]++] = t;
 for (let i = 1; i < n; i++) {
  const t = order[i];
  let j = i;
  while (j > 0 && f[order[j - 1]] < f[t]) {
   order[j] = order[j - 1];
   j--;
  }
  order[j] = t;
 }
}

// Snow spray particles, fading and growing as they age. spray: the Look's sprites.spray. view: its projection scratch.
function drawSpray(ctx, camera, terrain, view, particles, spray) {
 const P = view.projA;
 for (const p of particles) {
  if (!projectInto(camera, p.x, p.y, terrain.height(p.x, p.y) + p.z, P)) continue;
  const k = p.t / p.life;
  ctx.fillStyle = cssRgba(spray.rgb, spray.maxAlpha * (1 - k));
  ctx.beginPath();
  ctx.arc(P.X, P.Y, Math.max(1, P.s * (0.2 + 0.5 * k)), 0, 7);
  ctx.fill();
 }
}

// The rider, small, in the lower third: its shadow on the snow, then the Hanga rider (tumbling in a wipeout).
// gR: m, the ground under the rider.
function drawRiderOnSnow(ctx, view, scene, gR, dt) {
 const { camera, rider, look } = scene;
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
 ctx.fillStyle = look.colour(shd.colour);
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
 drawRider(ctx, look, m, list);
 ctx.restore();
}
