// The frame-time bench's core: a fixed rider path, a stage timer and the statistics. Plain ES module with no imports,
// so the same file runs in Node (against the test harness's canvas stub) and inside the game's page in Chrome.

export const FRAME_DT = 1 / 60;     // s per drawn frame, fixed: the bench never reads the wall clock for the game
export const SEAM_SKIP = 2;         // frames dropped from the statistics after each jump to a new trace (a new run)
const PARTICLES_PER_FRAME = 2;      // spray particles emitted per frame while riding fast on the snow
const SPRAY_MIN_SPEED = 8;          // m/s, slower riders throw no spray
const SPRAY_SPREAD = 0.4;           // m, as the sim's own emit calls
const SPRAY_UP = 1.5;               // m/s upwards

/**
 * The rider path: every trace in `traces` one after the other (their own order), each sampled at FRAME_DT by linear
 * interpolation between its rows. Returns {frames (count in one pass), at(i) -> {fields, seam (true on the first
 * frame of a trace), rig}}; i wraps around after one pass. traces: [{rig, dt, every, fields, rows}] from
 * test/fixtures/traces. Units as the trace: m, m/s, rad, s.
 */
export function createPath(traces) {
  const segs = traces.map((t) => ({ t, step: t.dt * t.every, n: Math.floor((t.rows.length - 1) * t.dt * t.every / FRAME_DT) }));
  const frames = segs.reduce((sum, s) => sum + s.n, 0);
  const out = { fields: {}, seam: false, rig: 'board' }; // reused: at() allocates nothing
  const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
  return {
    frames,
    at(i) {
      let k = i % frames;
      let s = 0;
      while (k >= segs[s].n) k -= segs[s++].n;
      const { t, step } = segs[s];
      const f = k * FRAME_DT / step;
      const a = Math.min(Math.floor(f), t.rows.length - 2);
      const w = f - a;
      for (let j = 0; j < t.fields.length; j++) {
        const x = t.rows[a][j];
        const y = t.rows[a + 1][j];
        if (typeof x !== 'number') out.fields[t.fields[j]] = x;
        else if (t.fields[j] === 'heading') out.fields.heading = x + wrap(y - x) * w;
        else out.fields[t.fields[j]] = x + (y - x) * w;
      }
      out.seam = k === 0;
      out.rig = t.rig;
      return out;
    },
  };
}

/** A stage timer for view.timer: start() before a frame, lap(stage) from the game, laps[stage] ms since start(). */
export function createTimer(now, stages) {
  const timer = {
    last: 0,
    laps: Object.fromEntries(stages.map((s) => [s, 0])),
    start() {
      for (const s of stages) timer.laps[s] = 0;
      timer.last = now();
    },
    lap(stage) {
      const t = now();
      timer.laps[stage] += t - timer.last;
      timer.last = t;
    },
  };
  return timer;
}

/** {mean, median, p95, max} (same unit as the samples) of an array of numbers. */
export function summarize(samples) {
  const s = Float64Array.from(samples).sort();
  const n = s.length;
  if (n === 0) return { mean: 0, median: 0, p95: 0, max: 0 };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += s[i];
  const at = (q) => s[Math.min(n - 1, Math.floor(q * n))];
  return { mean: sum / n, median: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2, p95: at(0.95), max: s[n - 1] };
}

/**
 * Runs the path through a game and times it. opts: {G (the façade, world metres), now () -> ms, traces, frames (counted
 * in the statistics), warmup (frames before, not counted), flush () (optional: forces the canvas to finish drawing,
 * timed as its own stage), memory () -> bytes (optional: JS heap in use; the growth between frames, summed where it
 * grows, is reported as allocKB, a lower bound as a collection hides some), after (i) (optional: called after each
 * frame's timing, not timed: tools/bench/digest.mjs hashes the picture with it), keepFrames (also return every
 * frame's total)}. Returns {frames, skipped, first (the very
 * first frame, ms), stages: {name: {mean, median, p95, max}} in ms, with 'hud' (what is left of the frame after
 * the stages: the HUD), 'flush' when given and 'total'; allocKB (KB allocated per frame, or null), slow: [{frame, total}] for frames over 4x the median}.
 */
export function runPath(opts) {
  const { G, now, traces, frames, warmup, flush, memory } = opts;
  const path = createPath(traces);
  const names = Object.values(G.debug.stages);
  const timer = createTimer(now, names);
  const known = new Set(Object.keys(G.state()));
  const total = frames + warmup;
  const cols = Object.fromEntries([...names, 'hud', 'flush', 'total'].map((n) => [n, new Float64Array(total)]));
  const counted = new Uint8Array(total);
  let grown = 0; // bytes of heap growth over the counted frames
  G.seed(1);
  let sinceSeam = SEAM_SKIP;
  for (let i = 0; i < total; i++) {
    const p = path.at(i);
    const patch = {};
    for (const k in p.fields) if (known.has(k) && k !== 'phase') patch[k] = p.fields[k];
    if (p.seam || i === 0) {
      G.place({ x: p.fields.x, y: p.fields.y, vx: p.fields.vx, vy: p.fields.vy, heading: p.fields.heading });
      sinceSeam = 0;
    }
    G.set({ ...patch, rig: p.rig });
    if (p.fields.z < 0.05 && Math.hypot(p.fields.vx, p.fields.vy) > SPRAY_MIN_SPEED) {
      G.emitParticles(PARTICLES_PER_FRAME, p.fields.x, p.fields.y, 0.1, SPRAY_SPREAD, SPRAY_UP, 0, 0);
    }
    G.stepParticles(FRAME_DT);
    G.debug.setTimer(timer);
    const heap0 = memory ? memory() : 0;
    timer.start();
    const t0 = timer.last;
    G.frame(FRAME_DT);
    const t1 = now();
    const heap1 = memory ? memory() : 0;
    G.debug.setTimer(null);
    let lapped = 0;
    for (const s of names) {
      cols[s][i] = timer.laps[s];
      lapped += timer.laps[s];
    }
    cols.hud[i] = Math.max(0, t1 - t0 - lapped);
    let t2 = t1;
    if (flush) {
      flush();
      t2 = now();
      cols.flush[i] = t2 - t1;
    }
    cols.total[i] = t2 - t0;
    counted[i] = i >= warmup && sinceSeam >= SEAM_SKIP ? 1 : 0;
    if (opts.after) opts.after(i);
    if (counted[i] && heap1 > heap0) grown += heap1 - heap0;
    sinceSeam++;
  }
  const keep = (col) => Array.from(col).filter((_, i) => counted[i]);
  const stages = {};
  for (const n of Object.keys(cols)) if (n !== 'flush' || flush) stages[n] = summarize(keep(cols[n]));
  const totals = keep(cols.total);
  const med = stages.total.median;
  const slow = [];
  for (let i = 0; i < total; i++) if (counted[i] && cols.total[i] > 4 * med) slow.push({ frame: i, total: cols.total[i] });
  return {
    allocKB: memory ? grown / 1024 / totals.length : null, frames: totals.length, skipped: total - warmup - totals.length, first: cols.total[0], stages, slow,
    ...(opts.keepFrames ? { totals: Array.from(cols.total) } : {}),
  };
}
