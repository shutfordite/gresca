// The bench's live mode: headless Chrome running the game's own requestAnimationFrame loop (the real sim steps, real
// frame times, a real run with scripted steering) for a few seconds, recording per frame the loop callback's duration,
// its stages (the stage timer, started by the callback), the JS heap before and after (a drop is a garbage
// collection) and the gap since the last frame. For finding frames that are slow in the real game, which the fixed-dt
// path in core.mjs cannot show (it never runs the loop). Usage: node tools/bench/live.mjs [--seconds S] [--root DIR]
import path from 'node:path';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import { summarize } from './core.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const SECONDS = Number(arg('seconds', 12));
const SIZE = { width: 390, height: 844 };
const root = path.resolve(arg('root', path.join(import.meta.dirname, '..', '..')));

const server = await serve(root);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
try {
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    const live = window.__live = { rows: [], on: false, last: 0, laps: {}, lastLap: 0 };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((ts) => {
      const t0 = performance.now();
      const heap0 = performance.memory.usedJSHeapSize;
      live.laps = {};
      live.lastLap = t0;
      cb(ts);
      const t1 = performance.now();
      if (live.on) live.rows.push({ ts, gap: ts - live.last, ms: t1 - t0, laps: live.laps, heap0, heap1: performance.memory.usedJSHeapSize });
      live.last = ts;
    });
    live.timer = {
      lap(stage) {
        const t = performance.now();
        live.laps[stage] = (live.laps[stage] || 0) + t - live.lastLap;
        live.lastLap = t;
      },
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=cpu`);
  await page.waitForFunction(() => window.Gresca && window.Gresca.state().phase === 'ready', null, { polling: 100 });
  await page.evaluate(() => {
    window.Gresca.debug.setTimer(window.__live.timer);
    window.Gresca.start();
    let n = 0; // steer left and right, a second each, to keep the rider on the piste
    setInterval(() => window.Gresca.input({ left: n % 2 === 0 ? 1 : 0, right: n++ % 2 === 1 ? 1 : 0 }), 1000);
    window.__live.on = true;
  });
  await page.waitForTimeout(SECONDS * 1000);
  const rows = await page.evaluate(() => window.__live.rows);
  const drop = (r) => r.heap1 < r.heap0 - 100000;
  const ms = rows.slice(30).map((r) => r.ms); // skip the first 30 frames (warm-up)
  const s = summarize(ms);
  console.log(`${rows.length} frames in ${SECONDS}s; loop callback ms: mean ${s.mean.toFixed(2)} median ${s.median.toFixed(2)} ` +
    `p95 ${s.p95.toFixed(2)} max ${s.max.toFixed(2)}; mean/median ${(s.mean / s.median).toFixed(1)}`);
  const gaps = summarize(rows.slice(30).map((r) => r.gap));
  console.log(`frame gap ms: mean ${gaps.mean.toFixed(1)} median ${gaps.median.toFixed(1)} p95 ${gaps.p95.toFixed(1)} max ${gaps.max.toFixed(1)}`);
  const slow = rows.map((r, i) => ({ i, ...r })).filter((r) => r.i >= 30 && r.ms > 4 * s.median);
  console.log(`slow callbacks (> 4x median): ${slow.length}; with a heap drop: ${slow.filter(drop).length}`);
  for (const r of slow.slice(0, 12)) {
    const laps = Object.entries(r.laps).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ');
    console.log(`  #${r.i} ${r.ms.toFixed(1)} ms heap ${(r.heap0 / 1e6).toFixed(1)} -> ${(r.heap1 / 1e6).toFixed(1)} MB | ${laps}`);
  }
  console.log(`heap drops over the run: ${rows.filter(drop).length}; heap range ${(Math.min(...rows.map((r) => r.heap1)) / 1e6).toFixed(1)}-${(Math.max(...rows.map((r) => r.heap1)) / 1e6).toFixed(1)} MB`);
} finally {
  await browser.close();
  server.close();
}
