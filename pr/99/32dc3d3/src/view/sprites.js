// Sprites on the 3D view: project() to the screen, flags and poles at the kickers and rails, rails and boxes.
import { PISTE_POLE } from './piste-poles.js';

const NEAR_M = 3;          // m, nearer than this along the view is not drawn
const FOV_MARGIN = 0.08;   // rad, project() keeps points this far outside the field of view
const DRAW_AHEAD_M = 260;  // m down the piste (along s) past the camera that flags and rails are drawn
const RAIL_SEGMENT_M = 1.5; // m, rails are drawn as segments this long, so the near end can run off screen
const RAIL_POST_EVERY_M = 6; // m between the posts under a rail
export const KICKER_FLAG_D = 11;  // m across from a kicker's centre to its flags
export const RAMP_FLAG_BACK_M = 8; // m up the ramp from the lip to a big kicker's second pair of flags
export const KICKER_RAMP_M = 11;  // m, a kicker's ramp runs this far up from the lip (along s)
export const KICKER_DROP_M = 5;   // m, and its drop this far past it
const RAIL_BEHIND_M = 5;   // m up the piste behind the camera that rails are still drawn
const POLE_BEHIND_M = 5;   // m up the piste behind the camera that edge poles are still drawn
export const RAIL_FLAG_D = 3;     // m further out than a rail's start, its flag

/** A new scratch result for projectInto(): {X, Y, s, f, z}, all zero. */
export const createProjection = () => ({ X: 0, Y: 0, s: 0, f: 0, z: 0 });

/**
 * Screen position of a world point (wx, wy) (m) at altitude h (m) into `out`, in canvas px: {X, Y, s (px per m at that
 * distance), f (m along the view), z (m from the camera)}. Returns false, leaving `out` as it was, if the point is
 * behind or off to the side. Allocates nothing: the frame's loops use it with scratch from createProjection().
 */
export function projectInto(camera, wx, wy, h, out) {
 const ox = wx - camera.x;
 const oy = wy - camera.y;
 const f = ox * camera.dirX + oy * camera.dirY;
 if (f < NEAR_M) return false;
 const r = ox * camera.dirY - oy * camera.dirX; // m to the right of the view (clockwise of it)
 const p = Math.atan2(r, f);
 if (Math.abs(p) > camera.fov / 2 + FOV_MARGIN) return false;
 const kx = camera.pixelScale;
 out.X = (0.5 + p / camera.fov) * camera.renderW * kx;
 out.Y = ((camera.height - h) / f * camera.focalPx + camera.horizonPx - camera.pitchPx) * kx;
 out.s = camera.focalPx / f * kx;
 out.f = f;
 out.z = Math.hypot(f, r);
 return true;
}

/**
 * Screen position of a world point (wx, wy) (m) at altitude h (m), in canvas px: {X, Y, s (px per m at that
 * distance), f (m along the view), z (m from the camera)}, or null if behind or off to the side. Allocates the result
 * (projectInto() does not).
 */
export function project(camera, wx, wy, h) {
 const out = createProjection();
 return projectInto(camera, wx, wy, h, out) ? out : null;
}

// A pole hgt m tall at (wx, wy) with a pennant of the given colour (sprites: the Look's). Returns 1 if drawn, else 0.
function pole(ctx, camera, terrain, view, sprites, wx, wy, hgt, color) {
 const gh = terrain.height(wx, wy);
 const A = view.projA;
 const T = view.projB;
 if (!projectInto(camera, wx, wy, gh, A) || !projectInto(camera, wx, wy, gh + hgt, T)) return 0;
 ctx.strokeStyle = sprites.pole.colour;
 ctx.lineWidth = Math.max(1, A.s * 0.08);
 ctx.beginPath();
 ctx.moveTo(A.X, A.Y);
 ctx.lineTo(T.X, T.Y);
 ctx.stroke();
 const fw = Math.max(5, A.s * 0.9);
 const fh = Math.max(4, A.s * 0.55);
 ctx.fillStyle = color;
 ctx.beginPath();
 ctx.moveTo(T.X, T.Y);
 ctx.lineTo(T.X + fw, T.Y + fh * 0.5);
 ctx.lineTo(T.X, T.Y + fh);
 ctx.closePath();
 ctx.fill();
 return 1;
}

/**
 * Orange flags on both sides of every kicker lip (yellow ones up the ramp of the big ones), and a flag at the start
 * of each rail, so features can be spotted from far up the slope. course: the Course; view: its where, point and
 * projection scratch; frame: the MapFrame (the big kickers' ramp flags and the rail flags are offset along the map's axes);
 * sprites: the Look's sprite colours. Returns the number of flags drawn.
 */
