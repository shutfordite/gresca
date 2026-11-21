// Pixel digests of every scene, board and skis, at 820x1180, for proving that a performance change drew the same
// picture. Like tools/shot.mjs, but the page's own animation loop is off, so a scene's pixels depend only on the code
// (shot.mjs lets the loop draw between steps with real frame times, so its PNGs differ from run to run).
// Usage: node tools/bench/digest.mjs [--root DIR] [--path]: prints "<sha256 of the canvas pixels> <scene>-<rig>" per
// line. --path instead hashes the canvas after every 10th frame along the bench path (core.mjs) at 390x844 and 820x1180,
// one line per size: the same trees, rails, flags, spray and rider poses the bench draws.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';

const VIEWPORT = { width: 820, height: 1180 }; // CSS px: an iPad, as tools/shot.mjs
const RIGS = ['board', 'ski'];
const SETTLE_FRAMES = 12;   // frames drawn after switching rig, as tools/shot.mjs
const SETTLE_DT_S = 1 / 30; // s per settle frame
const LOAD_TIMEOUT_MS = 60000; // ms to build the mountain

const rootArg = process.argv.indexOf('--root');
const root = path.resolve(rootArg < 0 ? path.join(import.meta.dirname, '..', '..') : process.argv[rootArg + 1]);
const PATH_SIZES = [{ width: 390, height: 844 }, { width: 820, height: 1180 }];
const PATH_FRAMES = 720; // frames along the path
const PATH_EVERY = 10;   // frames between hashes
const server = await serve(root);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
try {
  const open = async (query) => {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(`${base}/${query}`);
    await page.waitForFunction(() => window.Gresca && window.Gresca.state().phase !== 'load', null,
      { timeout: LOAD_TIMEOUT_MS, polling: 100 });
    return page;
  };
  if (process.argv.includes('--path')) {
    const { loadTrace } = await import(pathToFileURL(path.join(root, 'test', 'traces.js')).href);
    const traces = ['carve', 'jump', 'brake', 'switch-traverse'].map((n) => loadTrace(n));
    const core = fs.readFileSync(path.join(import.meta.dirname, 'core.mjs'), 'utf8');
    for (const size of PATH_SIZES) {
      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto(`${base}/?renderer=cpu`);
      await page.waitForFunction(() => window.Gresca && window.Gresca.state().phase === 'ready', null,
        { timeout: LOAD_TIMEOUT_MS, polling: 100 });
      const hash = await page.evaluate(async ({ source, traces: tr, frames, every }) => {
        const { runPath } = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
        const c = document.getElementById('c');
        const ctx = c.getContext('2d');
        const sums = [];
        const pending = [];
        runPath({
          G: window.Gresca, now: () => performance.now(), traces: tr, frames, warmup: 0,
          after: (i) => { if (i % every === 0) pending.push(ctx.getImageData(0, 0, c.width, c.height).data); },
        });
        for (const px of pending) sums.push(await crypto.subtle.digest('SHA-256', px));
        const all = new Uint8Array(sums.length * 32);
        sums.forEach((s, i) => all.set(new Uint8Array(s), i * 32));
        const total = await crypto.subtle.digest('SHA-256', all);
        return [...new Uint8Array(total)].map((b) => b.toString(16).padStart(2, '0')).join('');
      }, { source: core, traces, frames: PATH_FRAMES, every: PATH_EVERY });
      console.log(hash, `path-${size.width}x${size.height}`);
      await page.close();
    }
    await browser.close();
    server.close();
    process.exit(0);
  }
  const first = await open('?renderer=cpu');
  const scenes = await first.evaluate(() => window.Gresca.scenes().map((s) => s.name));
  await first.close();
  for (const scene of scenes) {
    for (const rig of RIGS) {
      const page = await open(`?renderer=cpu&scene=${encodeURIComponent(scene)}`);
      const hash = await page.evaluate(async ([r, n, dt]) => {
        window.Gresca.set({ rig: r });
        for (let i = 0; i < n; i++) window.Gresca.frame(dt);
        const c = document.getElementById('c');
        const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const sum = await crypto.subtle.digest('SHA-256', px);
        return [...new Uint8Array(sum)].map((b) => b.toString(16).padStart(2, '0')).join('');
      }, [rig, SETTLE_FRAMES, SETTLE_DT_S]);
      console.log(hash, `${scene}-${rig}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
