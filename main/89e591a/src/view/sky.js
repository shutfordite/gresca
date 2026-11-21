// The sky (spec sky): the gradient above the horizon, the sun disc at the map's sun azimuth, and the fog amount.
import { FOV, MAP_ID, RAY_FAR } from '../core/config.js';
import { camCompass } from './camera.js';

/** 0..1, how much fog at z m from the camera (spec terrain.fog, full at the far edge of the render). */
export const fogAt = (hanga, z) => hanga.fogAmount(z, RAY_FAR);

/**
 * The sun's compass azimuth (deg) in the world: the spec's maps[id].sun, turned with the map frame (rad, counter-
 * clockwise). The procedural map is fictional, so its sun is fixed to the map; a real map has rotation 0 and its
 * true azimuth (docs/adr/0005-enu-frame.md).
 */
export const sunAzimuthDeg = (hanga, frame) => hanga.maps[MAP_ID].sun.azimuthDeg - frame.rotation * 180 / Math.PI;

/**
 * Sun disc on screen, {X, Y, r, on} in canvas px: at the map's sun azimuth (frame: the MapFrame), just above the
 * horizon (spec sky.sun).
 */
export function sunDisc(hanga, camera, W, Hh, frame) {
 const S = hanga.sky.sun;
 const az = sunAzimuthDeg(hanga, frame);
 const rel = ((az - camCompass(camera) + 540) % 360 - 180) * Math.PI / 180;
 const r = W * S.radiusFracOfWidth;
 const X = (rel / FOV + 0.5) * W;
 const Y = (camera.horizonPx - camera.pitchPx) * camera.pixelScale - S.aboveHorizonFrac * Hh;
 return { X, Y, r, on: Math.abs(rel) < Math.PI / 2 && X > -r && X < W + r && Y > -r };
}

/** Fills the W × Hh screen with the sky gradient down to the horizon line. */
export function drawSky(ctx, hanga, camera, W, Hh) {
 const hy = Math.max(1, (camera.horizonPx - camera.pitchPx) * camera.pixelScale);
 const sg = ctx.createLinearGradient(0, 0, 0, hy);
 for (const [o, role] of hanga.sky.stops) sg.addColorStop(o, hanga.colour(role));
 ctx.fillStyle = sg;
 ctx.fillRect(0, 0, W, Hh);
}

/** Draws the sun disc if it is on screen (frame: the MapFrame). */
export function drawSun(ctx, hanga, camera, W, Hh, frame) {
 const s = sunDisc(hanga, camera, W, Hh, frame);
 if (!s.on) return;
 ctx.fillStyle = hanga.colour(hanga.sky.sun.colour);
 ctx.beginPath();
 ctx.arc(s.X, s.Y, s.r, 0, 7);
 ctx.fill();
}
