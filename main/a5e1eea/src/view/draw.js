// draw(): one frame of the behind-the-rider view: terrain raycast, sky and sun, trees, rails, flags, spray and the
// rider; updateCamera() moves the camera before it, in the loop. Reads the simulation's state and never writes it.
import { CAM_MODES, RAY_SAMPLES, RAY_EXACT_M, RAY_START_M, RAY_SPREAD, RIDER_SCALE } from '../core/config.js';
import { followRider } from './camera.js';
import { fogAt, drawSky, drawSun } from './sky.js';
import { projectInto, drawFlags, drawRails, drawPistePoles } from './sprites.js';
import { animTick } from './rider-animation.js';
import { drawRider } from './rider-draw.js';
import { cssRgba } from './look/look.js';
import { sprayPool } from '../sim/particles.js';
import { STAGE, TREE_SLICES, treeStyle } from './view-state.js';
import { TREE_FAR_M, TREE_HEIGHT_M } from './gl/tree-mesh.js'; // m: the sprites and the GPU trees share them

const SPRAY_NEAR_SCALE = 0.6; // times the rider's px per m: spray between the camera and the rider grows no bigger
// The rider sunk in powder (rider.sink): the snow line over the equipment and the mound of snow around it.
const EQUIPMENT_BELOW_M = 0.35; // m (rider draw scale), how far the board or skis reach below the feet on the screen
const SINK_SCREEN = 1.4;      // times rider.sink, how far up the screen the snow line moves (the camera looks down)
const SUNK_MIN_PX = 0.6;      // px, less sink than this is not drawn
const SUNK_CLIP_M = 6;        // m (rider draw scale), the clip rectangle's half size: all of the rider
const COLLAR_HALF_M = 1.0;    // m, the snow mound's half-width
const COLLAR_HEIGHT_M = 0.18; // m, its half-height on the screen with no sink
const COLLAR_FULL_M = 0.15;   // m of sink at which the mound is fully opaque
const COLLAR_RINGS = 3;       // ellipses in the mound
const AIRBORNE_DRAW_M = 0.05; // m above the snow (view.drawn.z): in the air, not sunk

const NS = RAY_SAMPLES;
const MAX_RENDER_W = 360;     // render px, the low-res terrain render is at most this wide
const CSS_PX_PER_RENDER_PX = 1.6; // CSS px of screen per render column
const BLEND_NEAR_M = 80;      // m, nearer samples blend the four colour-map cells around them (bilinear)
const BLEND_MAX_STEP = 140;   // 0..765, summed RGB step between two samples: smaller steps are shaded smooth, more so
                              // the smaller; from this step up the span stays flat (a painted edge)
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
 view.groundM = followRider(camera, terrain, look.camera, view.drawn, rider, RW, RH, W, dt, scene.input.lookBack,
  CAM_MODES[scene.camMode.index]);
 if (view.timer !== null) view.timer.lap(STAGE.CAMERA);
}

/**
 * Draws one frame from the camera and pose updateCamera() set. dt: s since the last drawn frame (animation).
 * scene: {canvas, ctx (the screen), camera, rider, session, input, terrain, course, frame (the MapFrame), treeArr,
 * spray, timestep, look (the Look), riderAnim}. Mutates view (render buffers, animation, counts); reads the
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
 * objectsOnGpu: the GPU draws the trees (gl/tree-mesh.js) and the park, rails, flags and kickers (gl/park-mesh.js):
 * skip them here.
 */
