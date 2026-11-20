// Rider contact sheet: lays out HANGA.projectRider draw lists in a grid and draws them with the game's drawRider.
import { drawRider } from '../src/view/rider-draw.js';

const HANGA = window.HANGA;
const CELL_W = 118;        // px per cell
const CELL_H = 150;        // px per cell
const LABEL_W = 96;        // px, row label column
const HEADER_H = 34;       // px, column header rows
const PX_PER_M = 52;       // px per metre: the rider is about 92 px tall
const FEET_FROM_TOP = 118; // px, where the feet's ground point sits in a cell
const YAWS = [0, 45, 90, 135, 180];         // deg, rider heading minus camera heading
const CAMERA_PITCHES = [20, 37];            // deg, the v1.3 fixed value and the terrain camera's look-down

// One column of a sheet: header text and the options passed to projectRider.
const col = (label, yaw, options) => ({ label, yaw, options });

const SHEETS = {
  poses: (rig) => ({
    rows: HANGA.rider.poseOrder[rig].map((pose) => ({ label: pose, pose })),
    cols: CAMERA_PITCHES.flatMap((p) => YAWS.map((y) => col(`yaw ${y} · cam ${p}`, y, { cameraPitchDeg: p }))),
  }),
  head: (rig) => ({
    rows: (rig === 'ski' ? ['ride', 'switchR', 'switchL'] : ['ride', 'brakeToe']).map((pose) => ({ label: pose, pose })),
    cols: [0, 90, 180].flatMap((y) => [-90, 0, 90].map((h) => col(`yaw ${y} · head ${h}`, y, { headYawDeg: h }))),
  }),
  pitch: (rig) => ({
    rows: ['tuck', 'air'].map((pose) => ({ label: pose, pose })),
    cols: [0, 90].flatMap((y) => [0, 90, 180, 270].map((b) => col(`yaw ${y} · pitch ${b}`, y, { bodyPitchDeg: b }))),
  }),
  brake: (rig) => ({
    rows: (rig === 'ski' ? ['brakeL', 'brakeR'] : ['brakeHeel', 'brakeToe']).map((pose) => ({ label: pose, pose })),
    cols: YAWS.concat([-90]).map((y) => col(`upper yaw ${y}`, y, { cameraPitchDeg: 37 })),
  }),
};

const params = new URLSearchParams(location.search);
const sheetName = params.get('sheet') || 'poses';
const stance = params.get('stance') || 'regular';
const rigs = ['ski', 'board'].map((rig) => ({ rig, ...SHEETS[sheetName](rig) }));
const maxCols = Math.max(...rigs.map((r) => r.cols.length));
const totalRows = rigs.reduce((n, r) => n + r.rows.length, 0);

const canvas = document.getElementById('sheet');
canvas.width = LABEL_W + maxCols * CELL_W;
canvas.height = rigs.length * HEADER_H + totalRows * CELL_H;
const c = canvas.getContext('2d');
c.fillStyle = HANGA.colour('pisteLit');
c.fillRect(0, 0, canvas.width, canvas.height);
c.font = '11px sans-serif';

// The shadow ellipse, which the game draws on the ground before the rider.
function drawShadow(list) {
  const s = list.find((it) => it.kind === 'ellipse');
  c.fillStyle = HANGA.colour(s.colour);
  c.beginPath();
  c.ellipse(s.c[0] * PX_PER_M, -s.c[1] * PX_PER_M, s.rx * PX_PER_M, Math.max(0.5, s.ry * PX_PER_M), 0, 0, 7);
  c.fill();
}

let top = 0;
for (const r of rigs) {
  c.fillStyle = HANGA.colour('key');
  c.fillText(`${r.rig} (${stance})`, 4, top + 14);
  r.cols.forEach((cl, i) => c.fillText(cl.label, LABEL_W + i * CELL_W + 4, top + 28));
  top += HEADER_H;
  for (const row of r.rows) {
    c.fillStyle = HANGA.colour('key');
    c.fillText(row.label, 4, top + CELL_H / 2);
    r.cols.forEach((cl, i) => {
      const list = HANGA.projectRider(r.rig, row.pose, cl.yaw, null, 0, stance, cl.options);
      c.save();
      c.translate(LABEL_W + i * CELL_W + CELL_W / 2, top + FEET_FROM_TOP);
      drawShadow(list);
      drawRider(c, HANGA, PX_PER_M, list);
      c.restore();
    });
    c.strokeStyle = HANGA.colour('paperS');
    c.strokeRect(0.5, top + 0.5, canvas.width - 1, CELL_H);
    top += CELL_H;
  }
}
document.body.dataset.ready = 'yes';
