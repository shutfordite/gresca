// Pixel digests of every scene, board and skis, at 820x1180, for proving that a performance change drew the same
// picture. Like tools/shot.mjs, but the page's own animation loop is off, so a scene's pixels depend only on the code
// (shot.mjs lets the loop draw between steps with real frame times, so its PNGs differ from run to run).
// Usage: node tools/bench/digest.mjs [--root DIR]: prints "<sha256 of the canvas pixels> <scene>-<rig>" per line.
import path from 'node:path';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';

const VIEWPORT = { width: 820, height: 1180 }; // CSS px: an iPad, as tools/shot.mjs
const RIGS = ['board', 'ski'];
const SETTLE_FRAMES = 12;   // frames drawn after switching rig, as tools/shot.mjs
const SETTLE_DT_S = 1 / 30; // s per settle frame
const LOAD_TIMEOUT_MS = 60000; // ms to build the mountain

const rootArg = process.argv.indexOf('--root');
const root = path.resolve(rootArg < 0 ? path.join(import.meta.dirname, '..', '..') : process.argv[rootArg + 1]);
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
  const first = await open('');
  const scenes = await first.evaluate(() => window.Gresca.scenes().map((s) => s.name));
  await first.close();
  for (const scene of scenes) {
    for (const rig of RIGS) {
      const page = await open(`?scene=${encodeURIComponent(scene)}`);
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
