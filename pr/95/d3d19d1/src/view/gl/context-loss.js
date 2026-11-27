// Surviving a lost WebGL context (docs/adr/0008-three-js-gpu-renderer.md): the state a lost/restored pair of canvas
// events drives, which renderer draws in each state, and the renderer report. Pure: no GL, so Node tests drive it.

/** The context's state, made once per renderer: {lost (is the context gone now), losses, restores (counts)}. */
export function createContextState() {
 return { lost: false, losses: 0, restores: 0 };
}

/** The context was lost: the GL draws stop until it is restored. Mutates state. */
export function contextLost(state) {
 state.lost = true;
 state.losses++;
}

/** The context came back (three.js has rebuilt its GL state from the textures' CPU copies). Mutates state. */
export function contextRestored(state) {
 state.lost = false;
 state.restores++;
}

/**
 * What Gresca.debug.renderer() says (view.renderer): {name ('gl', or 'cpu' while the context is lost), fallback (null,
 * or 'context lost'), lost, losses, restores, gpuBytes, cpuBytes}. bytes: terrainTextureBytes().
 */
export function contextReport(state, bytes) {
 return {
  name: state.lost ? 'cpu' : 'gl',
  fallback: state.lost ? 'context lost' : null,
  lost: state.lost,
  losses: state.losses,
  restores: state.restores,
  gpuBytes: bytes.gpuBytes,
  cpuBytes: bytes.cpuBytes,
 };
}

/**
 * The frame drawer that follows the state: drawGl while the context is there, drawCpu (the raycaster) while lost.
 * Both are (view, scene, dt) -> nothing. Allocates nothing per frame.
 */
export function createContextDrawer(state, drawGl, drawCpu) {
 return (view, scene, dt) => (state.lost ? drawCpu : drawGl)(view, scene, dt);
}

/**
 * Listens on a canvas (anything with addEventListener) for webglcontextlost / webglcontextrestored: cancels the lost
 * event (so the browser may restore the context), updates state and calls onChange(state). Returns nothing.
 */
export function watchContext(canvas, state, onChange) {
 canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  contextLost(state);
  onChange(state);
 });
 canvas.addEventListener('webglcontextrestored', () => {
  contextRestored(state);
  onChange(state);
 });
}

/**
 * Makes the frame drawer that survives a lost context: draws with drawGl, or with drawCpu while canvas's context is
 * lost, and keeps view.renderer (what Gresca.debug.renderer() says) true. bytes: terrainTextureBytes(). The drawers
 * are (view, scene, dt) -> nothing.
 */
export function guardContext(canvas, view, bytes, drawGl, drawCpu) {
 const state = createContextState();
 const report = () => { view.renderer = contextReport(state, bytes); };
 watchContext(canvas, state, report);
 report();
 return createContextDrawer(state, drawGl, drawCpu);
}
