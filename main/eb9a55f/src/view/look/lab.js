// The look lab (lab.html): every rider pose, rig, yaw and pitch, the terrain tones, palette and sprites, drawn
// through the Look side by side, to check a look at a glance. Not loaded by the game.
import { createHangaLook } from './hanga.js';
import { cssRgb, cssRgba } from './look.js';
import { drawRider } from '../rider-draw.js';
import { applyUiTokens } from '../../ui/dom.js';

const YAWS = Object.freeze([0, 45, 90, 135, 180, 225, 270, 315]); // deg, rider turned right of the view
const PITCHES = Object.freeze([6, 20, 45]); // deg the camera looks down on the rider
const CELL_W = 64;        // CSS px per rider cell
const CELL_H = 84;
const LABEL_W = 84;       // CSS px, the pose names' column
const HEAD_H = 34;        // CSS px, the yaw and pitch headings
const PX_PER_M = 34;      // CSS px per m of rider
const SHADOW_ALPHA = 0.55; // as the game draws it (view/draw.js)
const SWATCH = 46;        // CSS px, a terrain or palette swatch
const FONT = '11px "Trebuchet MS",system-ui,sans-serif';

// A canvas w × h CSS px at the pixel ratio, appended to parent; returns its 2D context scaled to CSS px.
function canvas(doc, parent, w, h, ratio) {
 const c = doc.createElement('canvas');
 c.width = Math.round(w * ratio);
 c.height = Math.round(h * ratio);
 c.style.width = w + 'px';
 c.style.height = h + 'px';
 parent.appendChild(c);
 const ctx = c.getContext('2d');
 ctx.scale(ratio, ratio);
 ctx.font = FONT;
 return ctx;
}

function heading(doc, parent, text) {
 const h = doc.createElement('h2');
 h.textContent = text;
 parent.appendChild(h);
}

