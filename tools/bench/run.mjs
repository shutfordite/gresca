// npm run bench: frame time by stage along a fixed rider path (the recorded traces), at 390x844 and 820x1180.
// Usage: node tools/bench/run.mjs [--chrome] [--dpr 2] [--repeat K] [--frames N] [--warmup N] [--root DIR] [--json FILE]
//   --no-flush Chrome: do not force the canvas to finish drawing after each frame (shows its bursty rasterising)
//   --repeat K runs each size K times (default 5) and reports the median of each statistic
//   --chrome   also run in headless Chrome (set PLAYWRIGHT_CHROMIUM_EXECUTABLE); without it, Node only
//   --gl       Chrome only: the GPU terrain (?renderer=gl), its stages, the flush waiting for the GPU. Headless Chrome
//              with no GPU draws WebGL in software (SwiftShader): the numbers bound the CPU side, not an iPad's GPU
//   --root DIR measure the game checked out in DIR (default: this repository)
//   --notes T  free text kept in the JSON (what else was running, which commit)
//   --json F   write the numbers to F (the baseline format)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runNode } from './node-run.mjs';

const SIZES = [{ w: 390, h: 844 }, { w: 820, h: 1180 }]; // CSS px: a phone and an iPad
const FRAMES = 720; // frames counted: one pass over the four traces (12 s at 60 fps)
const REPEAT = 5;   // runs per size; the numbers reported are the medians over these
const WARMUP = 120; // frames before counting, so the JIT has seen the code

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? fallback : process.argv[i + 1];
}

const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// The runs of one size folded into one result: every statistic is the median of that statistic over the runs, which
// keeps one noisy run (another process on the machine) from moving it. Sizes keep their order.
function fold(runs) {
  const bySize = new Map();
  for (const r of runs) {
    const key = `${r.size.w}x${r.size.h}`;
    if (!bySize.has(key)) bySize.set(key, []);
    bySize.get(key).push(r);
  }
  return [...bySize.values()].map((group) => {
    const stages = {};
    for (const name of Object.keys(group[0].stages)) {
      stages[name] = Object.fromEntries(['mean', 'median', 'p95', 'max'].map((k) => [k, median(group.map((r) => r.stages[name][k]))]));
    }
    const { size, dpr, frames, skipped } = group[0];
    const alloc = group.map((r) => r.allocKB).filter((v) => v !== null);
    return { size, dpr, frames, skipped, runs: group.length, allocKB: alloc.length ? median(alloc) : null, first: median(group.map((r) => r.first)), stages,
      slow: group.flatMap((r) => r.slow) };
  });
}

// Prints one result as a table: a row per stage, ms per frame.
function print(title, results) {
  for (const r of results) {
    console.log(`\n${title} ${r.size.w}x${r.size.h}${r.dpr ? ` @${r.dpr}x` : ''}: ${r.frames} frames ` +
      `(${r.skipped} skipped after seams), first frame ${r.first.toFixed(2)} ms, ` +
      `allocation ${r.allocKB === null ? 'n/a' : r.allocKB.toFixed(0) + ' KB'} per frame`);
    console.log('stage      mean  median     p95     max');
    for (const [name, s] of Object.entries(r.stages)) {
      console.log(`${name.padEnd(8)} ${[s.mean, s.median, s.p95, s.max].map((v) => v.toFixed(3).padStart(7)).join(' ')}`);
    }
    if (r.slow.length) console.log(`slow frames (> 4x median): ${r.slow.map((s) => `#${s.frame} ${s.total.toFixed(1)}ms`).join(', ')}`);
  }
}

async function main() {
  const root = path.resolve(arg('root', path.join(import.meta.dirname, '..', '..')));
  const opts = { frames: Number(arg('frames', FRAMES)), warmup: Number(arg('warmup', WARMUP)) };
  if (process.argv.includes('--no-flush')) opts.flush = false;
  const gl = process.argv.includes('--gl');
  const report = {
    note: 'ms per frame by stage along tools/bench/core.mjs createPath() (the four recorded traces at 60 fps, repeated)',
    machine: { cpu: os.cpus()[0].model, cores: os.cpus().length, node: process.version, platform: `${os.platform()} ${os.arch()}` },
    frames: opts.frames, warmup: opts.warmup,
    ...(arg('notes') ? { notes: arg('notes') } : {}),
  };
  const repeat = Number(arg('repeat', REPEAT));
  if (!gl) {
    const node = fold(await runNode(root, SIZES, opts, repeat));
    print('node', node);
    report.node = node.map(({ size, stages, first, frames, skipped, runs, allocKB }) =>
      ({ size, stages, first, frames, skipped, runs, allocKB }));
  }
  if (process.argv.includes('--chrome') || gl) {
    const { runChrome } = await import('./chrome-run.mjs');
    const dpr = Number(arg('dpr', 1));
    const chromeOpts = gl ? { ...opts, query: '?map=test&renderer=gl' } : opts;
    const { results, version } = await runChrome(root, SIZES, chromeOpts, dpr, repeat);
    const chrome = fold(results);
    print('chrome', chrome);
    report.machine.chrome = version;
    report.chrome = chrome.map(({ size, dpr: d, stages, first, frames, skipped, runs, allocKB }) => ({ size, dpr: d, stages, first, frames, skipped, runs, allocKB }));
  }
  const json = arg('json');
  if (json) fs.writeFileSync(json, JSON.stringify(report, null, 1) + '\n');
}

await main();
