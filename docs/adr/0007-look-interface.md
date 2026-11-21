# ADR 0007: the Look, one seam for how the game looks

Date: 21 Nov 2026. Status: accepted (P4).

## Context
Before P4 the view read the art spec (`HANGA`) all over: palette roles in the sky, rider and shadow, spec functions
for fog and camera pitch, `hanga.maps.procedural` in the rider animation, and hex literals in `sprites.js`,
`draw.js` and `colour-map.js` that the spec does not have. A second look (or a new spec version, D2's per-pixel
shading, a real map's sky) would have meant editing render code. Streams S3 (rider animation) and S4 (look, camera,
render) need one interface to meet at.

## Decision
- **The `Look`** (typedef and `validateLook()` in `src/view/look/look.js`): `version`, `roles` and `colour(role)`
  (throws on an unknown role), `terrainTone(lit, groomed, stripeWave, rock, out)` (the colour map's tone until D2),
  `sky` {stops, sun}, `fog` {rgb, amount(dM, farM)}, `sprites` {tree, flag, pole, rail, box, spray},
  `camera` {lookAheadM, riderMarginDeg, partialPitchDeg(levelDeg, fullDeg)}, `ui` (CSS custom properties) and
  `rider` {poses, project(rig, pose, view), keylineM, meanSlopeDeg, stanceStorageKey}.
- **`rider.project(rig, pose, view)`** is the S3/S4 contract: pose is a spec pose name or a live RiderAnim state,
  view is `{yawDeg, pitchDeg (null: the look's default), stance}`; it returns the draw list in metres with colours as
  roles. The view draws only that list.
- **`src/view/look/hanga.js`** (`createHangaLook(HANGA, RiderAnim)`) is the only file that reads the spec's fields.
  It resolves colours once. Colours the spec has no role for keep their current values there, named as roles (a
  request for a later spec version). Camera framing is read from the spec at each use, so tuning it live still works.
- `createGame(env)` builds the look once and passes it in; `main.js` still only hands `HANGA` through `env`.
- CSS colours are custom properties: the game sets `look.ui` on `<html>` at start-up, and `styles/base.css` `:root`
  repeats them as defaults (the only colours in `styles/`), so the page is coloured before the module runs.
- `test/look-lint.test.js` bans hex and `rgb()` literals and `HANGA` in `src/` outside `src/view/look/`, and colours
  in `styles/` outside that `:root`; `test/look-contract.test.js` checks the contract.

## Consequences
- A new look is a new `createXLook()` returning a valid `Look`; render code does not change.
- Camera distances (`CAM_BACK`, `CAM_HEIGHT`, `FOV`, `HORIZON_FRAC`, `RIDER_SCALE`) stay tunables in `core/config.js`
  for now; F1 decides whether they become look framing.
- D2 replaces `terrainTone` with per-pixel shading through the look (posterised tones from the spec).
