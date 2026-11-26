// Which terrain renderer draws: the GPU terrain (the default) or, with ?renderer=cpu or no WebGL2, the CPU raycaster.
import { draw, drawSprites } from './draw.js';
import { GL_STAGE } from './view-state.js';
import { createGlTerrain } from './gl/gl-renderer.js';
import { guardContext } from './gl/context-loss.js';

// The GL canvas's context: no alpha (the 2D canvas over it carries the sprites), no MSAA (2x device pixels instead),
// a stencil (the ski track darkens each pixel once).
const GL_ATTRIBUTES = Object.freeze({ alpha: false, antialias: false, depth: true, stencil: true,
 powerPreference: 'high-performance' });

// Puts the GL canvas under the screen canvas, filling the same box (the screen canvas is drawn over it).
function placeUnder(canvas, screen) {
 const s = canvas.style;
 s.position = 'absolute';
 s.inset = '0';
 s.width = '100%';
 s.height = '100%';
 s.display = 'block';
 screen.parentNode.insertBefore(canvas, screen);
}

// One frame with the GPU terrain: terrain, sky and trees on the GL canvas (the trees are depth-tested against the
// terrain: no horizon pass), then the sprites and rider on the cleared screen canvas (as draw() draws them).
function drawWithGl(gpu, view, scene, dt) {
 const timer = view.timer;
 gpu.render(view, scene);
 if (timer !== null) timer.lap(GL_STAGE.GL);
 scene.ctx.clearRect(0, 0, view.W, view.Hh);
 drawSprites(view, scene, dt, true);
}

/**
 * The frame drawer, (view, scene, dt) -> nothing, for opts.want ('gl' or anything else: the CPU raycaster). opts:
 * {want, THREE (the three.js module or null), document, screen (the screen canvas), warn (message) -> nothing}. A GPU
 * terrain that cannot start (no three.js, no WebGL2, too small a GPU) warns and falls back to the CPU. Records which
 * one in view.renderer {name: 'cpu' | 'gl', fallback: null or why; with the GPU also lost, losses, restores, gpuBytes,
 * cpuBytes (gl/context-loss.js)}. A lost WebGL context draws the terrain with the CPU raycaster until it is
 * restored. Call after the world and colour map are built.
 */
export function chooseRenderer(opts, view, scene) {
 view.renderer = { name: 'cpu', fallback: null };
 view.treeGpu = null;
 if (opts.want !== 'gl') return draw;
 try {
  if (!opts.THREE) throw new Error('three.js did not load');
  const canvas = opts.document.createElement('canvas');
  const gl = canvas.getContext('webgl2', GL_ATTRIBUTES);
  if (!gl || typeof gl.texSubImage2D !== 'function' || typeof gl.createVertexArray !== 'function') {
   throw new Error('no WebGL2 context');
  }
  const gpu = createGlTerrain(opts.THREE, gl, canvas, view, scene);
  placeUnder(canvas, opts.screen);
  view.treeGpu = gpu.trees;
  return guardContext(canvas, view, gpu.bytes, (v, s, dt) => drawWithGl(gpu, v, s, dt), draw);
 } catch (e) {
  view.renderer = { name: 'cpu', fallback: e.message };
  view.treeGpu = null;
  opts.warn('Gresca: the GPU terrain could not start (' + e.message + '); drawing on the CPU');
  return draw;
 }
}
