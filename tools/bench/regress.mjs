// The regression rule for tools/bench/compare.mjs, pure: given stage statistics from several runs of a base and of a
// head checkout, which stages got slower by more than the allowed fraction.

export const MAX_SLOWDOWN = 1.25; // a stage fails if its time is more than this times the base's
export const MIN_ABS_MS = 0.05;   // ... and more than this many ms slower: below that the timer's own noise decides

/** The least of the numbers (the run that was disturbed least: other jobs on a shared machine only ever add time). */
export const best = (values) => Math.min(...values);

/**
 * Compares stages. base, head: arrays, one entry per run, each {stageName: median ms}. Only stages in both are
 * compared. Returns [{stage, base, head, ratio, failed}] for each, with the best (smallest) run of each side.
 */
export function compareStages(base, head, maxSlowdown = MAX_SLOWDOWN, minAbsMs = MIN_ABS_MS) {
  const out = [];
  for (const stage of Object.keys(head[0])) {
    if (!base.every((run) => stage in run)) continue;
    const b = best(base.map((run) => run[stage]));
    const h = best(head.map((run) => run[stage]));
    out.push({ stage, base: b, head: h, ratio: b > 0 ? h / b : 1, failed: h > b * maxSlowdown && h - b > minAbsMs });
  }
  return out;
}
