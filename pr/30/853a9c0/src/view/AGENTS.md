# src/view: drawing the game (stream S4; the rider files are S3)

- Read-only on the sim: `view/` reads `rider`, `session` and `world` and never writes them.
- The camera is advanced in the loop (`updateCamera()`, called from `app.js` before `draw()`), never inside `draw()`.
- Ski tracks are the view's (`ski-tracks.js`), marked from RiderState after each sim step (a bus step hook).
- Colours, tones, sky, fog, sprite colours and camera framing come from the Look (`look/look.js`, built once by
  `look/hanga.js` from `env.HANGA`; ADR 0006), never copied hex or numbers. Only `look/hanga.js` reads `HANGA`'s
  fields; `test/look-lint.test.js` checks. S3 and S4 meet only through `look.rider.project(rig, pose, view)`.
- Check a look change in `lab.html` (every pose, rig, yaw and pitch, tones, sprites, roles).
- No per-frame allocations in the raycast, tree or sprite loops: reuse the buffers in `view-state.js`.
- World frame (ADR 0005): positions are ENU metres and headings counter-clockwise from east, so screen-right is
  clockwise. The colour map is a texture on the map's grid: reach it through `view.mapFrame`, never by world x, y.
  Compass degrees only at the spec boundary (`camCompass()`, the sun).
- Anything that changes render cost reports frame time before and after (Node and headless Chrome).
- Visible changes come with before/after screenshots (at most two per check) and a "try in the preview" note;
  check Safari on iPad.
- Rider files (`rider-animation.js`, `rider-draw.js`) are stream S3 and follow `art/AGENTS.md` too.
