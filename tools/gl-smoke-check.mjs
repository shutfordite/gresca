// The pure half of the GPU smoke test (tools/gl-smoke.mjs): judges one frame the GPU terrain drew, from its pixels.

const MIN_COLOURS = 24; // distinct colours (quantised) a drawn terrain frame has at least; a blank one has 1–3
const MIN_SPREAD = 40; // the brightness range (0..255) a lit snow frame spans at least
const QUANT = 8; // colour channel step used to count distinct colours, so noise and dithering don't count

/**
 * Judges RGBA pixels (a Uint8Array or array, 4 bytes per pixel) read from the GPU canvas.
 * Returns {ok, colours, spread, problem}: problem is null when the frame looks like a drawn terrain.
 */
export function judgeFrame(pixels) {
 const seen = new Set();
 let lo = 255;
 let hi = 0;
 for (let i = 0; i + 3 < pixels.length; i += 4) {
  const r = pixels[i];
  const g = pixels[i + 1];
  const b = pixels[i + 2];
  seen.add(((r / QUANT) | 0) * 1024 + ((g / QUANT) | 0) * 32 + ((b / QUANT) | 0));
  const y = (r * 299 + g * 587 + b * 114) / 1000;
  if (y < lo) lo = y;
  if (y > hi) hi = y;
 }
 const colours = seen.size;
 const spread = Math.round(hi - lo);
 let problem = null;
 if (pixels.length < 4) problem = 'no pixels read';
 else if (colours < MIN_COLOURS) problem = `only ${colours} colours: the frame is blank or flat`;
 else if (spread < MIN_SPREAD) problem = `brightness spans only ${spread}: the frame is unlit or washed out`;
 return { ok: problem === null, colours, spread, problem };
}

/**
 * Judges what the page reported for one scene: the renderer in use, lost contexts, page errors and the frame.
 * report: {renderer: {name, fallback, losses}, errors: [message], pixels}.
 * Returns a list of problems, empty when the scene is fine.
 */
export function judgeScene(report) {
 const problems = [...report.errors.map((e) => 'page error: ' + e)];
 const r = report.renderer || {};
 if (r.name !== 'gl') {
  problems.push(`drew on ${r.name || 'nothing'}, not the GPU` + (r.fallback ? ` (${r.fallback})` : ''));
 }
 if (r.losses) problems.push(`lost the WebGL context ${r.losses} time(s)`);
 if (r.name === 'gl') {
  const frame = judgeFrame(report.pixels || []);
  if (!frame.ok) problems.push(frame.problem);
 }
 return problems;
}
