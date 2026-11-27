# src/view: drawing the game (stream S4; the rider files are S3)

- Read-only on the sim: `view/` reads `rider`, `session` and `world` and never writes them.
- The camera is advanced in the loop (`updateCamera()`, called from `app.js` before `draw()`), never inside `draw()`.
- Ski tracks are the view's (`ski-tracks.js`), marked from RiderState after each sim step (a bus step hook): the
  colour map for the CPU raycaster, and `view.trail` (`track-trail.js`, what the board or skis cut) for the GPU ribbon.
- Colours, tones, sky, fog, sprite colours and camera framing come from the Look (`look/look.js`, built once by
  `look/hanga.js` from `env.HANGA`; ADR 0007), never copied hex or numbers. Only `look/hanga.js` reads `HANGA`'s
  fields; `test/look-lint.test.js` checks. S3 and S4 meet only through `look.rider.project(rig, pose, view)`.
- Check a look change in `lab.html` (every pose, rig, yaw and pitch, tones, sprites, roles).
- No per-frame allocations in the raycast, tree or sprite loops: reuse the buffers in `view-state.js`.
- World frame (ADR 0005): positions are ENU metres and headings counter-clockwise from east, so screen-right is
  clockwise. The colour map is a texture on the map's grid: reach it through `view.mapFrame`, never by world x, y.
  Compass degrees only at the spec boundary (`camCompass()`, the sun).
- Anything that changes render cost reports frame time before and after (Node and headless Chrome): `npm run bench --
  --chrome` (stages, median of 5 runs; the numbers to beat are in `tools/bench/baseline.json`) and, for a change that
  must not alter a pixel, `node tools/bench/digest.mjs` and `--path` before and after (`--root DIR` measures another
  checkout). CI fails a stage more than 25% slower than main (`tools/bench/compare.mjs`).
- Frame stages are timed through `view.timer` (null when off: one branch per stage in `draw()`); a new stage gets a
  `STAGE` name in `view-state.js` and one `lap()` call, nothing else.
- In a loop that never yields to the browser (a test page, a script calling `Gresca.frame()`), Chrome queues each
  frame's canvas work and rasterises about 45 frames at once (about 200 ms): mean frame time is then several times the
  median. The game's own loop does not do this. Time such a loop with the bench's forced flush, not by eye.
- Visible changes come with before/after screenshots (at most two per check) and a "try in the preview" note;
  check Safari on iPad.
- Rider files (`rider-animation.js`, `rider-draw.js`) are stream S3 and follow `art/AGENTS.md` too.

## Code map
| To change | Edit | Tests |
|---|---|---|
| Camera follow, tilt, compass, the swing to look back (`InputState.lookBack`), the framing eased to the camera mode (`CAM_MODES`: `back`, `rise`, `fov`, `focalFrac`, `horizonFrac` live on the camera; renderers read `camera.fov`, never `FOV`) | `camera.js` | `camera`, `camera-follows-mode`, `look` |
| Terrain render (CPU), trees, rider placement (sunk in powder: the snow line and its mound), spray puffs; the stage timer `view.timer` | `draw.js`, `view-state.js` | `features`, `look`, `timer` |
| Which renderer draws (GPU by default, `?renderer=cpu`) and the fallback; the `?fps=1` readout | `renderer.js`, `fps-meter.js` (ADR 0008) | `gl-terrain`, `timer` |
| The GPU terrain and objects (three.js in `vendor/three/`): projection, clipmap mesh, baked textures, snow and sky shaders, horizon, sun and rider shadows (E2), texture budget, instanced trees (E3a), park mesh and sun visibility (E3b), lost context, the track ribbon | `gl/` (`gl-renderer.js`, `gl-projection.js`, `terrain-mesh.js`, `terrain-bake.js`, `detail-texture.js`, `snow-material.js`, `sky-material.js`, `horizon.js`, `sun-shadow.js`, `rider-shadow.js`, `gl-budget.js`, `tree-mesh.js`, `park-mesh.js`, `sun-visibility.js`, `context-loss.js`, `track-ribbon.js`) | `gl-terrain`, `gl-shadow`, `gl-resilience`, `gl-trees`, `gl-park`, `track-trail`; in a browser `npm run smoke:gl` (CI `gl-smoke`) |
| Ski tracks: what the board or skis cut (from `boardHeading`, `travelHeading`, `skid`, braking, the rig; a wider, deeper trench from `sink` in powder) | `track-trail.js` (pure), `ski-tracks.js` (per-step hook, CPU colour map), `gl/track-ribbon.js` | `track-trail`, `features`, `games` |
| Every colour, tone, sky and fog value, sprite colour, camera framing value, CSS token, rider projection (the Look) | `look/look.js` (interface), `look/hanga.js` (the only reader of `HANGA`) | `look-contract`, `look-lint`, `look` |
| The look lab (every pose, yaw, pitch, tone, sprite, role) | `/lab.html`, `look/lab.js` | `lab` |
| Where snow, rock and park colours are painted (CPU); on a real map, in a window along the run (`view.mapFrame`, `view.mapBounds`) | `colour-map.js`, `paint-window.js` (C4b) | `features`, `build`, `real-map` |
| Sky, sun, fog | `sky.js` | `look` |
| Flags, poles, rails on the CPU raycaster and after a lost GL context | `sprites.js` | `park` |
| A real run's edge poles: in its difficulty colour, orange-topped on the right going down (CPU `drawPistePoles`, GPU `gl/park-mesh.js`; colours `sprites.pistePole` in the Look) | `piste-poles.js` | `real-map`, `gl-park` |
| Rider pose input and body motion (S3) | `rider-animation.js` (with `art/gresca-rider-anim.js`) | `rider-anim`, `rider-lean`, `rider-twist`, `rider-brake-twist`, `rider-flip` |
| Drawing the rider (S3) | `rider-draw.js` | `rider-anim` |
| What tests can read of the view (`Gresca.debug`) | `fields.js` | `facade`, `look` |
