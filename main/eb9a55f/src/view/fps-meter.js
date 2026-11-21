// The ?fps=1 readout: frames per second, ms per frame and the CPU ms of a frame, smoothed, small on the screen canvas.

const SMOOTHING = 0.08;     // 0..1, share of each new frame in the running averages
const TEXT_EVERY_S = 0.5;   // s between refreshes of the text (a new string each time)
const FONT_FRAC = 0.016;    // the text's height as a fraction of the canvas height
const MARGIN_FRAC = 0.012;  // its distance from the bottom left corner, as a fraction of the canvas height

/** A new meter: frameMs and cpuMs (ms, running averages), sinceText (s), text (the last readout), font and size. */
export const createFpsMeter = () => ({ frameMs: 0, cpuMs: 0, sinceText: TEXT_EVERY_S, text: '', font: '', size: 0 });

/** Adds one frame: dtS (s since the last frame, as the loop measured it), cpuMs (ms the frame took on the CPU). */
export function tickFps(meter, dtS, cpuMs, rendererName) {
 const ms = dtS * 1000;
 meter.frameMs = meter.frameMs === 0 ? ms : meter.frameMs + (ms - meter.frameMs) * SMOOTHING;
 meter.cpuMs += (cpuMs - meter.cpuMs) * SMOOTHING;
 meter.sinceText += dtS;
 if (meter.sinceText < TEXT_EVERY_S) return;
 meter.sinceText = 0;
 const fps = meter.frameMs > 0 ? 1000 / meter.frameMs : 0;
 meter.text = rendererName + '  ' + fps.toFixed(0) + ' fps  ' + meter.frameMs.toFixed(1) + ' ms  cpu ' +
  meter.cpuMs.toFixed(1) + ' ms';
}

/** Draws the readout at the bottom left of a canvas Hh px high, in the Look's UI ink over its halo (look.ui). */
export function drawFps(ctx, meter, look, Hh) {
 if (meter.text === '') return;
 const size = Math.max(10, Math.round(Hh * FONT_FRAC));
 if (size !== meter.size) {
  meter.size = size;
  meter.font = 'bold ' + size + 'px monospace';
 }
 const x = Math.round(Hh * MARGIN_FRAC);
 const y = Hh - x;
 ctx.font = meter.font;
 ctx.textAlign = 'left';
 ctx.textBaseline = 'bottom';
 ctx.fillStyle = look.ui['--halo'];
 ctx.fillRect(x - size * 0.3, y - size * 1.2, ctx.measureText(meter.text).width + size * 0.6, size * 1.35);
 ctx.fillStyle = look.ui['--ink'];
 ctx.fillText(meter.text, x, y);
}
