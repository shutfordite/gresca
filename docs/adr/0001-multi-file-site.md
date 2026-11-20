# ADR 0001: The game is a multi-file static site, not one HTML file

Date: 20 Nov 2026. Status: accepted (owner decision).

## Context
The game shipped as one `index.html` with the art modules embedded by `tools/embed-art.js`, so it could be opened from
disk. Authoring in one file blocks the refactor (phase B), and real maps (phase C) need data files of 1–2 MB that should
not be inlined. Testing is done mainly on an iPad, through the GitHub Pages preview that every PR gets.

## Decision
- The game is a static site: `index.html`, `art/`, `src/`, `maps/`, `assets/`, served over HTTPS (GitHub Pages).
  Opening `index.html` from disk is no longer supported; use the Pages link, or any static server locally
  (`npx serve`, `python3 -m http.server`).
- Still **no build step and no runtime npm packages**: the browser loads the files as they are in the repo. A bundler
  or a vendored library needs its own ADR.
- B1 splits the game script into ordered classic `<script src>` files that share globals exactly as today (no logic
  change). B2 converts `src/` to native ES modules as it moves state into objects; from then on `world/` and `sim/`
  are imported directly by Node tests.
- The art modules are loaded with `<script src>` from `art/`; `tools/embed-art.js` and the embed drift test go away.
- Previews publish each commit to its own folder (`pr/<n>/<commit>/`) so the browser cache can never mix files from
  two builds (PR #11).

## Consequences
- The iPad preview flow is unchanged: one link per PR, now cache-safe.
- Whether the game may fetch third-party data at runtime is a separate question (D0 in `docs/REAL-WORLD-DATA.md`);
  a multi-file site makes it possible but does not decide it.
- The test harness must load `<script src>` files (B1) and later ES modules (B2) instead of inline blocks.
