# src/ui: HUD, menu and screens (stream S1, with `styles/`)

- UI subscribes to SimEvents on the bus (`src/core/events.js`) and reads state; it never writes the rider or the sim.
- Colours are `var(--…)` tokens from the Look's `ui` (`test/look-lint.test.js`); CSS lives in `styles/*.css`, never
  inline.
- Storage keys `gresca-rig`, `gresca-stance` and `gresca-hints` must keep working (root `AGENTS.md`, "Do not break").

## Code map
| To change | Edit | Tests |
|---|---|---|
| HUD, score popup, minimap | `hud.js`, `styles/hud.css` | `facade`, `features`, `events`, `look-lint` |
| Menu, rig and stance picker, finish screen | `menu.js`, `styles/menu.css`, `index.html` | `park`, `page`, `events`, `stance` |
| The Controls screen (generated from `src/input/bindings.js`; gesture diagrams) | `controls.js`, `styles/menu.css` | `controls` |
| Pause: the button, the panel, hidden-page auto-pause (`hud.paused`; the loop in `app.js` honours it) | `pause.js`, `styles/hud.css` | `pause` |
| Air hints (flip and spin arrows for the first 3 jumps, `gresca-hints`) | `air-hints.js`, `styles/hud.css` | `air-controls` |
| The camera view's name label after a switch (`#cam-label`, fades in CSS) | `camera-label.js`, `styles/hud.css`, `index.html` | `tap-rider` |
| What tests can read of the UI | `fields.js` | `facade` |
