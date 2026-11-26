// The GPU smoke test: opens a few scenes with the GPU terrain (?renderer=gl) in headless Chrome on software WebGL
// (SwiftShader), checks each drew a real frame on the GPU with no page errors or lost context, and saves a small
// screenshot of each into shots/gl/. CI has no GPU, so every other browser tool forces ?renderer=cpu; this is the one
// check of the renderer players get. Slow (seconds a frame), so it draws few frames at a small size.
// Usage: npm run smoke:gl [-- scene ...]  (default: GL_SCENES). Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use an
// installed Chrome. Exits 1 when any scene fails.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { serve } from './bench/serve.mjs';
import { judgeScene } from './gl-smoke-check.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'shots', 'gl');
const VIEWPORT = { width: 410, height: 590 }; // CSS px: half an iPad, to keep software WebGL quick
const GL_SCENES = ['carve-board', 'carve-ski']; // scenes from src/scenes.js: lit terrain, trees, rider and shadow
const FRAMES = 3; // frames drawn before reading the pixels, so baked textures and shadows are in
const FRAME_DT_S = 1 / 30; // s per frame
const LOAD_TIMEOUT_MS = 180000; // ms to build the mountain and compile the shaders in software
const CHROME_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

// Opens one scene on the GPU, draws a few frames and reports what the page saw; writes the screenshot.
async function check(browser, base, scene) {
 const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
 const errors = [];
 page.on('pageerror', (e) => errors.push(e.message));
 await page.goto(`${base}/?map=test&renderer=gl&scene=${encodeURIComponent(scene)}`);
 await page.waitForFunction(() => window.Gresca && document.getElementById('msg').hidden, null,
  { timeout: LOAD_TIMEOUT_MS, polling: 500 });
 const report = await page.evaluate(([n, dt]) => {
  const G = window.Gresca;
  for (let i = 0; i < n; i++) G.frame(dt);
  const renderer = G.debug.renderer();
  const canvas = document.querySelector('canvas:not(#c):not(#mc)');
  const gl = canvas ? canvas.getContext('webgl2') : null;
  let pixels = [];
  if (gl) {
   // read in the same task as the frame, before the browser composites and clears the drawing buffer
   G.frame(dt);
   const w = gl.drawingBufferWidth;
   const h = gl.drawingBufferHeight;
   const buf = new Uint8Array(w * h * 4);
   gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
   pixels = Array.from(buf.filter((_, i) => i % 64 < 4)); // every 16th pixel is plenty to judge
  }
  return { renderer, pixels };
 }, [FRAMES, FRAME_DT_S]);
 const file = path.join(OUT, `${scene}.png`);
 await page.screenshot({ path: file });
 await page.close();
 return { scene, file: path.relative(ROOT, file), problems: judgeScene({ ...report, errors }) };
}

async function main() {
 const wanted = process.argv.length > 2 ? process.argv.slice(2) : GL_SCENES;
 fs.mkdirSync(OUT, { recursive: true });
 const server = await serve(ROOT);
 const base = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined, args: CHROME_ARGS,
 });
 let failed = 0;
 try {
  for (const scene of wanted) {
   const r = await check(browser, base, scene);
   if (r.problems.length) failed++;
   console.log(`${r.problems.length ? 'FAIL' : 'ok'} ${scene} -> ${r.file}`);
   for (const p of r.problems) console.log('  ' + p);
  }
 } finally {
  await browser.close();
  server.close();
 }
 process.exitCode = failed ? 1 : 0;
}

await main();
