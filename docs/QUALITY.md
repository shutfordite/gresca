# Quality standard

The bar every round has to clear. The QA agent (`.claude/skills/gresca-qa/SKILL.md`) checks each round against it
before the round PR opens, and its verdict gates the round: **BLOCK** items are fixed or the package is taken out of
the round. The coordinator owns this file; the QA agent adds a row to **Trend** each round.

Measure with `npm run test:quality` (the suite with coverage: slowest files and tests, coverage per `src/` folder and
the least covered files) and `npm run test:times` (times only, faster).

## 1. A good test
- **Fails without the change.** New behaviour comes with a test that fails on `main`; a bug fix with one that
  reproduces the bug. A test that can't fail (asserts what it just set, or only that nothing threw) doesn't count.
- **Checks behaviour, not wiring.** Through the façade or a module's public functions, with the numbers a player
  would notice (metres, seconds, radians) and a tolerance whose reason is in a comment.
- **One reason to fail.** Its name says the behaviour; when it fails, the message says what was expected and what
  came out.
- **Deterministic.** Fixed seeds and `dt`, no timers, no network, no wall clock. The same result on the rotated
  map runs (`npm run test:rotated`) where coordinates or headings are involved.
- **As cheap as it can be.** The shortest ride, the fewest frames and the fewest `load()` calls that still show the
  behaviour. A module test beats a whole-game test when the module is the thing under test.

## 2. Coverage
- `src/` lines at least **95%**, branches at least **92%** overall, and no `src/` folder lower than the previous
  round without a reason in the QA report.
- A new `src/` file arrives with at least **90%** of its lines covered. Exempt: the GPU code in `src/view/gl/` that
  only runs with WebGL (`gl-renderer.js` and friends): it is covered by `npm run smoke:gl` (CI `gl-smoke`), and the
  QA report says so instead.
- Coverage is a floor, not the goal. The QA agent looks for **behaviour** with no test even where lines are covered:
  every `SimEvent` asserted by name, every tunable in `src/core/config.js` exercised by a test that would notice it
  changing, every owner decision in `docs/ROADMAP.md` ("Decisions") pinned by a test where it can be, every
  "Do not break" item in `AGENTS.md` pinned, and every error path of a map or file loader.

## 3. Overtesting and suite speed
The suite is the gate every agent runs before every commit, so its time is paid many times a day.
- **Budget:** `npm run test:times` summed time at most **120 s** (baseline 116.6 s, 27 Nov), target **90 s**. A round
  that adds more than **5%** has to pay for it, either in the same round or as the next round's test-health package.
- **A test over 1 s** (marked "slow" by `test:times`) needs a one-line comment saying why it can't be shorter. A
  **file over 5 s** is reviewed every round until it is under.
- **Overtesting**, which the QA agent proposes trimming:
  - the same behaviour asserted again through a slower path (a whole ride where a module call shows it);
  - loops over every mode, frame rate or pose where two cases show the rule and the rest add only time;
  - long rides or many frames where a short one settles the same number;
  - a fresh `load()` per case where one game and a reset would do;
  - exact numbers captured from a run ("as before the change") that break on any unrelated tuning, where a property
    (bounded, monotonic, symmetric) says what matters.
- **Trimming rule.** A redundant test is removed or shortened only in a QA test-health package, named in the round
  PR, and the PR lists for each removed assertion the test that still covers that behaviour. That is the only
  exception to "never delete an assertion" (`AGENTS.md`), and it never loosens a number or a tolerance.

## 4. Code (what the QA agent checks beyond the architecture review)
- The rules in `AGENTS.md` ("Code rules", "Style") hold across the round, not just per package: no new module
  state, no per-frame allocation in hot loops, colours through the Look, the layers.
- No dead code: an export nothing imports, a tunable nothing reads, a flag no one sets (spikes are removed in the
  round after their verdict).
- Debt rows in `docs/STATUS.md` older than a week are named in the QA report.
- Docs that a round's change made wrong (the code maps, `docs/ARCHITECTURE.md`) are BLOCK.

## 5. Verdicts
- **PASS:** the round meets the standard.
- **PASS WITH NOTES:** it meets the floor; the notes become Debt rows or the next round's test-health package.
- **BLOCK:** one or more of:
  - a weakened, skipped or deleted assertion outside a test-health package;
  - new behaviour or a bug fix with no test that fails without it;
  - coverage under the floor (section 2) without an exemption;
  - suite summed time over budget (section 3) with no paying package planned;
  - a flaky test (different results on two runs, or on the rotated runs);
  - docs made wrong by the round.
  A BLOCK names the package, the file and what would clear it. The coordinator sends it back to that stream or
  takes the package out of the round.

## Trend
One row per round, added by the QA agent on the round branch.

| Round | Date | Tests | Summed time | Lines | Branches | Functions | Verdict |
|---|---|---|---|---|---|---|---|
| baseline | 27 Nov 2026 | 1036 | 116.6 s | 96.9% | 94.4% | 96.6% | — |
| 1 | 28 Nov 2026 | 1151 | 98.6 s (main 92.6 s on the same machine: +6.4%) | 97.2% | 94.8% | 97.1% | PASS WITH NOTES |

Baseline notes: the slowest files are `scenes` (13.8 s), `camera-follows-mode` (12.3 s), `air-controls` (8.9 s),
`camera` (7.9 s) and `tap-rider` (7.2 s); the slowest test is the look-back check in every camera mode (5.2 s). The
least covered `src/` files are `view/gl/gl-renderer.js` (GPU only, exempt), `view/fps-meter.js` (61%) and
`view/renderer.js` (72%).

Round 1 notes: over the 5% line, paid by round 2's test-health package (`camera-follows-mode`: one game for all
modes, about 4 s). New slow tests: `park-play` ride (1.2 s) and jib (1.0 s), `real-map` sun (1.0 s), each with its
reason. No `src/` folder fell; `src/world/park/` arrives at 99%.
