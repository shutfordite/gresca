// Sprites on the 3D view: project() to the screen, flags and poles at the kickers and rails, rails and boxes.
import { FOV } from '../core/config.js';

const NEAR_M = 3;          // m, nearer than this along the view is not drawn
const FOV_MARGIN = 0.08;   // rad, project() keeps points this far outside the field of view
const DRAW_AHEAD_M = 260;  // m down the piste (along s) past the camera that flags and rails are drawn
const RAIL_SEGMENT_M = 1.5; // m, rails are drawn as segments this long, so the near end can run off screen
const RAIL_POST_EVERY_M = 6; // m between the posts under a rail
const KICKER_FLAG_D = 11;  // m across from a kicker's centre to its flags
const RAMP_FLAG_BACK_M = 8; // m up the ramp from the lip to a big kicker's second pair of flags
const KICKER_RAMP_M = 11;  // m, a kicker's ramp runs this far up from the lip (along s)
const KICKER_DROP_M = 5;   // m, and its drop this far past it
const RAIL_BEHIND_M = 5;   // m up the piste behind the camera that rails are still drawn
const RAIL_FLAG_D = 3;     // m further out than a rail's start, its flag

/**
 * Screen position of a world point (wx, wy) (m) at altitude h (m), in canvas px: {X, Y, s (px per m at that
 * distance), f (m along the view), z (m from the camera)}, or null if behind or off to the side. Allocates the result.
 */
export function project(camera, wx, wy, h) {
 const ox = wx - camera.x;
 const oy = wy - camera.y;
 const f = ox * camera.dirX + oy * camera.dirY;
 if (f < NEAR_M) return null;
 const r = ox * camera.dirY - oy * camera.dirX; // m to the right of the view (clockwise of it)
 const p = Math.atan2(r, f);
 if (Math.abs(p) > FOV / 2 + FOV_MARGIN) return null;
 const kx = camera.pixelScale;
 return {
  X: (0.5 + p / FOV) * camera.renderW * kx,
  Y: ((camera.height - h) / f * camera.focalPx + camera.horizonPx - camera.pitchPx) * kx,
  s: camera.focalPx / f * kx,
  f,
  z: Math.hypot(f, r),
 };
}

// A pole hgt m tall at (wx, wy) with a pennant of the given colour (sprites: the Look's). Returns 1 if drawn, else 0.
function pole(ctx, camera, terrain, sprites, wx, wy, hgt, color) {
 const gh = terrain.height(wx, wy);
 const A = project(camera, wx, wy, gh);
 const T = project(camera, wx, wy, gh + hgt);
 if (!A || !T) return 0;
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
 * of each rail, so features can be spotted from far up the slope. course: the Course; view: its where and point
 * scratch; frame: the MapFrame (the big kickers' ramp flags and the rail flags are offset along the map's axes);
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
  n += pole(ctx, camera, terrain, sprites, P.x, P.y, h, flag.kicker);
  course.point(k.s, k.d + KICKER_FLAG_D, P);
  n += pole(ctx, camera, terrain, sprites, P.x, P.y, h, flag.kicker);
  if (k.big) {
   // Still placed up the map's grid from the lip (where they have always been drawn): C1 moves them to
   // point(s - RAMP_FLAG_BACK_M, d +- KICKER_FLAG_D), beside the ramp itself.
   frame.vecToWorld(-KICKER_FLAG_D, -RAMP_FLAG_BACK_M, P);
   n += pole(ctx, camera, terrain, sprites, k.x + P.x, k.y + P.y, h, flag.bigKicker);
   frame.vecToWorld(KICKER_FLAG_D, -RAMP_FLAG_BACK_M, P);
   n += pole(ctx, camera, terrain, sprites, k.x + P.x, k.y + P.y, h, flag.bigKicker);
  }
 }
 for (const r of course.rails) {
  if (r.s1 < cs || r.s0 > cs + DRAW_AHEAD_M) continue;
  const colour = r.t === 'box' ? sprites.box.colour : sprites.rail.colour;
  frame.vecToWorld(r.d > 0 ? RAIL_FLAG_D : -RAIL_FLAG_D, 0, P); // further out across the map than the rail
  n += pole(ctx, camera, terrain, sprites, r.x0 + P.x, r.y0 + P.y, 1.8, colour);
 }
 return n;
}

/**
 * Rails are red bars on posts, boxes are wider mint-green bars. course: the Course; view: its where scratch;
 * sprites: the Look's sprite colours. Returns the number of segments drawn.
 */
export function drawRails(ctx, camera, terrain, course, view, sprites) {
 let n = 0;
 const cs = course.project(camera.x, camera.y, view.where).s;
 for (const r of course.rails) {
  if (r.s1 < cs - RAIL_BEHIND_M || r.s0 > cs + DRAW_AHEAD_M) continue;
  const isBox = r.t === 'box';
  let prev = null;
  for (let t = 0; t <= r.len + 0.01; t += RAIL_SEGMENT_M) {
   const tt = Math.min(t, r.len);
   const wx = r.x0 + r.dx * tt;
   const wy = r.y0 + r.dy * tt;
   const gh = terrain.height(wx, wy);
   const P = project(camera, wx, wy, gh + r.h);
   if (P && prev) {
    ctx.strokeStyle = isBox ? sprites.box.colour : sprites.rail.colour;
    ctx.lineWidth = Math.max(isBox ? 5 : 3, P.s * (isBox ? 1.3 : 0.5));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.X, prev.Y);
    ctx.lineTo(P.X, P.Y);
    ctx.stroke();
    n++;
   }
   if (P && t % RAIL_POST_EVERY_M < RAIL_SEGMENT_M) {
    const G = project(camera, wx, wy, gh);
    if (G) {
     ctx.strokeStyle = sprites.pole.colour;
     ctx.lineWidth = Math.max(1, P.s * 0.12);
     ctx.beginPath();
     ctx.moveTo(P.X, P.Y);
     ctx.lineTo(G.X, G.Y);
     ctx.stroke();
    }
   }
   prev = P;
  }
 }
 return n;
}
