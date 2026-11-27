<!-- Title: "<package id>: <what>", e.g. "B2b: state contracts and events". See docs/ROADMAP.md. -->

**Package:** <!-- e.g. B2b, S2/F5. One package per PR. -->

**What and why:**

**Behaviour changes:** <!-- "none", or each change with how it was measured -->

**Test changes:** <!-- new tests; any changed test and why (assertions are never weakened) -->

**Contracts touched:** <!-- none, or which of InputState / RiderState / SimEvent / AnimInput / Course / Look / Terrain. A contract change is its own PR, merged first. -->

**Try in the preview (iPad):** <!-- what to do and what you should see or feel -->

**Owner verdict needed:** <!-- "no", or "yes: <the one question for the iPad>" when this is judged by feel or eye (a gesture, physics feel, a pose, framing, scale). Nothing is built on it until the owner answers. -->

**Debt:** <!-- "none", or each Debt row (docs/STATUS.md) this clears and anything it leaves for later, with the trigger to do it. Don't edit docs/STATUS.md: the coordinator copies this in. -->

**Screenshots:** <!-- before/after for anything visible (view/, art/, styles/) -->

**Checklist**
- [ ] `npm test` passes
- [ ] Docs updated where this change makes them wrong (README, the AGENTS.md files and their code maps, docs/; not STATUS)
- [ ] ADR added if this is costly to undo (dependency, file format, frame or unit convention, layering)
