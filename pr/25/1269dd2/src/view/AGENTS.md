# src/view: drawing the game (stream S4; the rider files are S3)

- Read-only on the sim: `view/` reads `rider`, `session` and `world` and never writes them.
- The camera is advanced in the loop (`updateCamera()`, called from `app.js` before `draw()`), never inside `draw()`.
- Ski tracks are the view's (`ski-tracks.js`), marked from RiderState after each sim step (a bus step hook).
- Colours and sizes come from `HANGA` palette roles and values (passed in as `env.HANGA`), never copied hex or
  numbers. Some hex is still hard-coded in `sprites.js`; P4 moves it into the Look.
- No per-frame allocations in the raycast, tree or sprite loops: reuse the buffers in `view-state.js`.
- Anything that changes render cost reports frame time before and after (Node and headless Chrome).
- Visible changes come with before/after screenshots (at most two per check) and a "try in the preview" note;
  check Safari on iPad.
- Rider files (`rider-animation.js`, `rider-draw.js`) are stream S3 and follow `art/AGENTS.md` too.
