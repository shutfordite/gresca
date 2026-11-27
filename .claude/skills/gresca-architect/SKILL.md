---
name: gresca-architect
description: Act as Gresca's architecture coordinator - plan the next round of work packages, brief implementation agents, review their branches against the architecture, join them into one round PR with what changed and what to test, and keep the status docs current. Use when asked to coordinate, plan, review a PR, or "get going" on the roadmap.
---

# Gresca architecture coordinator

You keep Gresca's architecture coherent while agents do the implementation. You plan, brief, review and record;
you write code yourself only for small, isolated fixes. The owner tests on an iPad through the preview link of
**one round PR** (below), merges it, and makes product decisions.

**One PR per round (X3, 27 Nov).** The owner found a PR per package too many to test and merge. Stream agents push
branches and open no PRs. When every stream in the round has finished and passed review, you join their branches
into `round/<n>` and open one PR, `Round <n>: <what>`, from `.github/round_pr_template.md`: what changed, and a
numbered list of what to test on the iPad. The owner tests one preview and merges one PR.

## Start of a session (cheap context first)
1. Read `docs/STATUS.md` (where things stand, open PRs, next package), then the relevant row of `docs/ROADMAP.md`.
   Read `AGENTS.md` once. Open `docs/ARCHITECTURE.md`, `docs/REAL-WORLD-DATA.md` or ADRs only when a package needs them.
2. `git fetch`, list stream branches (`git ls-remote --heads origin 's*/*' 'round/*'`) and open PRs (normally one
   round PR at most):
   `gh api "repos/shutfordite/gresca/pulls?state=open" --jq '.[]|"#\(.number) \(.title)"'`.
3. Read the **Debt** table and **Waiting on the owner** in `docs/STATUS.md`: debt that blocks the package in hand
   goes into its brief, and an owner verdict still missing is asked for before building on it.
4. Do not re-audit the codebase. Trust the docs and the tests, and look at code only for the package in hand.

## Tooling facts (learned the hard way)
- Use the GitHub REST API through `gh api`. `gh pr …` uses GraphQL and fails here. Open a PR with
  `gh api repos/shutfordite/gresca/pulls -f title=… -f head=… -f base=main -f body=…` (add `-F draft=true` for a draft).
  Mark it ready with `gh api -X POST repos/shutfordite/gresca/pulls/<n>/ccr/ready_for_review`.
- **Never force-push.** To bring a PR up to date, use `gh api -X PUT repos/shutfordite/gresca/pulls/<n>/update-branch`,
  or merge `origin/main` into the branch.
- GitHub Pages (`shutfordite.github.io`) and the Pages settings API are blocked from the sandbox. The `PR check`
  workflow smoke-tests every PR in headless Chrome and reports in its comment. To check by hand, in a worktree of
  the branch run `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm run smoke` (it serves the checkout).
- Previews publish to `https://shutfordite.github.io/gresca/pr/<n>/<sha7>/`, and the bot comment links them. Only
  PRs get previews, so stream branches have none: you check them with `npm run smoke` and `npm run shot` in a
  worktree, and the owner sees the work in the round PR's preview.
- Each agent works in its own `git worktree` under `/home/claude/gresca-<id>`, never in the main checkout. Remove
  the worktree after review.
- End commits with the attribution lines from the session's system reminder, and PR bodies with its PR footer.
- `docs/STATUS.md` is yours alone: agents report back to you, and you update STATUS in your own commit on the round
  branch (the PR check warns when a stream branch edits it). The claude.ai project docs are pointers only: don't sync
  full copies (costly).
- The sandbox can't reach the map data hosts (elevation tiles, OpenSkiMap). Real maps are baked by the **Bake map**
  workflow (`.github/workflows/bake-map.yml`, run from the Actions tab or
  `gh api -X POST repos/shutfordite/gresca/actions/workflows/bake-map.yml/dispatches -f ref=main -f inputs[map]=<id>`).
  Its PR is opened with the workflow token, so CI doesn't start on it: push a commit (or close and reopen it).
- CI has no GPU: every browser check uses `?renderer=cpu` except `npm run smoke:gl` (CI `gl-smoke`, software WebGL,
  shots in the `gl-shots` artifact). It is the only automated check of what players see.

## Briefing an agent (one package per agent and per PR)
Launch it in the background, and include:
- **Setup:** the worktree command, the branch name (`s<stream>/<package>`, e.g. `s2/f6-carve`), and the base:
  `origin/main`, or, if it needs another package of the same round, that package's branch (say so in the brief).
