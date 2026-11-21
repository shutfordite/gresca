// The CI regression check: this checkout's frame time against a base checkout (main) measured on the same machine in
// the same job, in Node. Exits 1 if any stage's median frame time is more than 25% (and 0.05 ms) above the base's.
// Usage: node tools/bench/compare.mjs --base DIR [--rounds K] [--frames N]
//
// Why this is robust on a shared runner: both sides run on the same VM within the same minute, in alternation, so
// slow neighbours hit both; each run is a median over hundreds of frames; the number compared is the best of K such
// runs (noise only adds time); and the fixed work (the same game code, canvas stubbed, no browser) has no GPU or
// network in it. Chrome numbers (npm run bench -- --chrome) are not gated: raster time there is the machine's.
import path from 'node:path';
import { runNode } from './node-run.mjs';
import { compareStages, MAX_SLOWDOWN, MIN_ABS_MS } from './regress.mjs';

const SIZES = [{ w: 390, h: 844 }, { w: 820, h: 1180 }]; // CSS px
const ROUNDS = 3;   // runs per side per size, alternating base and head
const FRAMES = 360; // frames counted per run
const WARMUP = 90;  // frames before counting

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? fallback : process.argv[i + 1];
};

const head = path.join(import.meta.dirname, '..', '..');
const base = path.resolve(arg('base', ''));
if (!arg('base')) throw new Error('compare: --base DIR (a checkout of the branch to compare with) is required');
const rounds = Number(arg('rounds', ROUNDS));
const opts = { frames: Number(arg('frames', FRAMES)), warmup: WARMUP };

const medians = (r) => Object.fromEntries(Object.entries(r.stages).map(([name, s]) => [name, s.median]));
let failed = false;
for (const size of SIZES) {
  const runs = { base: [], head: [] };
  for (let i = 0; i < rounds; i++) {
    // base first one round and head first the next, so a trend in the machine's speed favours neither
    for (const side of i % 2 ? ['head', 'base'] : ['base', 'head']) {
      const [r] = await runNode(side === 'base' ? base : head, [size], opts, 1);
      runs[side].push(medians(r));
    }
  }
  console.log(`\n${size.w}x${size.h}: best of ${rounds} runs, median ms per frame`);
  console.log('stage       base    head   ratio');
  for (const c of compareStages(runs.base, runs.head)) {
    console.log(`${c.stage.padEnd(8)} ${c.base.toFixed(3).padStart(8)} ${c.head.toFixed(3).padStart(7)} ${c.ratio.toFixed(2).padStart(7)}` +
      (c.failed ? `  REGRESSION (limit ${MAX_SLOWDOWN}x and ${MIN_ABS_MS} ms)` : ''));
    failed ||= c.failed;
  }
}
if (failed) {
  console.error('\nA stage is more than 25% slower than the base. Re-run the job once if the machine was busy; otherwise fix it.');
  process.exit(1);
}
