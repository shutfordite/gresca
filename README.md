# Gresca

A freestyle ski and snowboard game for the browser. You ride a run of kickers, rails and boxes, spin in the air and
land switch. It is a fan-made project inspired by mobile snow games, and is not affiliated with or endorsed by any
game studio or ski resort. The whole game is one file, `index.html`, and all art is drawn in code.

*Gresca* is Catalan for a lively, rowdy commotion. The first map is set in Grandvalira, Andorra (the El Tarter sector).

## Play

Open `index.html` in a browser. There is nothing to build or install.

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

## Tests

```
npm test
```

Needs Node 20 or newer, and no packages. The tests run the game's real `<script>` inside a Node `vm` with stubbed
browser APIs (`test/harness.js`), so no game code was refactored for testing.

- `test/physics.test.js`: terrain, gravity, brake, steering, jumping, kickers, trees, finish.
- `test/features.test.js`: touch and keyboard input, camera framing, snow look, spin and switch riding, rendering
  smoke tests and full-run integration tests with an autopilot.
- `test/park.test.js`: kickers, rails and boxes, and the Snowboard / Skis menu.

Run `npm test` after every change. To test another copy of the game: `GAME_FILE=/path/to/file.html npm test`.

## Tools

`tools/bake-el-tarter.html` runs in your own browser, downloads elevation tiles and OpenStreetMap pistes and lifts for
El Tarter, and saves a compact terrain file for the game. Wiring that data into the game is the next milestone.

## Known limits

- The terrain is still procedural. Real elevation and OpenStreetMap pistes are the next step.
- Tests do not check pixels of trees, the rider or particles, because the canvas is stubbed.

## Credits and data

Elevation tiles: AWS Terrain Tiles (built from SRTM and other public sources). Pistes and lifts:
© OpenStreetMap contributors, available under the ODbL.
