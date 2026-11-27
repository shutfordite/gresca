# src/input: controls (stream S1)

- `bindings.js` is the one table of what each key and gesture does; the Controls screen (`src/ui/controls.js`) is
  generated from it, and `test/controls.test.js` checks every binding appears there. Change controls only through it.
- Input fills `InputState` (`src/core/contracts.js`); it never reads or writes the rider. The sim tells input it is
  airborne through `setAirborne`, nothing more.
- `bind-input.js` is the only file here that touches the DOM; `input.js` is pure logic and tested in Node.
- Gestures are judged on the iPad: say in the PR what to try, and ask for the owner's verdict before building more
  on a new gesture (the one-finger flips of #60 were replaced after a ride, #68).

## Code map
| To change | Edit | Tests |
|---|---|---|
| Which keys and gestures do what (the one table) | `bindings.js` | `bindings`, `controls` |
| Touch and key controls; flips in the air (`InputState.flip`, `setAirborne`); look back | `input.js` (logic), `bind-input.js` (DOM) | `features`, `sim`, `contracts`, `bindings`, `air-controls` |
| What tests can read of input | `fields.js` | `facade` |