export function drawFlags(ctx, camera, terrain, course, view, frame, sprites) {
 const flag = sprites.flag;
 let n = 0;
 const cs = course.project(camera.x, camera.y, view.where).s;
 const P = view.point;
 for (const k of course.kickers) {
  if (k.s + KICKER_DROP_M < cs || k.s - KICKER_RAMP_M > cs + DRAW_AHEAD_M) continue;
  const h = k.big ? 3.2 : 2.4;
  course.point(k.s, k.d - KICKER_FLAG_D, P);
  n += pole(ctx, camera, terrain, view, sprites, P.x, P.y, h, flag.kicker);
  course.point(k.s, k.d + KICKER_FLAG_D, P);
  n += pole(ctx, camera, terrain, view, sprites, P.x, P.y, h, flag.kicker);
  if (k.big) {
   // Still placed up the map's grid from the lip (where they have always been drawn): C1 moves them to
   // point(s - RAMP_FLAG_BACK_M, d +- KICKER_FLAG_D), beside the ramp itself.
   frame.vecToWorld(-KICKER_FLAG_D, -RAMP_FLAG_BACK_M, P);
   n += pole(ctx, camera, terrain, view, sprites, k.x + P.x, k.y + P.y, h, flag.bigKicker);
   frame.vecToWorld(KICKER_FLAG_D, -RAMP_FLAG_BACK_M, P);
   n += pole(ctx, camera, terrain, view, sprites, k.x + P.x, k.y + P.y, h, flag.bigKicker);
  }
 }
 for (const r of course.rails) {
  if (r.s1 < cs || r.s0 > cs + DRAW_AHEAD_M) continue;
  const colour = r.t === 'box' ? sprites.box.colour : sprites.rail.colour;
  frame.vecToWorld(r.d > 0 ? RAIL_FLAG_D : -RAIL_FLAG_D, 0, P); // further out across the map than the rail
  n += pole(ctx, camera, terrain, view, sprites, r.x0 + P.x, r.y0 + P.y, 1.8, colour);
 }
 return n;
}

/**
 * Rails are red bars on posts, boxes are wider mint-green bars. course: the Course; view: its where and
 * projection scratch; sprites: the Look's sprite colours. Returns the number of segments drawn.
 */
export function drawRails(ctx, camera, terrain, course, view, sprites) {
 let n = 0;
 const cs = course.project(camera.x, camera.y, view.where).s;
 for (const r of course.rails) {
  if (r.s1 < cs - RAIL_BEHIND_M || r.s0 > cs + DRAW_AHEAD_M) continue;
  const isBox = r.t === 'box';
  let prev = null; // the last point's projection, or null if it was off screen: P and Q swap roles each step
  let P = view.projA;
  let Q = view.projB;
  for (let t = 0; t <= r.len + 0.01; t += RAIL_SEGMENT_M) {
   const tt = Math.min(t, r.len);
   const wx = r.x0 + r.dx * tt;
   const wy = r.y0 + r.dy * tt;
   const gh = terrain.height(wx, wy);
   const seen = projectInto(camera, wx, wy, gh + r.h, P);
   if (seen && prev) {
    ctx.strokeStyle = isBox ? sprites.box.colour : sprites.rail.colour;
    ctx.lineWidth = Math.max(isBox ? 5 : 3, P.s * (isBox ? 1.3 : 0.5));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.X, prev.Y);
    ctx.lineTo(P.X, P.Y);
    ctx.stroke();
    n++;
   }
   if (seen && t % RAIL_POST_EVERY_M < RAIL_SEGMENT_M) {
    const G = view.projG;
    if (projectInto(camera, wx, wy, gh, G)) {
     ctx.strokeStyle = sprites.pole.colour;
     ctx.lineWidth = Math.max(1, P.s * 0.12);
     ctx.beginPath();
     ctx.moveTo(P.X, P.Y);
     ctx.lineTo(G.X, G.Y);
     ctx.stroke();
    }
   }
   prev = seen ? P : null;
   const spare = P;
   P = Q;
   Q = spare;
  }
 }
 return n;
}

/**
 * The piste's edge poles (view/piste-poles.js, sorted by s) from just behind the camera to DRAW_AHEAD_M past it, far
 * to near: a stick in the run's colour, the right-hand ones with an orange top. sprites: the Look's. Returns the number
 * drawn.
 */
export function drawPistePoles(ctx, camera, terrain, course, view, poles, sprites) {
 if (poles.length === 0) return 0;
 const cs = course.project(camera.x, camera.y, view.where).s;
 let lo = 0;
 let hi = poles.length;
 while (lo < hi) { // the first pole at or past cs - POLE_BEHIND_M
  const mid = (lo + hi) >> 1;
  if (poles[mid].s < cs - POLE_BEHIND_M) lo = mid + 1;
  else hi = mid;
 }
 const A = view.projA;
 const T = view.projB;
 const colours = sprites.pistePole;
 let n = 0;
 let last = lo;
 while (last < poles.length && poles[last].s <= cs + DRAW_AHEAD_M) last++;
 for (let i = last - 1; i >= lo; i--) {
  const p = poles[i];
  const gh = terrain.height(p.x, p.y);
  if (!projectInto(camera, p.x, p.y, gh, A) || !projectInto(camera, p.x, p.y, gh + PISTE_POLE.HEIGHT_M, T)) continue;
  ctx.lineWidth = Math.max(1, A.s * PISTE_POLE.HALF_M * 2);
  ctx.strokeStyle = colours[p.tone];
  ctx.beginPath();
  ctx.moveTo(A.X, A.Y);
  ctx.lineTo(T.X, T.Y);
  ctx.stroke();
  if (p.right) {
   const k = PISTE_POLE.TOP_M / PISTE_POLE.HEIGHT_M;
   ctx.strokeStyle = colours.rightTop;
   ctx.beginPath();
   ctx.moveTo(T.X + (A.X - T.X) * k, T.Y + (A.Y - T.Y) * k);
   ctx.lineTo(T.X, T.Y);
   ctx.stroke();
  }
  n++;
 }
 return n;
}
