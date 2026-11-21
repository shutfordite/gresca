# ADR 0008: a GPU terrain renderer with three.js, vendored

Date: 21 Nov 2026. Status: accepted (owner, 21 Nov 2026: 50 to 60 fps on the iPad, "a big improvement"). Since E1a the
GPU renderer is the default; `?renderer=cpu` (and any device without WebGL2) draws with the CPU raycaster.

## Context
The terrain is drawn by a CPU voxel raycaster (`src/view/draw.js`): at most 360 columns, scaled up to the screen
(about 244 × 528 render px on an iPad, shown at 1640 × 2360), from a colour map with one texel per metre and lighting
baked into it. That is a hard ceiling: the snow can never be sharper than a render pixel, never shaded per pixel from
the sun, never carry texture finer than a metre. The owner's reference, Grand Mountain Adventure 2, has per-pixel sun
light, a crisp wind-ripple and crust texture, blue shadowed hollows and soft dawn fog. Only the GPU can shade the
iPad's 3.9 million pixels a frame.

## Decision
- **The GPU draws the terrain and sky** behind `?renderer=gl` (`src/view/renderer.js`, `src/view/gl/`): a heightfield
  mesh on the map's grid (clipmap levels of 1 to 8 m around the camera), shaded per pixel; everything else (trees,
  rails, flags, spray, rider, HUD) stays on the 2D canvas, drawn over a transparent clear and lined up by a shared
  projection (`gl-projection.js`: the game's view is angle-linear across, a pinhole down, so the vertex shader projects
  each vertex itself).
- **three.js, not hand-written WebGL2**: textures, materials, render state and the renderer loop for free now, and
  shadows, post-processing (bloom on the sun, colour grading) and instanced trees later without writing them.
- **Vendored and pinned**: three.js r187 (`npm pack three@0.187.0`), the published `build/three.module.js` and
  `build/three.core.js` unmodified with its `LICENSE` in `vendor/three/` (MIT; 0.187 ships no minified build: 2.1 MB,
  about 420 KB gzipped). No build step and no npm runtime dependency (ADR 0001 holds): the page loads the ES module
  by relative path. `src/main.js` imports it dynamically, and not at all with `?renderer=cpu`. An upgrade is a new vendored copy in its own PR.
- **WebGL2 renderer** (`THREE.WebGLRenderer`), which every iPad the game targets has. The WebGPU renderer would need
  iPadOS 26 or later; it can come later behind the same seam. Only WebGL2 core features are used: R32F read with
  `texelFetch` in the vertex shader (no float filtering), RG16F / R16F and RGBA8 with linear filtering (core in
  WebGL2), no float render targets.
- **Falls back**: no three.js, no WebGL2 context or textures smaller than the map: a console warning and the CPU
  renderer (`Gresca.debug.renderer()` says which and why).
- **The Look stays the only colour source** (ADR 0007): the shaders get the Look's terrain tones, sky, sun and fog as
  uniforms. One optional Look field is added: `sky.sun.elevationDeg`.

## Consequences
- About 40 MB of textures on the GPU for the procedural map (heights, slopes, relief/groomed/tracks, painted features,
  the piste's across coordinate), and a CPU copy of each made at boot.
- Two canvases are composited each frame; the GL one has no alpha and no MSAA (2x device pixels instead).
- Trees still need the terrain's horizon (`view.occ`): a CPU pass computes it as the raycaster did, without pixels
  (`gl/horizon.js`). It follows the raycaster's heights, so a far ridge drawn by a coarse mesh level can differ from it
  by a little.
- Headless Chrome has no GPU here: CI and the bench draw WebGL in software (SwiftShader), so their GL frame times
  bound the CPU side only. Real numbers come from the iPad (`?renderer=gl&fps=1`).
- If E0 is rejected, `src/view/gl/`, `src/view/renderer.js`, `vendor/` and this ADR go; nothing else depends on them.
