# ADR 0014: the CPU renderer's role

Date: 28 Nov 2026. Status: proposed (G4), waiting on the owner's answer in Round 1.

## Context
The GPU terrain (three.js, ADR 0008) is the default since E1a, accepted on the iPad at 50 to 60 fps. The CPU
raycaster (`?renderer=cpu`, the colour map, `view/colour-map.js`) is still built and extended: every visual feature
is paid twice or left behind on the CPU (the powder look, #89), and G5 to G7 are blocked on knowing what it must keep
doing. Round 1's frame-garbage measurement (S4 frame-garbage) found the CPU path allocates about 377 KB a frame
(mostly boxed `terrain.height` results in the raycast and trees) against about 87 KB on the GPU path. Every
browser that runs the game well (iPad Safari, desktop Chrome, Firefox, Safari) has WebGL2.

The Node test suite rides the sim and the CPU view without a GPU; that does not depend on players seeing it.

## Decision (recommended)
The GPU renderer is the game. The CPU raycaster becomes a **frozen fallback**:
- It keeps working: shown when WebGL2 is missing or the context can't be made, and ridden by the Node suite and
  `npm run shot`.
- It gets no new looks. Features drawn only on the GPU (powder look, park dye lines, whole-mountain tiles) are not
  ported; its Debt rows close as "won't do".
- It keeps today's 1000 × 2450 m window on real maps (ADR 0015): `paint-window.js` stays for the CPU path only.
- G5 stops building the colour map in GPU mode; the CPU path still builds it.
- `?renderer=cpu` fetching three.js it doesn't use (#102) is accepted.

## Alternatives
- **Drop the CPU renderer**: a device without WebGL2 shows a message. Removes the colour map, the raycaster and the
  window; the Node suite would need a stub view for its view tests. Cheapest to maintain; loses the no-GPU path.
- **Keep it equal**: every look on both. Doubles the cost of every visual package; needs its own ADR for the whole
  mountain on the CPU.

## Consequences
`src/view/AGENTS.md` and ADR 0008 say the CPU path is frozen; S4 briefs stop listing CPU work. Revisit if a target
device without WebGL2 matters.