export function drawSprites(view, scene, dt, objectsOnGpu = false) {
 const { ctx, camera, terrain, look } = scene;
 const timer = view.timer;
 if (!objectsOnGpu) drawTrees(ctx, view, camera, terrain, look, scene.treeArr, view.lo.width);
 if (timer !== null) timer.lap(STAGE.TREES);
 if (!objectsOnGpu) {
  view.railsDrawn = drawRails(ctx, camera, terrain, scene.course, view, look.sprites);
  view.flagsDrawn = drawFlags(ctx, camera, terrain, scene.course, view, scene.frame, look.sprites);
  view.polesDrawn = drawPistePoles(ctx, camera, terrain, scene.course, view, scene.pistePoles, look.sprites);
 }
 drawSpray(ctx, camera, terrain, view, sprayPool(scene.spray), look.sprites.spray);
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
  const ph = (c / RW - 0.5) * camera.fov;
  const cs = Math.cos(ph);
  // columns run left to right, clockwise in the world (headings grow counter-clockwise)
  const rx = Math.cos(camA - ph);
  const ry = Math.sin(camA - ph);
  frame.vecToGrid(rx, ry, ray);
  const ru = ray.u;
  const rv = ray.v;
  let ym = RH;
  let lastK = -2; // the sample drawn last, and its colour after fog: a span right after it blends from that colour
  let lr = 0;
  let lg = 0;
  let lb = 0;
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
     // Shade the span from this sample's colour at its top (ys) to the previous sample's at its bottom (ym), so a
     // slope is a smooth gradient rather than a flat band per sample. Not across a gap (a crest hid the samples in
     // between) or a painted edge (kicker, track, rock): there the edge stays sharp.
     const step = Math.abs(lr - r) + Math.abs(lg - g) + Math.abs(lb - b);
     const blend = lastK === k - 1 ? Math.max(0, 1 - step / BLEND_MAX_STEP) / (ym - ys) : 0;
     const dr = (lr - r) * blend;
     const dg = (lg - g) * blend;
     const db = (lb - b) * blend;
     const q0 = Math.max(0, ys);
     let qr = r + dr * (q0 - ys);
     let qg = g + dg * (q0 - ys);
     let qb = b + db * (q0 - ys);
     for (let q = q0; q < ym; q++) {
      const o = (q * RW + c) * 4;
      D[o] = qr;
      D[o + 1] = qg;
      D[o + 2] = qb;
      D[o + 3] = 255;
      qr += dr;
      qg += dg;
      qb += db;
     }
     ym = q0;
     lastK = k;
     lr = r;
     lg = g;
     lb = b;
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

// Snow spray particles, fading and growing as they age (near the camera no bigger than SPRAY_NEAR_SCALE), each its
// own size (r: a powder plume's puffs are bigger and fade slower, sim/particles.js). pool: the spray's ParticlePool.
// spray: the Look's sprites.spray. view: its projection scratch.
function drawSpray(ctx, camera, terrain, view, pool, spray) {
 const P = view.projA;
 const most = camera.focalPx / camera.back * camera.pixelScale * SPRAY_NEAR_SCALE; // px per m: puffs nearer the camera
 for (let i = 0; i < pool.count; i++) {
  const t = pool.t[i], life = pool.life[i], r = pool.r[i] || 1;
  if (!projectInto(camera, pool.x[i], pool.y[i], terrain.height(pool.x[i], pool.y[i]) + pool.z[i], P)) continue;
  const k = t / life;
  const fade = r > 1 ? (1 - k) * (1 - k * 0.5) : 1 - k; // a plume hangs, then thins
  ctx.fillStyle = cssRgba(spray.rgb, spray.maxAlpha * fade);
  ctx.beginPath();
  ctx.arc(P.X, P.Y, Math.max(1, Math.min(P.s, most) * r * (0.2 + 0.5 * k)), 0, 7);
  ctx.fill();
 }
}

// Sunk in powder (rider.sink, m): the snow hides the equipment and the boots. Clips what drawRider() draws below the
// snow line (sink above the equipment's lowest point, in the rider's draw scale m px per m) and returns that line's
// y (px), or null when nothing is sunk.
function clipSunk(ctx, rider, m, inAir) {
 const sink = inAir || rider.crashTimer > 0 ? 0 : rider.sink || 0;
 if (sink * m < SUNK_MIN_PX) return null;
 const line = (EQUIPMENT_BELOW_M - sink * SINK_SCREEN) * m;
 ctx.beginPath();
 ctx.rect(-SUNK_CLIP_M * m, -SUNK_CLIP_M * m, 2 * SUNK_CLIP_M * m, SUNK_CLIP_M * m + line);
 ctx.clip();
 return line;
}

// The powder around a sunk rider: a soft mound of snow along the cut line (y px, from clipSunk), in the spray's colour,
// as COLLAR_RINGS nested ellipses, fainter outward.
function drawCollar(ctx, look, m, y, sink) {
 const sp = look.sprites.spray;
 const a = Math.min(1, sink / COLLAR_FULL_M); // light powder: a dusting round the boots; deep: a mound
 const ry = (COLLAR_HEIGHT_M + sink * 0.4) * m;
 for (let k = COLLAR_RINGS; k >= 1; k--) {
  const f = k / COLLAR_RINGS;
  ctx.fillStyle = cssRgba(sp.rgb, a * (1.05 - f) * 0.9);
  ctx.beginPath();
  ctx.ellipse(0, y, COLLAR_HALF_M * m * f, ry * f, 0, 0, 7);
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
 const mf = sc / camera.back * kx;
 const m = mf * RIDER_SCALE;
 const list = animTick(view, scene, dt);
 const shd = list[0];
 const ss = 1 / (1 + jz * 0.25);
 ctx.save();
 ctx.translate(view.W / 2, ((camera.height - gR) / camera.back * sc + camera.horizonPx - camera.pitchPx) * kx);
 if (view.renderer.name !== 'gl') { // the GPU terrain shades the rider's shadow itself (gl/rider-shadow.js)
  ctx.globalAlpha = SHADOW_ALPHA;
  ctx.fillStyle = look.colour(shd.colour);
  ctx.beginPath();
  ctx.ellipse(shd.c[0] * m, -shd.c[1] * m, shd.rx * m * ss, shd.ry * m * ss, 0, 0, 7);
  ctx.fill();
 }
 ctx.globalAlpha = 1;
 ctx.translate(0, -jz * mf);
 if (rider.crashTimer > 0) {
  ctx.translate(0, -WIPEOUT_PIVOT * m);
  ctx.rotate(rider.wipeoutSpin);
  ctx.translate(0, WIPEOUT_PIVOT * m);
 }
 ctx.save();
 const line = clipSunk(ctx, rider, m, jz > AIRBORNE_DRAW_M);
 drawRider(ctx, look, m, list);
 ctx.restore();
 if (line !== null) drawCollar(ctx, look, m, line, rider.sink);
 ctx.restore();
}
