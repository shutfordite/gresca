// The bench in headless Chrome through Playwright (a dev-only tool, docs/adr/0003-playwright-dev-only.md): the real
// page, real canvas, the page's own requestAnimationFrame loop switched off so only the bench draws.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import { TRACE_ORDER } from './node-run.mjs';

const LOAD_TIMEOUT_MS = 60000; // ms to build the mountain
const CPU = '?renderer=cpu'; // headless Chrome has no GPU: draw with the CPU raycaster unless opts.query asks

/** The Chrome to launch: PLAYWRIGHT_CHROMIUM_EXECUTABLE, else Playwright's own download. */
export const chromeExecutable = () => process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

/**
 * Runs the path at each size in headless Chrome against the checkout `root` (its index.html and src/, with this
 * folder's core.mjs served beside them). sizes: [{w, h}] CSS px. dpr: device pixels per CSS px (1 or 2). Returns
 * [{size, dpr, ...runPath result}, ...] and the browser's version. opts.query (optional, e.g. '?renderer=gl') is
 * added to the page's URL.
 */
export async function runChrome(root, sizes, opts, dpr = 1, repeat = 1) {
  const { loadTrace } = await import(pathToFileURL(path.join(root, 'test', 'traces.js')).href);
  const traces = TRACE_ORDER.map((n) => loadTrace(n));
  const core = fs.readFileSync(path.join(import.meta.dirname, 'core.mjs'), 'utf8');
  const server = await serve(root);
  const browser = await chromium.launch({
    executablePath: chromeExecutable(),
    // with ?renderer=gl, a machine with no GPU (CI, this container) needs Chrome's software WebGL (SwiftShader)
    args: ['--enable-precise-memory-info', '--js-flags=--expose-gc',
      ...(opts.query ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [])],
  });
  try {
    const out = [];
    for (const size of sizes) for (let r = 0; r < repeat; r++) {
      const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: dpr });
      const problems = [];
      page.on('pageerror', (e) => problems.push(e.message));
      // the page's own loop would draw between the bench's frames
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto(`http://127.0.0.1:${server.address().port}/${opts.query || CPU}`);
      await page.waitForFunction(() => window.Gresca && window.Gresca.state().phase === 'ready', null,
        { timeout: LOAD_TIMEOUT_MS, polling: 100 }); // not rAF polling: rAF is off
      // core.mjs is not under the checkout being measured (a main checkout has no tools/bench), so it is sent as text
      const result = await page.evaluate(async ({ source, traces, opts }) => {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        const { runPath } = await import(url);
        const screen = document.getElementById('c').getContext('2d');
        // the GPU terrain's canvas (?renderer=gl), if any: reading one pixel waits for the GPU to finish the frame
        const glCanvas = document.querySelector('canvas:not(#c):not(#mc)');
        const gl = glCanvas ? glCanvas.getContext('webgl2') : null;
        const pixel = new Uint8Array(4);
        return runPath({
          G: window.Gresca, now: () => performance.now(), traces, memory: () => performance.memory.usedJSHeapSize, ...opts,
          // forces the canvas to finish its queued drawing; without it (a tight loop of frames, as a test page or
          // Gresca.frame() in a console would run) Chrome rasterises in bursts, when its queue fills
          flush: opts.flush === false ? undefined : () => {
            screen.getImageData(0, 0, 1, 1);
            if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          },
        });
      }, { source: core, traces, opts });
      if (problems.length) throw new Error('page errors: ' + problems.join('; '));
      out.push({ size, dpr, ...result });
      await page.close();
    }
    return { results: out, version: browser.version() };
  } finally {
    await browser.close();
    server.close();
  }
}