// One rider in a cell whose feet sit at (x, y) CSS px: the shadow, then the draw list.
function riderAt(ctx, look, list, x, y) {
 ctx.save();
 ctx.translate(x, y);
 const shd = list.find((it) => it.kind === 'ellipse');
 if (shd) {
  ctx.globalAlpha = SHADOW_ALPHA;
  ctx.fillStyle = look.colour(shd.colour);
  ctx.beginPath();
  ctx.ellipse(shd.c[0] * PX_PER_M, -shd.c[1] * PX_PER_M, shd.rx * PX_PER_M, shd.ry * PX_PER_M, 0, 0, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
 }
 drawRider(ctx, look, PX_PER_M, list);
 ctx.restore();
}

// Every pose of one rig: a row per pose, a column per pitch and yaw.
function riderSheet(doc, parent, look, rig, stance, ratio) {
 const poses = look.rider.poses[rig];
 const cols = PITCHES.length * YAWS.length;
 const ctx = canvas(doc, parent, LABEL_W + cols * CELL_W, HEAD_H + poses.length * CELL_H, ratio);
 ctx.fillStyle = look.colour('pisteMid');
 ctx.fillRect(0, 0, LABEL_W + cols * CELL_W, HEAD_H + poses.length * CELL_H);
 ctx.fillStyle = look.colour('key');
 PITCHES.forEach((p, pi) => ctx.fillText('pitch ' + p + '°', LABEL_W + pi * YAWS.length * CELL_W + 4, 13));
 for (let i = 0; i < cols; i++) ctx.fillText(YAWS[i % YAWS.length] + '°', LABEL_W + i * CELL_W + 4, 28);
 const view = { yawDeg: 0, pitchDeg: 0, stance };
 poses.forEach((pose, row) => {
  const y = HEAD_H + row * CELL_H;
  ctx.fillStyle = look.colour('key');
  ctx.fillText(pose, 4, y + CELL_H / 2);
  for (let i = 0; i < cols; i++) {
   view.pitchDeg = PITCHES[Math.floor(i / YAWS.length)];
   view.yawDeg = YAWS[i % YAWS.length];
   riderAt(ctx, look, look.rider.project(rig, pose, view), LABEL_W + (i + 0.5) * CELL_W, y + CELL_H - 12);
  }
 });
}

// The colour map's snow tones (lit across, surface down), then the fog over each with distance.
function terrainSheet(doc, parent, look, ratio) {
 const LITS = [0, 0.25, 0.5, 0.75, 1];
 const ROWS = [['powder', 0, 0, 0], ['groomed +', 1, 1, 0], ['groomed −', 1, -1, 0], ['half rock', 0, 0, 0.5],
  ['rock', 0, 0, 1], ['hollow', 0, 0, 0, 1], ['ridge', 0, 0, 0, -1]];
 const FOG_STEPS = 8;
 const w = LABEL_W + (LITS.length + 1 + FOG_STEPS) * SWATCH;
 const ctx = canvas(doc, parent, w, HEAD_H + ROWS.length * SWATCH, ratio);
 ctx.fillStyle = look.colour('paper');
 ctx.fillRect(0, 0, w, HEAD_H + ROWS.length * SWATCH);
 ctx.fillStyle = look.colour('key');
 LITS.forEach((l, i) => ctx.fillText('lit ' + l, LABEL_W + i * SWATCH + 2, 28));
 ctx.fillText('lit 1, fog to the far edge →', LABEL_W + (LITS.length + 1) * SWATCH, 28);
 const rgb = [0, 0, 0];
 const fog = look.fog.rgb;
 const far = 300; // m, about the render's far edge
 ROWS.forEach(([name, groomed, wave, rock, cavity = 0], r) => {
  const y = HEAD_H + r * SWATCH;
  ctx.fillStyle = look.colour('key');
  ctx.fillText(name, 4, y + SWATCH / 2);
  LITS.forEach((lit, i) => {
   look.terrainTone(lit, groomed, wave, rock, rgb, cavity);
   ctx.fillStyle = cssRgb(rgb[0] | 0, rgb[1] | 0, rgb[2] | 0);
   ctx.fillRect(LABEL_W + i * SWATCH, y, SWATCH - 2, SWATCH - 2);
  });
  look.terrainTone(1, groomed, wave, rock, rgb, cavity);
  for (let k = 0; k < FOG_STEPS; k++) {
   const f = look.fog.amount(far * (k + 1) / FOG_STEPS, far);
   const mix = (i) => (rgb[i] + (fog[i] - rgb[i]) * f) | 0;
   ctx.fillStyle = cssRgb(mix(0), mix(1), mix(2));
   ctx.fillRect(LABEL_W + (LITS.length + 1 + k) * SWATCH, y, SWATCH - 2, SWATCH - 2);
  }
 });
}

// Every colour role with its name, in rows.
function paletteSheet(doc, parent, look, ratio) {
 const PER_ROW = 12;
 const CELL = 82;
 const rows = Math.ceil(look.roles.length / PER_ROW);
 const ctx = canvas(doc, parent, PER_ROW * CELL, rows * (SWATCH + 18), ratio);
 ctx.fillStyle = look.colour('paper');
 ctx.fillRect(0, 0, PER_ROW * CELL, rows * (SWATCH + 18));
 look.roles.forEach((role, i) => {
  const x = (i % PER_ROW) * CELL;
  const y = Math.floor(i / PER_ROW) * (SWATCH + 18);
  ctx.fillStyle = look.colour(role);
  ctx.fillRect(x + 2, y + 2, CELL - 6, SWATCH - 4);
  ctx.strokeStyle = look.colour('key');
  ctx.strokeRect(x + 2, y + 2, CELL - 6, SWATCH - 4);
  ctx.fillStyle = look.colour('key');
  ctx.fillText(role, x + 2, y + SWATCH + 10);
 });
}

// A pole with its pennant, as view/sprites.js draws one, at (x, y) px on the snow, h px tall.
function pennant(ctx, look, x, y, h, colour) {
 ctx.strokeStyle = look.sprites.pole.colour;
 ctx.lineWidth = 2;
 ctx.beginPath();
 ctx.moveTo(x, y);
 ctx.lineTo(x, y - h);
 ctx.stroke();
 ctx.fillStyle = colour;
 ctx.beginPath();
 ctx.moveTo(x, y - h);
 ctx.lineTo(x + h * 0.4, y - h + h * 0.125);
 ctx.lineTo(x, y - h + h * 0.25);
 ctx.closePath();
 ctx.fill();
}

// A bar on posts (rail or box), as view/sprites.js draws them.
function bar(ctx, look, x, y, w, colour, width) {
 ctx.strokeStyle = look.sprites.pole.colour;
 ctx.lineWidth = 2;
 for (let px = x; px <= x + w; px += w / 3) {
  ctx.beginPath();
  ctx.moveTo(px, y);
  ctx.lineTo(px, y + 18);
  ctx.stroke();
 }
 ctx.strokeStyle = colour;
 ctx.lineWidth = width;
 ctx.lineCap = 'round';
 ctx.beginPath();
 ctx.moveTo(x, y);
 ctx.lineTo(x + w, y);
 ctx.stroke();
}

// A tree crown as view/draw.js stacks it, h px tall, mixed f (0..1) toward the fog.
function tree(ctx, look, x, y, h, f) {
 const t = look.sprites.tree.rgb;
 const fog = look.fog.rgb;
 const mix = (i) => (t[i] + (fog[i] - t[i]) * f) | 0;
 ctx.fillStyle = cssRgb(mix(0), mix(1), mix(2));
 for (let j = 0; j < 3; j++) {
  const by = y - h * (0.12 + 0.27 * j);
  const w = h * (0.34 - 0.07 * j);
  ctx.beginPath();
  ctx.moveTo(x - w, by);
  ctx.lineTo(x + w, by);
  ctx.lineTo(x, by - h * 0.42);
  ctx.fill();
 }
}

// The sky gradient and sun, then the sprites on the snow: flags, rail, box, trees through the fog, spray.
function spriteSheet(doc, parent, look, ratio) {
 const W = 760;
 const H = 220;
 const HORIZON = 90;
 const ctx = canvas(doc, parent, W, H, ratio);
 const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
 for (const [o, c] of look.sky.stops) sky.addColorStop(o, c);
 ctx.fillStyle = sky;
 ctx.fillRect(0, 0, W, HORIZON);
 ctx.fillStyle = look.sky.sun.colour;
 ctx.beginPath();
 ctx.arc(W * 0.8, HORIZON - look.sky.sun.aboveHorizonFrac * H, W * look.sky.sun.radiusFracOfWidth, 0, 7);
 ctx.fill();
 ctx.fillStyle = look.colour('pisteLit');
 ctx.fillRect(0, HORIZON, W, H - HORIZON);
 const ground = H - 30;
 pennant(ctx, look, 30, ground, 60, look.sprites.flag.kicker);
 pennant(ctx, look, 80, ground, 70, look.sprites.flag.bigKicker);
 pennant(ctx, look, 130, ground, 44, look.sprites.rail.colour);
 pennant(ctx, look, 170, ground, 44, look.sprites.box.colour);
 bar(ctx, look, 210, ground - 30, 120, look.sprites.rail.colour, 4);
 bar(ctx, look, 360, ground - 26, 120, look.sprites.box.colour, 9);
 [0, 0.3, 0.6, 0.9].forEach((f, i) => tree(ctx, look, 520 + i * 45, ground, 70 - i * 10, f));
 const sp = look.sprites.spray;
 for (let k = 0; k < 6; k++) {
  ctx.fillStyle = cssRgba(sp.rgb, sp.maxAlpha * (1 - k / 6));
  ctx.beginPath();
  ctx.arc(710, ground - 20 - k * 22, 6 + k * 2, 0, 7);
  ctx.fill();
 }
 ctx.fillStyle = look.colour('key');
 ctx.fillText('flags: kicker, big kicker, rail, box · rail · box · trees through fog · spray by age', 8, H - 8);
}

/**
 * Builds the look lab into env.document's body. env: {document, devicePixelRatio, HANGA, RiderAnim} (lab.html builds
 * it from the browser). Returns the Look it drew.
 */
export function createLab(env) {
 const doc = env.document;
 const look = createHangaLook(env.HANGA, env.RiderAnim);
 const ratio = Math.min(2, env.devicePixelRatio || 1);
 applyUiTokens(doc, look.ui);
 const body = doc.body;
 const title = doc.createElement('h1');
 title.textContent = 'Look lab · ' + look.version;
 body.appendChild(title);
 heading(doc, body, 'Skier: every pose × 8 yaws × 3 pitches');
 riderSheet(doc, body, look, 'ski', 'regular', ratio);
 heading(doc, body, 'Snowboarder (regular)');
 riderSheet(doc, body, look, 'board', 'regular', ratio);
 heading(doc, body, 'Snowboarder (goofy)');
 riderSheet(doc, body, look, 'board', 'goofy', ratio);
 heading(doc, body, 'Terrain tones and fog');
 terrainSheet(doc, body, look, ratio);
 heading(doc, body, 'Sky, sun and sprites');
 spriteSheet(doc, body, look, ratio);
 heading(doc, body, 'Palette: every colour role');
 paletteSheet(doc, body, look, ratio);
 return look;
}
