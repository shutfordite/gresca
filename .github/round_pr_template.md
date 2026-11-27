<!-- Title: "Round <n>: <the round in a few words>", e.g. "Round 4: El Tarter rides, two-finger grabs".
One PR per round (X3): the coordinator joins every stream branch that passed review into `round/<n>` and opens this.
The owner tests this one preview and merges this one PR. Plain words: the owner reads it on an iPad. -->

**Round:** <!-- n, and the date -->

**Packages:** <!-- one line each: stream, package id, one-line what, its branch. Contract or Shared packages first. -->

**What changed:** <!-- per package, two or three plain sentences: what the player will notice, then anything under the
hood worth knowing. "Nothing visible" when that is true. -->

**What to test (iPad):** <!-- a numbered list the owner can follow in one session, each step a tappable link
(the preview with the right `?scene=`, `?map=` or `?spike=`) and what you should see or feel. Group by package. -->

**Owner verdicts needed:** <!-- "none", or each question (a feel spike, a pose, a gesture) with the link to try it.
Nothing is built on a spike until the owner answers. -->

**Proof:** <!-- per package, the evidence from its review: tests added, golden trace, digests, frame time. Short. -->

**Debt:** <!-- rows this round clears and adds (also in docs/STATUS.md, which this PR updates) -->

**Not in this round:** <!-- "none", or packages held back and why (failed review, waiting on a verdict) -->

**Checklist**
- [ ] Every stream branch passed review (`npm run review` on the branch) before it joined the round
- [ ] `npm test` and `npm run test:rotated` pass on the round branch
- [ ] `docs/STATUS.md` updated for this round
