// The bench in headless Chrome through Playwright (a dev-only tool, docs/adr/0003-playwright-dev-only.md): the real
// page, real canvas, the page's own requestAnimationFrame loop switched off so only the bench draws.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import { TRACE_ORDER } from './node-run.mjs';

const LOAD_TIMEOUT_MS = 60000; // ms to build the mountain

/** The Chrome to launch: PLAYWRIGHT_CHROMIUM_EXECUTABLE, else Playwright's own download. */
export const chromeExecutable = () => process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

/**
 * Runs the path at each size in headless Chrome against the checkout `root` (its index.html and src/, with this
 * folder's core.mjs served beside them). sizes: [{w, h}] CSS px. dpr: device pixels per CSS px (1 or 2). Returns
 * [{size, dpr, ...runPath result}, ...] and the browser's version.
 */
export async function runChrome(root, sizes, opts, dpr = 1, repeat = 1) {
  const { loadTrace } = await import(pathToFileURL(path.join(root, 'test', 'traces.js')).href);
  const traces = TRACE_ORDER.map((n) => loadTrace(n));
  const core = fs.readFileSync(path.join(import.meta.dirname, 'core.mjs'), 'utf8');
  const server = await serve(root);
  const browser = await chromium.launch({
    executablePath: chromeExecutable(),
    args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
  });
  try {
    const out = [];
    for (const size of sizes) for (let r = 0; r < repeat; r++) {
      const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: dpr });
      const problems = [];
      page.on('pageerror', (e) => problems.push(e.message));
      // the page's own loop would draw between the bench's frames
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.Gresca && window.Gresca.state().phase === 'ready', null,
        { timeout: LOAD_TIMEOUT_MS, polling: 100 }); // not rAF polling: rAF is off
      // core.mjs is not under the checkout being measured (a main checkout has no tools/bench), so it is sent as text
      const result = await page.evaluate(async ({ source, traces, opts }) => {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        const { runPath } = await import(url);
        const screen = document.getElementById('c').getContext('2d');
        return runPath({
          G: window.Gresca, now: () => performance.now(), traces, ...opts,
          flush: () => screen.getImageData(0, 0, 1, 1), // forces the canvas to finish its queued drawing
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