- **Read first:** `AGENTS.md` (loaded already through `CLAUDE.md`), `docs/STYLE.md` if it writes code, plus the exact
  doc sections for the package as line ranges (not whole docs).
- **Model:** Sonnet unless the package settles a shared contract, frame or interface.
- **Goal:** one sentence. **Do:** numbered, concrete steps, including which files may change, and the folder
  `AGENTS.md` whose code map gets any new file's row.
- **Feel first:** if the package is judged by feel or eye (a gesture, physics feel, a pose, camera framing, scale),
  it starts as a **feel spike** (below) unless the owner has already ridden a prototype of it.
- **Debt:** any Debt row the package's files carry ("clear it, or say why not in the PR").
- **Constraints:** no weakened assertions; which test changes are allowed; behaviour changes listed and measured;
  layering (`world/` and `sim/` pure, `view/` read-only on the sim, only `main.js` reads globals); no module-level state.
- **Proof:** how to show nothing else changed (a golden trace, build digests, a count of assertion diffs), frame
  time before and after (Node and headless Chrome) when render or sim hot paths change, and a headless Chrome check
  with screenshots for anything visible.
- **Deliver:** small commits that each pass `npm test`, push the branch without force, and **no PR**. Run
  `npm run review -- --title "<package id>: <what>" --body-file <report.md>` on the branch and fix what it flags.
  The report back is that body (the sections of `.github/pull_request_template.md`), plus uncertainties, with a word
  limit: it is what you copy into the round PR. No edits to `docs/STATUS.md`.
- Running packages in parallel only when they touch different files: a round is the set of packages that run in
  parallel. During a freeze (a contract or frame change everyone builds on), the contract package goes in first and
  the round's stream packages branch from it.

