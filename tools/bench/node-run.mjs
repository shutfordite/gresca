// The bench in Node: the real game code against the test harness's canvas stub (drawing calls are no-ops, so this
// measures the CPU work: the raycast, projection, sorting and allocation; Chrome adds the canvas's own cost).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runPath } from './core.mjs';

/**
 * Runs the path at each size in a game loaded from the checkout `root`. sizes: [{w, h}] CSS px. Returns
 * [{size, ...runPath result}], `repeat` times each (a fresh game for each).
 */
export async function runNode(root, sizes, opts, repeat = 1) {
  const harness = await import(pathToFileURL(path.join(root, 'test', 'harness.js')).href);
  const { loadTrace } = await import(pathToFileURL(path.join(root, 'test', 'traces.js')).href);
  const traces = TRACE_ORDER.map((n) => loadTrace(n));
  const out = [];
  for (const size of sizes) {
    for (let r = 0; r < repeat; r++) { // a fresh game each time: the first frames are part of what is measured
      const g = await harness.load({ rotationDeg: 0 });
      const c = g.el('c');
      c.clientWidth = size.w;
      c.clientHeight = size.h;
      g.fire('resize');
      out.push({ size, ...runPath({ G: g.raw, now: () => performance.now(), traces, memory: () => process.memoryUsage().heapUsed, ...opts }) });
    }
  }
  return out;
}

export const TRACE_ORDER = ['carve', 'jump', 'brake', 'switch-traverse']; // board, board, skis, skis
