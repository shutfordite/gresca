# ADR 0003: Playwright is a dev-only tool

Date: 21 Nov 2026. Status: accepted (P5).

## Context
Agents and reviewers could not see the game: tests run in Node with a stubbed canvas, and the preview needs a human
with an iPad. Look and feel changes (S3, S4) need a picture. A real browser is the only way to get one. ADR 0001 says
the game has no build step and no runtime packages; this records the one exception for tooling.

## Decision
- `playwright-core` is a **devDependency**, pinned to an exact version in `package.json` (no `^`), with
  `package-lock.json` committed. It is the library without the bundled test runner; browsers are not downloaded by
  `npm install`.
- It may be used for tests, CI and `tools/` only (today `tools/shot.mjs`, `npm run shot`). It is never imported from
  `src/`, `art/` or `index.html`, never shipped, and not in the preview `SITE`. `npm test` does not import it, so the
  test job runs with it installed but unused, and the game still has no runtime packages.
- Screenshots: every scene (`src/scenes.js`) for board and skis at 820x1180, scale 1, into `shots/` (gitignored).
  CI runs this only on pull requests touching `src/view/`, `art/` or `styles/` and uploads `shots/` as an artifact.
- Locally, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chrome/Chromium; otherwise run
  `npx playwright-core install chromium` once.

## Updating
Change the exact version in `package.json`, run `npm install`, run `npm run shot`, look at two shots, and commit
`package.json` and `package-lock.json` together in a PR of their own. In CI the browser is installed by the same
version's CLI, so they cannot drift apart.

## Consequences
- Screenshots are Chromium on Linux, not Safari on iPad: they show the look, not iPad-specific behaviour. Check those
  in the preview.
- Any other use (end-to-end tests that gate merges) needs a new decision.