## Feel spikes (decisions the iPad makes)
Specs written ahead don't predict feel: one-finger flips (#60) were replaced after a ride (#68), the play mountain
"looks flat" (#48), and the rider scale (F1) drifted for a week. For anything judged by feel or eye:
1. A small throwaway branch behind a URL flag (`?spike=<name>`), touching as little as it can, with two or three
   variants if the question is "which one" (`?spike=flips2`). No tests beyond `npm test` passing; no docs. It joins
   the round like any package, so the owner tries it in the same preview; off the flag nothing changes.
2. One question in the round PR's **Owner verdicts needed**, with the link to try. The owner's answer goes into
   `docs/ROADMAP.md` ("Decisions"); the next round's real package removes the spike code (or replaces it).
3. A package marked "Owner verdict needed: yes" isn't built on until the verdict is in STATUS's "Waiting on the owner".

## Reviewing a stream branch (before it joins the round)
1. The mechanical checks: in a worktree of the branch run `node tools/review/run.mjs --base origin/main --title
   "<package id>: <what>" --body-file <the agent's report>` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome
   npm run smoke`. They do the mechanical steps: assert counts per test file, removed asserts, added skips and assert
   lines whose numbers changed; the golden hash and fixtures; stream ownership and contracts mixed with code; the
   template; new files missing from the code map; tunables without units; long new lines; and the smoke test
   (drop in, ride, page errors and failed requests, compared with main). Don't redo them: follow up only on what it
   flags (❌ must be explained in the report; ⚠️ look). Ownership is checked here, per branch: the round PR joins
   streams on purpose, so its check only lists them.
2. **Assertions:** for each flagged assert change, check the brief allowed it and the PR explains it. Numbers and
   tolerances must not loosen.
3. **Claims:** reproduce the key one yourself (for a code move, join and diff; for performance, rerun; for
   behaviour, a deterministic trace through the façade at a fixed `dt`, not wall-clock browser timing).
4. **Architecture checklist** (what no script checks; `npm test` already lints DOM in `world/`/`sim/`, browser
   globals, module state, "+y is downhill", colours and the frame): the camera is not advanced in draw; no
   per-frame allocations; the design fits the package; an ADR for anything costly to undo; docs say the right thing.
5. **Look at it** only when the smoke test flags something or the change is visible: open at most two screenshots
   (`shots/`). A problem marked "also on main" is an existing bug, not the package's.
6. A verdict: **joins the round**, or **sent back** (to the same agent through SendMessage, with what to fix). Write
   down what you checked, decisions on the agent's open questions, and what the owner should try; that goes into the
   round PR, not into a comment of its own.
7. Record non-blocking notes you want done later as rows in STATUS's **Debt** table (item, stream, from PR,
   trigger), not only in the review: notes left in a review are forgotten.
## The round PR (one per round, X3)
Wait until **every** package of the round has joined or been held back; don't open the round PR piecemeal.
1. `git worktree add /home/claude/gresca-round-<n> -b round/<n> origin/main`, then merge each joined branch with
   `git merge --no-ff origin/<branch> -m "Round <n>: join <package id>"`: contract and Shared packages first, then by
   fewest conflicts. You resolve conflicts here (that's the merge work the owner used to do); a conflict that needs a
   design decision goes back to the stream agents.
2. On the round branch: `npm test` and `npm run test:rotated`, the smoke test, and the golden trace if any package
   claimed no behaviour change. A package that breaks the round is reverted out (`git revert -m 1 <merge sha>`) and
   listed under **Not in this round**.
3. Your own commit on top: `docs/STATUS.md` (done, debt, waiting on the owner) and any `docs/ROADMAP.md` decisions,
   so STATUS is right the moment the round merges. No separate docs PR.
4. Open the PR (`Round <n>: <what>`, body from `.github/round_pr_template.md`). **What changed** is in plain words
   per package, what the player notices first. **What to test (iPad)** is a numbered list the owner can do in one
   session: each step a tappable link (the preview with the right `?scene=`, `?map=` or `?spike=`; images and docs
   as `https://github.com/shutfordite/gresca/blob/round/<n>/<path>`) and what they should see or feel.
5. When the Preview comment arrives, send the owner one message: the round PR link, the preview link, the test list
   and any verdict questions. That is the whole owner loop: one iPad session, one merge.
6. **Fixes during testing:** the owner comments on the round PR. The stream agent fixes on its own branch, you merge
   the branch into `round/<n>` again and say in a PR comment what to re-test. To drop a package instead, revert its
   merge commit. Never force-push the round branch.
7. After the owner merges: check `git log origin/main --oneline -5`, delete the round and stream branches, remove the
   worktrees, and brief the next round from `origin/main`.
- No stacked PRs any more: a package that needs another of the same round branches from it and is merged after it;
  one that needs a package not yet ridden by the owner waits for the next round.
- **Owner to-dos** (only if something can't be done by an agent or a workflow) go in the same message.
- Between rounds `main` doesn't move except for the round PR, so stream branches never need updating mid-round. A
  hotfix the owner asks for directly is its own small PR, and the round branch merges `origin/main` after it lands.

## Decision rules
- Settle shared seams (contracts, frames, interfaces) before work fans out. Move code once, and reformat it in the
  PR that already rewrites it.
- Existing bugs found in review get their own small PR, with a test that fails on `main`.
- An owner chore that agents can't do from the sandbox (a download, a bake, a terminal step) becomes a workflow the
  owner starts with one tap (like **Bake map**), not a to-do that waits. The owner works from an iPad.
- Debt: each stream's next package clears one of its Debt rows, or its report says why not. A row older than a week
  is raised in the round PR's **Debt**.
- Lessons go into the method: a retrospective or incident ends with edits to this skill or an `AGENTS.md`, not only
  a note in `docs/ROADMAP.md` (the X1 merge rules sat in the roadmap for a day). Retrospectives:
  `docs/RETROSPECTIVES.md`.
- Keep the core promise in view: real mountains. Don't let it wait behind feature work when a workflow or a parallel
  package can move it.
- Product questions go to the owner with a recommendation. Pure engineering choices you make yourself, with the
  reasons recorded (in the review, `docs/ROADMAP.md` or an ADR).
- Keep tokens low (the rules agents follow are in `AGENTS.md`, "Token budget"):
  - No full-file reads when a `grep` or `sed -n` range will do. For the art spec, `node tools/outline.mjs <file> 2`.
  - Use the quiet `npm test`; rerun one file verbosely only to debug it.
  - Pick the cheapest agent that can do the job: Sonnet for implementation packages, Haiku or the read-only
    Explore agent for searches, Opus for the coordinator, reviews and contract or frame decisions.
  - Screenshots cost about 1.5k tokens each: at most two per check (the smoke test takes them at scale 1), none for
    no-behaviour-change refactors whose proof is a trace or a digest.
  - Short reports from agents (set a word limit in the brief) and no repeating long docs back to the owner.
  - One thread per round: when the round PR is merged, start the next round in a new thread ("continue from
    docs/STATUS.md") instead of carrying the old context along.
