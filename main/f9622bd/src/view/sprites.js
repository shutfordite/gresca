// Sprites on the 3D view: project() to the screen, flags and poles at the kickers and rails, rails and boxes.
import { FOV } from '../core/config.js';
import { KICK, KBIG, RAILS, cx } from '../world/course.js';

const NEAR_M = 3;          // m, nearer than this along the view is not drawn
const FOV_MARGIN = 0.08;   // rad, project() keeps points this far outside the field of view
const DRAW_AHEAD_M = 260;  // m down the map past the camera that flags and rails are drawn
const POLE_COLOUR = '#3a3f58';
const KICKER_FLAG = '#ff6b3d';
const BIG_KICKER_FLAG = '#ffd23d';
const RAIL_COLOUR = '#c9372c';
const BOX_COLOUR = '#6fcfa0';
const RAIL_SEGMENT_M = 1.5; // m, rails are drawn as segments this long, so the near end can run off screen
const RAIL_POST_EVERY_M = 6; // m between the posts under a rail

/**
 * Screen position of a map point (wx, wy) (m) at altitude h (m), in canvas px: {X, Y, s (px per m at that distance),
 * f (m along the view), z (m from the camera)}, or null if behind or off to the side. Allocates the result.
 */
export function project(camera, wx, wy, h) {
 const ox = wx - camera.x;
 const oy = wy - camera.y;
 const f = ox * camera.dirX + oy * camera.dirY;
 if (f < NEAR_M) return null;
 const r = -ox * camera.dirY + oy * camera.dirX;
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

// A pole hgt m tall at (wx, wy) with a pennant of the given colour. Returns 1 if drawn, else 0.
function pole(ctx, camera, terrain, wx, wy, hgt, color) {
 const gh = terrain.height(wx, wy);
 const A = project(camera, wx, wy, gh);
 const T = project(camera, wx, wy, gh + hgt);
 if (!A || !T) return 0;
 ctx.strokeStyle = POLE_COLOUR;
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
 * of each rail, so features can be spotted from far up the slope. Returns the number of flags drawn.
 */
export function drawFlags(ctx, camera, terrain) {
 let n = 0;
 const cy = camera.y;
 for (const k of KICK) {
  if (k + 5 < cy || k - 11 > cy + DRAW_AHEAD_M) continue;
  const big = KBIG.includes(k);
  const c = cx(k);
  const h = big ? 3.2 : 2.4;
  n += pole(ctx, camera, terrain, c - 11, k, h, KICKER_FLAG);
  n += pole(ctx, camera, terrain, c + 11, k, h, KICKER_FLAG);
  if (big) {
   n += pole(ctx, camera, terrain, c - 11, k - 8, h, BIG_KICKER_FLAG);
   n += pole(ctx, camera, terrain, c + 11, k - 8, h, BIG_KICKER_FLAG);
  }
 }
 for (const r of RAILS) {
  if (r.y1 < cy || r.y0 > cy + DRAW_AHEAD_M) continue;
  const colour = r.t === 'box' ? BOX_COLOUR : RAIL_COLOUR;
  n += pole(ctx, camera, terrain, r.x0 + (r.x0 > cx(r.y0) ? 3 : -3), r.y0, 1.8, colour);
 }
 return n;
}

/** Rails are red bars on posts, boxes are wider mint-green bars. Returns the number of segments drawn. */
export function drawRails(ctx, camera, terrain) {
 let n = 0;
 for (const r of RAILS) {
  if (r.y1 < camera.y - 5 || r.y0 > camera.y + DRAW_AHEAD_M) continue;
  const isBox = r.t === 'box';
  let prev = null;
  for (let t = 0; t <= r.len + 0.01; t += RAIL_SEGMENT_M) {
   const tt = Math.min(t, r.len);
   const wx = r.x0 + r.dx * tt;
   const wy = r.y0 + r.dy * tt;
   const gh = terrain.height(wx, wy);
   const P = project(camera, wx, wy, gh + r.h);
   if (P && prev) {
    ctx.strokeStyle = isBox ? BOX_COLOUR : RAIL_COLOUR;
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
     ctx.strokeStyle = POLE_COLOUR;
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
