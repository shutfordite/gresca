// The sky (the Look's sky and fog): the gradient above the horizon, the sun disc at the map's sun azimuth, the fog.
import { RAY_FAR } from '../core/config.js';
import { camCompass } from './camera.js';

/** 0..1, how much fog at z m from the camera (fog: the Look's fog; full at the far edge of the render). */
export const fogAt = (fog, z) => fog.amount(z, RAY_FAR);

/**
 * The sun's compass azimuth (deg) in the world: the Look's sky.sun, turned with the map frame (rad, counter-
 * clockwise). The procedural map is fictional, so its sun is fixed to the map; a real map has rotation 0 and its
 * true azimuth (docs/adr/0005-enu-frame.md).
 */
export const sunAzimuthDeg = (sky, frame) => sky.sun.azimuthDeg - frame.rotation * 180 / Math.PI;

/**
 * Sun disc on screen, {X, Y, r, on} in canvas px: at the map's sun azimuth (sky: the Look's sky; frame: the
 * MapFrame), just above the horizon. Written into `out` if given (a scratch object, no allocation), else a new object.
 */
export function sunDisc(sky, camera, W, Hh, frame, out = {}) {
 const S = sky.sun;
 const az = sunAzimuthDeg(sky, frame);
 const rel = ((az - camCompass(camera) + 540) % 360 - 180) * Math.PI / 180;
 const r = W * S.radiusFracOfWidth;
 const X = (rel / camera.fov + 0.5) * W;
 const Y = (camera.horizonPx - camera.pitchPx) * camera.pixelScale - S.aboveHorizonFrac * Hh;
 out.X = X;
 out.Y = Y;
 out.r = r;
 out.on = Math.abs(rel) < Math.PI / 2 && X > -r && X < W + r && Y > -r;
 return out;
}

/** Fills the W × Hh screen with the sky gradient (sky: the Look's sky) down to the horizon line. */
export function drawSky(ctx, sky, camera, W, Hh) {
 const hy = Math.max(1, (camera.horizonPx - camera.pitchPx) * camera.pixelScale);
 const sg = ctx.createLinearGradient(0, 0, 0, hy);
 for (const [o, colour] of sky.stops) sg.addColorStop(o, colour);
 ctx.fillStyle = sg;
 ctx.fillRect(0, 0, W, Hh);
}

/** Draws the sun disc if it is on screen (sky: the Look's sky; frame: the MapFrame; scratch: see sunDisc()). */
export function drawSun(ctx, sky, camera, W, Hh, frame, scratch = {}) {
 const s = sunDisc(sky, camera, W, Hh, frame, scratch);
 if (!s.on) return;
 ctx.fillStyle = sky.sun.colour;
 ctx.beginPath();
 ctx.arc(s.X, s.Y, s.r, 0, 7);
 ctx.fill();
}
