// Design tool (S6): recomputes every El Tarter data-derived value in art/gresca-hanga-spec.js (maps['el-tarter'] data
// keys and each Pyrenees peak's bearing, distance, elevation angle and horizon) from the current baked files in
// maps/, and rewrites them in place. Run it again after a rebake: node docs/art/v1.5/derive.mjs. Prints what moved.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createProjection } from '../../../tools/map-compiler/core.js';
import { selectParts, runCourse, terrainLayer, computeHorizon } from '../../../src/world/map-file/course-run.js';

const require = createRequire(import.meta.url);
const ROOT = new URL('../../../', import.meta.url);
const SPEC = new URL('art/gresca-hanga-spec.js', ROOT);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, ROOT), 'utf8'));
const RAD_TO_DEG = 180 / Math.PI;
const r = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

const terrain = read('maps/el-tarter.terrain.json');
const course = read('maps/el-tarter.course.json');
const layer = terrainLayer(terrain);
const run = runCourse(terrain, selectParts(terrain, course.run).parts, layer);
const at = (s) => {
 const p = run.point(s, 0, {});
 return { x: p.x, y: p.y, z: layer.height(p.x, p.y) };
};
const start = at(course.startS);
const end = at(course.finishS);
const spec = require('../../../art/gresca-hanga-spec.js');
const tarter = spec.maps['el-tarter'];
const tl = tarter.treeline;

const fall = (Math.atan2(end.x - start.x, end.y - start.y) * RAD_TO_DEG + 360) % 360;
const crossings = {};
let previous = start.z;
for (let s = course.startS + 1; s <= course.finishS; s++) {
 const z = at(s).z;
 for (const id of ['krummholz', 'open', 'thinning', 'forest']) {
  const level = tl.bandUpToM[id];
  if (!(id in crossings) && (previous - level) * (z - level) <= 0) crossings[id] = s;
 }
 previous = z;
}
const values = {
 meanSlopeDegData: course.meanSlopeDeg,
 startWorld: { x: r(start.x, 1), y: r(start.y, 1) },
 courseAltitudeM: { start: r(start.z, 1), finish: r(end.z, 1) },
 heightRangeM: { min: terrain.heights.minM, max: terrain.heights.maxM },
 fallLineCompassDeg: r(fall, 0),
 sunData: { azimuthDeg: course.sun.azimuthDeg, elevationDeg: course.sun.elevationDeg },
};

let text = fs.readFileSync(SPEC, 'utf8');
const changes = [];
function swap(label, pattern, replacement) {
 const m = pattern.exec(text);
 if (!m) throw new Error('not found: ' + label);
 if (m[0] !== replacement) changes.push(`${label}: ${m[0].trim()} -> ${replacement.trim()}`);
 text = text.replace(pattern, () => replacement);
}
swap('meanSlopeDegData', /"meanSlopeDegData": [\d.]+/, `"meanSlopeDegData": ${values.meanSlopeDegData}`);
const block = (key, o) => {
 const body = Object.entries(o).map(([k, v]) => `    "${k}": ${v}`).join(',\n');
 return `   "${key}": {\n${body}\n   }`;
};
swap('startWorld', /   "startWorld": \{[^}]*\}/, block('startWorld', values.startWorld));
swap('courseAltitudeM', /   "courseAltitudeM": \{[^}]*\}/, block('courseAltitudeM', values.courseAltitudeM));
swap('heightRangeM', /   "heightRangeM": \{[^}]*\}/, block('heightRangeM', values.heightRangeM));
swap('sunData', /   "sunData": \{[^}]*\}/, block('sunData', values.sunData));
swap('fallLineCompassDeg', /"fallLineCompassDeg": [\d.]+/, `"fallLineCompassDeg": ${values.fallLineCompassDeg}`);
swap('courseBandStartS', /    "courseBandStartS": \{[^}]*\}/,
 '    "courseBandStartS": {\n' + ['krummholz', 'open', 'thinning', 'forest'].map((id) => `     "${id}": ${crossings[id]}`).join(',\n') + '\n    }');

const sunOff = (az) => Math.round(Math.abs(((az - values.fallLineCompassDeg + 540) % 360) - 180));
const note = 'Data-derived values from maps/el-tarter.course.json and maps/el-tarter.terrain.json (recomputed by '
 + 'docs/art/v1.5/derive.mjs); the art-directed keys above are unchanged. meanSlopeDegData is the course file\'s '
 + `meanSlopeDeg, atan(drop / length) = atan((${r(start.z, 1).toFixed(1)} - ${r(end.z, 1).toFixed(1)}) / `
 + `${r(course.finishS - course.startS, 1)}) between startS ${course.startS} and finishS ${course.finishS}. `
 + 'heightRangeM is the terrain file\'s heights minM and maxM. courseAltitudeM is the ground height at s = startS '
 + 'and s = finishS. startWorld is the course point at s = startS (world x east, y north, m from the terrain origin '
 + `${terrain.origin.lat} N, ${terrain.origin.lon} E). fallLineCompassDeg is the compass bearing from the start to the `
 + `finish. sunData is the sun the baker put in the course file, which is not the art-directed sun above: the baked `
 + `azimuth ${course.sun.azimuthDeg} is ${sunOff(course.sun.azimuthDeg)} degrees off the fall line, as terrain.sun.rule `
 + `asks; the art-directed ${tarter.sun.azimuthDeg} is ${sunOff(tarter.sun.azimuthDeg)} degrees off it. Which wins is `
 + 'open (see HANGA-v1.5.md).';
swap('dataNote', /"dataNote": "[^\n]*"/, `"dataNote": ${JSON.stringify(note)}`);

// the peaks, from lat/lon
const projection = createProjection(terrain.origin.lat, terrain.origin.lon);
const horizon = computeHorizon(terrain, layer, start.x, start.y, 1);
const enu = {};
for (const p of spec.environment.backdrops.pyrenees.peaks) {
 projection.toEnu(p.lat, p.lon, enu);
 const dx = enu.x - start.x;
 const dy = enu.y - start.y;
 const dist = Math.hypot(dx, dy);
 const bearingEnu = (Math.atan2(dy, dx) * RAD_TO_DEG + 360) % 360;
 const compass = (90 - bearingEnu + 360) % 360;
 const fresh = {
  bearingEnuDeg: r(bearingEnu, 1), bearingCompassDeg: r(compass, 1), distM: Math.round(dist),
  elevDeg: r(Math.atan2(p.altM - start.z, dist) * RAD_TO_DEG, 2),
  horizonAtStartDeg: r(horizon[Math.round(compass) % 360], 1),
 };
 for (const [key, value] of Object.entries(fresh)) {
  const pattern = new RegExp(`("id": "${p.id}"[\\s\\S]*?"${key}": )(-?[\\d.]+)`);
  const m = pattern.exec(text);
  if (!m) throw new Error(`not found: ${p.id}.${key}`);
  if (Number(m[2]) !== value) changes.push(`${p.id}.${key}: ${m[2]} -> ${value}`);
  text = text.replace(pattern, (_, head) => head + value);
 }
}
fs.writeFileSync(SPEC, text);
console.log(changes.length ? changes.join('\n') : 'nothing moved');
