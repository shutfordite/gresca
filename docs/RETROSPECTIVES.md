# Retrospectives

Each one ends with changes to the method (`.claude/skills/gresca-architect/SKILL.md`, the `AGENTS.md` files, CI),
not only notes. Newest first.

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
