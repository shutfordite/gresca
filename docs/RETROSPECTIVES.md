# Retrospectives

Each one ends with changes to the method (`.claude/skills/gresca-architect/SKILL.md`, the `AGENTS.md` files, CI),
not only notes. Newest first.

## 27 Nov 2026: too many PRs to test (X3)

**What happened.** Each package was its own PR, so a day with five streams meant five previews to ride, five merges in
order, `update-branch` between them, and a separate STATUS PR. The owner found the testing too much.

**Change.** One PR per round. Stream agents push branches and open no PRs. The coordinator reviews each branch
(`tools/review/run.mjs` and the smoke test, run on the branch), then, once every stream has finished, joins them into
`round/<n>` with the STATUS update on top and opens `Round <n>: <what>` from `.github/round_pr_template.md`: what
changed in plain words, and a numbered list of what to test on the iPad, each step a link. The PR check knows round
PRs (several streams and a STATUS edit are expected there; it checks the round template). Fixes during testing go
on the stream branch and are merged into the round again; a package that fails is reverted out of the round.
Method: `SKILL.md` ("The round PR"), `AGENTS.md` ("Every change").

## 27 Nov 2026: the H stack merged into itself

**What happened.** H0–H3 (#84, #85, #88, #89) were opened as a stack, each PR based on the branch below it. The owner
merged all four within a minute, bottom first. #84 went into `main`, but GitHub doesn't retarget a PR when its base
merges (only when the base branch is deleted), so #85, #88 and #89 merged into `shared/h0-snow-contract`,
`s5/h1-powder-depth` and `s2/h2-snow-contact`, already-merged branches. They showed "merged", but `main` had only H0.
**Change:** the skill's "Merging and keeping branches current" now says: before the owner merges the next PR of a stack,
the coordinator retargets it to `main` (`gh api -X PATCH …/pulls/<n> -f base=main`) and merges `main` into it, and
it checks `main`'s log after the batch. The H work landed through #90.

## 27 Nov 2026: the first 72 PRs (18–27 Nov), applied in X2

**What worked.** Settling the seams first (contracts, the `Course`, the ENU frame, the Look) let S1–S5 run in
parallel: ten stream PRs landed on 26 Nov without architecture rework. Removing "+y is downhill" before brake, carve
and fakie meant none of them was rewritten. Machine checks (PR check, golden trace, look and frame lints, bench gate)
made reviews short. Repo docs as the single source of truth made handover between threads work.

| # | What didn't work | Change (X2) |
|---|---|---|
| L1 | The core promise, riding a real mountain, still isn't delivered. El Tarter waited from 21 Nov on a terminal step the owner, on an iPad, couldn't easily run; the sandbox can't reach the data hosts. K was queued ahead of C4b. | **Bake map** workflow (`.github/workflows/bake-map.yml`): one tap, a PR with the files. C4b runs alongside K. Skill rule: an owner chore agents can't do becomes a workflow. |
| L2 | Conflicts moved: `AGENTS.md` (its code map) changed in 24 of 43 PRs since 21 Nov, `docs/STATUS.md` in 12. | Code map rows live in each folder's `AGENTS.md`; the PR check looks there. Only the coordinator edits STATUS; stream PRs report in their body, and the check warns. |
| L3 | Feel decisions were reversed after an iPad ride: one-finger flips (#60 → #68, written by the owner), the play mountain "looks flat" (#48), F1 rider scale never closed, poses need tuning. | **Feel spikes** in the skill: a throwaway PR behind `?spike=`, one question, the verdict recorded, then the package. The PR template asks "Owner verdict needed". F1 is back as an S4 package after a framing spike. |
| L4 | The X1 merge rules sat in the roadmap; the skill never learned them. | The skill has "Merging and keeping branches current", and a rule: lessons go into the skill or `AGENTS.md`. |
| L5 | Known issues and review notes went stale (slow frames since #37, scenes not riding straight, #66's allocations, poses). | A **Debt** table in STATUS (item, stream, from, trigger); each stream's next package clears one row or says why not; the template asks for debt. |
| L6 | CI never saw the GPU renderer players use: every browser check forces `?renderer=cpu`. | `npm run smoke:gl` and the CI `gl-smoke` job: two scenes on software WebGL must draw a real frame with no page error or lost context. |
| L7 | `AGENTS.md` was 20 KB (about 5k tokens) in every agent session and growing. | Root `AGENTS.md` cut to the core rules and an index: 8 KB, and it no longer grows with each file. |
| L8 | The owner is the bottleneck for merges and iPad checks; work came in bursts. | The **owner loop** in the skill: one daily try list (previews, what to try, at most one question each) and one merge batch, branches updated between merges. |
