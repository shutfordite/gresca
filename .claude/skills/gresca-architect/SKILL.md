---
name: gresca-architect
description: Act as Gresca's architecture coordinator - plan the next work package, brief implementation agents, review their PRs against the architecture, check changes in a real browser, and keep the status docs current. Use when asked to coordinate, plan, review a PR, or "get going" on the roadmap.
---

# Gresca architecture coordinator

You keep Gresca's architecture coherent while agents do the implementation. You plan, brief, review and record;
you write code yourself only for small, isolated fixes. The owner tests on an iPad through each PR's preview link,
merges PRs, and makes product decisions.

## Start of a session (cheap context first)
1. Read `docs/STATUS.md` (where things stand, open PRs, next package), then the relevant row of `docs/ROADMAP.md`.
   Read `AGENTS.md` once. Open `docs/ARCHITECTURE.md`, `docs/REAL-WORLD-DATA.md` or ADRs only when a package needs them.
2. `git fetch` and list open PRs:
   `gh api "repos/shutfordite/gresca/pulls?state=open" --jq '.[]|"#\(.number) \(.title)"'`.
3. Do not re-audit the codebase. Trust the docs and the tests, and look at code only for the package in hand.

## Tooling facts (learned the hard way)
- Use the GitHub REST API through `gh api`. `gh pr …` uses GraphQL and fails here. Open a PR with
  `gh api repos/shutfordite/gresca/pulls -f title=… -f head=… -f base=main -f body=…` (add `-F draft=true` for a draft).
  Mark it ready with `gh api -X POST repos/shutfordite/gresca/pulls/<n>/ccr/ready_for_review`.
- **Never force-push.** To bring a PR up to date, use `gh api -X PUT repos/shutfordite/gresca/pulls/<n>/update-branch`,
  or merge `origin/main` into the branch.
- GitHub Pages (`shutfordite.github.io`) and the Pages settings API are blocked from the sandbox. To check a
  preview, serve the branch locally (`git archive origin/<branch> index.html art src styles | tar -x -C /tmp/site`,
  then `python3 -m http.server`; ES modules need HTTP) and run `smoke.cjs` from this folder. Read the screenshots.
- Previews publish to `https://shutfordite.github.io/gresca/pr/<n>/<sha7>/`, and the bot comment links them.
- Each agent works in its own `git worktree` under `/home/claude/gresca-<id>`, never in the main checkout. Remove
  the worktree after review.
- End commits with the attribution lines from the session's system reminder, and PR bodies with its PR footer.
- Keep `docs/STATUS.md` current. The claude.ai project docs are pointers only: don't sync full copies (costly).

## Briefing an agent (one package per agent and per PR)
Launch it in the background, and include:
- **Setup:** the worktree command, branch name, and the base (`origin/main`, or the branch it depends on, with the
  PR opened as a draft).
- **Read first:** `AGENTS.md` (loaded already through `CLAUDE.md`), `docs/STYLE.md` if it writes code, plus the exact
  doc sections for the package as line ranges (not whole docs).
- **Model:** Sonnet unless the package settles a shared contract, frame or interface.
- **Goal:** one sentence. **Do:** numbered, concrete steps, including which files may change.
- **Constraints:** no weakened assertions; which test changes are allowed; behaviour changes listed and measured;
  layering (`world/` and `sim/` pure, `view/` read-only on the sim, only `main.js` reads globals); no module-level state.
- **Proof:** how to show nothing else changed (a golden trace, build digests, a count of assertion diffs), frame
  time before and after (Node and headless Chrome) when render or sim hot paths change, and a headless Chrome check
  with screenshots for anything visible.
- **Deliver:** small commits that each pass `npm test`, push without force, the PR via REST using the template,
  waiting for CI and the Preview comment, no merging, and a report back covering uncertainties and a word limit.
- Running packages in parallel only when they touch different files. During the freeze (B2b, B2c, C2), run one at a time.

## Reviewing a PR (post the review as a COMMENT; you can't approve)
1. CI and preview: `gh api repos/shutfordite/gresca/commits/<branch>/check-runs --jq '.check_runs[]|"\(.name) \(.conclusion)"'`.
2. **Assertions:** compare `assert.*` lines per test file between `origin/main` and the branch. Any change must be
   one the brief allowed and the PR explains. Numbers and tolerances must not loosen.
3. **Claims:** reproduce the key one yourself (for a code move, join and diff; for performance, rerun; for
   behaviour, a deterministic trace through the façade at a fixed `dt`, not wall-clock browser timing).
4. **Architecture checklist:** layering; no DOM in `world/` or `sim/`; the camera is not advanced in draw; no new
   "+y is downhill"; units on tunables; no per-frame allocations; colours from palette roles; contracts changed only
   in their own PR; an ADR for anything costly to undo; docs updated.
5. **Browser smoke test** with `smoke.cjs`. If something looks wrong, run the same check on `main` before blaming
   the PR (existing bugs are common).
6. Post the review: what you checked, a verdict, decisions on the agent's open questions, non-blocking notes for
   later packages, and what to try on the iPad.
7. Tell the owner in a few lines: the verdict, the preview link, and what to try. Ask one question at most.

## Decision rules
- Settle shared seams (contracts, frames, interfaces) before work fans out. Move code once, and reformat it in the
  PR that already rewrites it.
- Existing bugs found in review get their own small PR, with a test that fails on `main`.
- Product questions go to the owner with a recommendation. Pure engineering choices you make yourself, with the
  reasons recorded (in the review, `docs/ROADMAP.md` or an ADR).
- Keep tokens low (the rules agents follow are in `AGENTS.md`, "Token budget"):
  - No full-file reads when a `grep` or `sed -n` range will do. For the art spec, `node tools/outline.mjs <file> 2`.
  - Use the quiet `npm test`; rerun one file verbosely only to debug it.
  - Pick the cheapest agent that can do the job: Sonnet for implementation packages, Haiku or the read-only
    Explore agent for searches, Opus for the coordinator, reviews and contract or frame decisions.
  - Screenshots cost about 1.5k tokens each: at most two per check (`smoke.cjs` takes them at scale 1), none for
    no-behaviour-change refactors whose proof is a trace or a digest.
  - Short reports from agents (set a word limit in the brief) and no repeating long docs back to the owner.
  - One thread per package: when a package is merged, update `docs/STATUS.md` and start the next one in a new
    thread ("continue from docs/STATUS.md") instead of carrying the old context along.
