# Gresca

A freestyle ski and snowboard game for the browser. You ride a run of kickers, rails and boxes, spin in the air and
land switch. It is a fan-made project inspired by mobile snow games, and is not affiliated with or endorsed by any
game studio or ski resort. It is a static site with no build step: `index.html` loads the art modules from `art/` and
the game's scripts from `src/`, and all art is drawn in code.

*Gresca* is Catalan for a lively, rowdy commotion. The first map is set in Grandvalira, Andorra (the El Tarter sector).

## Play

The latest `main` is playable at https://shutfordite.github.io/gresca/. Every pull request also gets its own playable
preview at `https://shutfordite.github.io/gresca/pr/<number>/`, linked in a comment on the pull request
(`.github/workflows/preview.yml`).

To play a local copy, serve the folder with any static server and open the address it prints, for example:

```
python3 -m http.server     # then open http://localhost:8000/
```

There is nothing to build or install. Opening `index.html` straight from disk is no longer supported
(`docs/adr/0001-multi-file-site.md`).

## Controls

| Input | Action |
|---|---|
| Hold left or right half of the screen | Turn left or right (spin, in the air) |
| Press both halves together | Jump |
| Left or right while in the air | Spin |
| Swipe down (hold) | Brake |
| Keyboard | Arrows or A/D steer, both together jump (or Space/Up/W), Down or S brakes |

The board and skis are twin tip. Landing after a 180 or 360 is clean, and the rider carries on down the slope
switch (tail first). Landing sideways, such as after a 90, is a wipeout. On the snow you can carve within
forward or switch, but you can only change between them by spinning in the air.

Kickers launch fast riders automatically. A clean landing after real air time scores points, with a bonus for each
half-turn.

## The run

- 14 kickers, 5 of them big. Each has orange flags on both sides of the lip and a bluish pad painted up the ramp.
- 13 rails (red bars) and boxes (wide mint bars) on either side of the piste. Ride onto one, or drop onto it from a
  jump, roughly along its length, to grind it. Steering is locked while you grind. Press both sides to jump off.
- Between y 460 and 740 there is a deliberately empty stretch of piste. The physics tests rely on it.

## Equipment

The menu has a Snowboard / Skis picker, remembered where the browser allows it. Skis carve a little quicker (1.12x
turn rate), grip better and spin slightly faster.

## The rider

The rider is drawn from the Hanga Dawn art spec and animated by a small pose and body-dynamics layer:

- `art/gresca-hanga-spec.js` is the art spec (v1.3.0), a byte-for-byte copy of the one on the design canvas. The
  game uses its rider rig, poses, blend timings and `HANGA.projectRider`.
- `art/gresca-rider-anim.js` (`RiderAnim`) picks the pose with `HANGA.poseFor`, blends over `HANGA.blendTime`, holds
  the landing pose and snaps into a wipeout. On top of the pose it adds body dynamics, so the rider reacts to any
  terrain: the legs absorb the ground through a spring and squat deeper on harder landings, the rider leans into
  turns by the real turn rate (`atan(v·ω/g)`), the upper body angulates, the outside arm counterbalances, and the
  stance gets lower on ground steeper than the map's mean gradient and at speed. Every number is in `RiderAnim.tune`.
- `index.html` loads both files from `art/` with `<script src>`, before the game's `src/` files. Nothing is embedded
  or copied: change a file in `art/` and the game uses it.
- A goofy snowboard stance is read from `localStorage` key `gresca-stance` (the menu control is still to come).

## Tests

```
npm test
```

Needs Node 22.8 or newer (`"engines"` in `package.json`), and no packages. The tests read the `<script src>` files
`index.html` names and run them, in page order, in one Node `vm` with stubbed browser APIs (`test/harness.js`), so they
exercise exactly the files the browser loads. Tests read and drive the game only through `window.Gresca`, a small
façade in `src/debug.js` (`state()`, `set()`, `place()`, `sim()`, `frame()`, `input()`, `world`, and `debug` for
render internals). They never name the game's globals, so its state can be reorganised without touching the tests.

- `test/page.test.js`: `index.html` has no inline script code and loads every file in `art/` and `src/` exactly once,
  in the expected order, and every file it names exists.
- `test/facade.test.js`: a lint that fails if any test's `g.run('...')` string names a top-level identifier of the
  game's `src/` files, plus round-trip checks of the façade.

- `test/physics.test.js`: terrain, gravity, brake, steering, jumping, kickers, trees, finish.
- `test/features.test.js`: touch and keyboard input, camera framing, snow look, spin and switch riding, rendering
  smoke tests and full-run integration tests with an autopilot.
- `test/park.test.js`: kickers, rails and boxes, and the Snowboard / Skis menu.
- `test/rider-anim.test.js`: the spec module's version, the pose follows game state with the spec's timing,
  and the body dynamics (lean, compression, landings, steepness) behave and stay stable.

Run `npm test` after every change. To test another copy of the game: `GAME_FILE=/path/to/index.html npm test` (its
`<script src>` paths are resolved relative to that file; inline `<script>` blocks of older single-file versions run
too).

## Tools

There is no build tool: the browser loads the files as they are in the repo.

`tools/bake-el-tarter.html` runs in your own browser, downloads elevation tiles and OpenStreetMap pistes and lifts for
El Tarter, and saves a compact terrain file for the game. Wiring that data into the game is the next milestone.

## Known limits

- The terrain is still procedural. Real elevation and OpenStreetMap pistes are the next step.
- Tests do not check pixels of trees, the rider or particles, because the canvas is stubbed.

## Credits and data

Elevation tiles: AWS Terrain Tiles (built from SRTM and other public sources). Pistes and lifts:
© OpenStreetMap contributors, available under the ODbL.
