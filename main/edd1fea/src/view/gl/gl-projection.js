// The GL terrain's projection, the same as the 2D sprites' (sprites.js projectInto): uniforms, GLSL and a JS mirror.
// The game's view is not a pinhole camera: screen columns are linear in the angle across the field of view (as the
// raycaster's columns were), rows are a pinhole in the distance along the view, shifted by the slope-follow tilt. So
// the terrain's vertex shader projects each vertex itself (PROJECT_GLSL) instead of using a three.js camera matrix.
import { FOV } from '../../core/config.js';

export const NEAR_M = 0.5;  // m along the view, nearer is clipped (the ground there is below the bottom of the screen)
export const FAR_M = 600;   // m along the view, the depth range's far end (past the terrain's last sample)

/**
 * A new projection: cam (x, y m world, height m), dir (unit view direction, world), focalC (canvas px per unit of
 * height / distance), rowC (canvas px from the top: the tilted horizon), W, Hh (canvas px), fov (rad). Plain numbers:
 * gl-renderer.js copies them into its uniforms.
 */
export const createProjection = () => ({
 x: 0, y: 0, height: 0, dirX: 1, dirY: 0, focalC: 1, rowC: 0, W: 1, Hh: 1, fov: FOV,
});

/** Fills p from the camera (view/camera.js, set by updateCamera()) for a W × Hh canvas (px). Returns p. */
export function setProjection(p, camera, W, Hh) {
 const kx = camera.pixelScale;
 p.x = camera.x;
 p.y = camera.y;
 p.height = camera.height;
 p.dirX = camera.dirX;
 p.dirY = camera.dirY;
 p.focalC = camera.focalPx * kx;
 p.rowC = (camera.horizonPx - camera.pitchPx) * kx;
 p.W = W;
 p.Hh = Hh;
 return p;
}

/**
 * GLSL ES 3.0: projectToClip(o, h), the clip position of a point o (m, world offset from the camera) at altitude h
 * (m). Clip w is the distance along the view, so the GPU's divide and its perspective-correct varyings work as for a
 * pinhole; only x is non-linear (an angle), which the 1 m triangles near the camera keep within a pixel or two.
 */
export const PROJECT_GLSL = `
uniform vec3 uCam;    // camera x, y (m, world) and altitude (m)
uniform vec2 uDir;    // unit view direction (world)
uniform vec4 uScreen; // focal (canvas px), tilted horizon row (canvas px from the top), canvas W, Hh (px)
uniform vec3 uClip;   // field of view (rad), near and far (m along the view)
vec4 projectToClip(vec2 o, float h) {
 float f = dot(o, uDir);
 float r = o.x * uDir.y - o.y * uDir.x;
 float ndcX = 2.0 * atan(r, max(f, 1e-4)) / uClip.x;
 float rowPx = (uCam.z - h) * uScreen.x + uScreen.y * f; // canvas px from the top, times f
 float yClip = f - 2.0 * rowPx / uScreen.w;
 float n = uClip.y;
 float fa = uClip.z;
 float zClip = (fa + n) / (fa - n) * f - 2.0 * fa * n / (fa - n);
 return vec4(ndcX * f, yClip, zClip, f);
}
`;

const F = Math.fround; // the GPU works in 32-bit floats: the mirror rounds as it does

/**
 * The JS mirror of PROJECT_GLSL in 32-bit arithmetic: the canvas position (px, from the top left) of world point
 * (wx, wy) m at altitude h m into out {X, Y, f (m along the view)}. Returns false if behind the near plane.
 */
export function projectGl(p, wx, wy, h, out) {
 const ox = F(F(wx) - F(p.x));
 const oy = F(F(wy) - F(p.y));
 const f = F(F(ox * F(p.dirX)) + F(oy * F(p.dirY)));
 if (f < NEAR_M) return false;
 const r = F(F(ox * F(p.dirY)) - F(oy * F(p.dirX)));
 const ndcX = F(F(2 * F(Math.atan2(r, f))) / F(p.fov));
 const rowPx = F(F(F(F(p.height) - F(h)) * F(p.focalC)) + F(F(p.rowC) * f));
 const yClip = F(f - F(F(2 * rowPx) / F(p.Hh)));
 const ndcY = F(yClip / f);
 out.X = (ndcX + 1) / 2 * p.W;
 out.Y = (1 - ndcY) / 2 * p.Hh;
 out.f = f;
 return true;
}
