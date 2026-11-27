// The GPU terrain (three.js, WebGL2; docs/adr/0008-three-js-gpu-renderer.md): textures baked from the built world,
// the clipmap meshes and the sky on their own canvas under the screen canvas, drawn each frame from the game camera.
import { NEAR_M, FAR_M, createProjection, setProjection } from './gl-projection.js';
import { CLIPMAP, levelGrid, levelOrigin, levelSpacing } from './terrain-mesh.js';
import { bakeHeights, bakeSlopes, bakeRelief, bakeAux, bakePaint, bakePiste, halfArray, PISTE_STEP_M,
 RELIEF_M_PER_BYTE } from './terrain-bake.js';
import { bakeSunVisibility, castTreeShadows } from './sun-shadow.js';
import { riderShadow } from './rider-shadow.js';
import { makeDetailTexture, DETAIL_SIZE } from './detail-texture.js';
import { SNOW_VERTEX, SNOW_FRAGMENT, snowLook, sunOnGrid } from './snow-material.js';
import { createTrackRibbon, ribbonLook } from './track-ribbon.js';
import { SKY_VERTEX, SKY_FRAGMENT, skyLook } from './sky-material.js';
import { sunDisc } from '../sky.js';
import { camCompass } from '../camera.js';
import { SPIKE_SKY_FRAGMENT, spikeSkyValues } from './spike-env.js';
import { createTreeMesh, treeLook } from './tree-mesh.js';
import { createParkMesh } from './park-mesh.js';
import { sunVisibilityGrid } from './sun-visibility.js';
import { checkTextureBudget, addGpuBytes } from './gl-budget.js';
import { FOV } from '../../core/config.js';

const MAX_ANISOTROPY = 8; // the detail texture's anisotropic filtering, at most (grazing views of the ripples)

// A DataTexture of data (w × h texels) with the given formats, clamped, with no mipmaps, filter linear or nearest.
function dataTexture(THREE, data, w, h, format, type, internalFormat, linear) {
 const t = new THREE.DataTexture(data, w, h, format, type);
 t.internalFormat = internalFormat;
 t.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
 t.magFilter = t.minFilter;
 t.generateMipmaps = false;
 t.flipY = false;
 t.unpackAlignment = 1;
 t.colorSpace = THREE.NoColorSpace;
 t.needsUpdate = true;
 return t;
}

// The sun visibility of every texel (sun-shadow.js): the terrain's own shadows, then each tree's.
function bakeShadows(heights, nx, ny, frame, scene) {
 const sun = sunOnGrid(scene.look.sky, frame);
 const vis = bakeSunVisibility(heights, nx, ny, sun);
 const trees = scene.treeArr;
 const at = { u: 0, v: 0 };
 const grid = new Float32Array(trees.length * 2);
 for (let n = 0; n < trees.length; n++) {
  frame.toGrid(trees[n].x, trees[n].y, at);
  grid[n * 2] = at.u;
  grid[n * 2 + 1] = at.v;
 }
 return castTreeShadows(vis, nx, ny, grid, sun);
}

// The terrain's textures from the built world (terrain-bake.js).
function makeTextures(THREE, renderer, view, scene) {
 const nx = view.map.width;
 const ny = view.map.height;
 const frame = view.mapFrame;
 if (!view.colSnow) throw new Error('GL terrain: the colour map was built without its plain snow (keepSnow)');
 const heights = bakeHeights(scene.terrain, frame, nx, ny);
 const sunVisibility = bakeShadows(heights, nx, ny, frame, scene);
 const aux = bakeAux(bakeRelief(heights, nx, ny), scene.terrain, frame, nx, ny, sunVisibility);
 const piste = bakePiste(scene.course, scene.terrain, frame, nx, ny);
 const detail = new THREE.DataTexture(makeDetailTexture(), DETAIL_SIZE, DETAIL_SIZE, THREE.RGBAFormat);
 detail.wrapS = THREE.RepeatWrapping;
 detail.wrapT = THREE.RepeatWrapping;
 detail.minFilter = THREE.LinearMipmapLinearFilter;
 detail.magFilter = THREE.LinearFilter;
 detail.generateMipmaps = true;
 detail.anisotropy = Math.min(MAX_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
 detail.colorSpace = THREE.NoColorSpace;
 detail.needsUpdate = true;
 return {
  aux,
  height: dataTexture(THREE, heights, nx, ny, THREE.RedFormat, THREE.FloatType, 'R32F', false),
  slope: dataTexture(THREE, halfArray(bakeSlopes(heights, nx, ny)), nx, ny, THREE.RGFormat, THREE.HalfFloatType,
   'RG16F', true),
  auxTex: dataTexture(THREE, aux, nx, ny, THREE.RGBAFormat, THREE.UnsignedByteType, 'RGBA8', true),
  paint: dataTexture(THREE, bakePaint(view.col0, view.colSnow), nx, ny, THREE.RGBAFormat, THREE.UnsignedByteType,
   'RGBA8', true),
  piste: dataTexture(THREE, halfArray(piste.data), piste.w, piste.h, THREE.RedFormat, THREE.HalfFloatType, 'R16F',
   true),
  pisteSize: [piste.w, piste.h],
  detail,
 };
}

// The uniforms every level shares (one object each, so setting a value sets it for all levels).
function sharedUniforms(THREE, tex, view, look) {
 const s = snowLook(look, view.mapFrame);
 const v3 = (a) => ({ value: new THREE.Vector3(a[0], a[1], a[2]) });
 const f = view.mapFrame;
 const grid = sunVisibilityGrid(f);
 const object = treeLook(look, f); // the light on every GPU object (trees, park): sun-visibility.js
 return {
  uCam: { value: new THREE.Vector3() },
  uDir: { value: new THREE.Vector2() },
  uScreen: { value: new THREE.Vector4() },
  uClip: { value: new THREE.Vector3(FOV, NEAR_M, FAR_M) },
  uCamGrid: { value: new THREE.Vector2() },
  uGridU: { value: new THREE.Vector2(f.ux, f.uy) },
  uGridV: { value: new THREE.Vector2(f.vx, f.vy) },
  uGridOrigin: { value: new THREE.Vector2(grid.origin[0], grid.origin[1]) },
  uObjSun: v3(object.sun),
  uObjSunLight: v3(object.sunLight),
  uMapSize: { value: new THREE.Vector2(view.map.width, view.map.height) },
  uHeight: { value: tex.height },
  uSlope: { value: tex.slope },
  uAux: { value: tex.auxTex },
  uPaint: { value: tex.paint },
  uPiste: { value: tex.piste },
  uPisteSize: { value: new THREE.Vector2(tex.pisteSize[0], tex.pisteSize[1]) },
  uPisteStep: { value: PISTE_STEP_M },
  uDetail: { value: tex.detail },
  uReliefPerByte: { value: RELIEF_M_PER_BYTE },
  uSun: v3(s.sun),
  uShade: v3(s.shade),
  uLit: v3(s.lit),
  uGroomShade: v3(s.groomShade),
  uGroomLit: v3(s.groomLit),
  uRock: v3(s.rock),
  uSunTint: v3(s.sunTint),
  uFog: v3(s.fog),
  uCorduroy: { value: s.corduroy },
  uFar: { value: s.far },
  uFogLut: { value: s.fogLut },
  uShadowTint: v3(s.shadowTint),
  uRiderShadow: { value: new THREE.Vector4() },
  uRiderAxes: { value: new THREE.Vector4() },
 };
}

// A BufferGeometry of one clipmap level's grid.
function levelGeometry(THREE, hasHole) {
 const grid = levelGrid(CLIPMAP.cells, hasHole);
 const geo = new THREE.BufferGeometry();
 geo.setAttribute('position', new THREE.BufferAttribute(grid.positions, 3));
 geo.setIndex(new THREE.BufferAttribute(grid.index, 1));
 return geo;
}

// The clipmap levels as meshes in glScene, nearest first (so the depth test rejects what they cover); their materials.
function addLevels(THREE, glScene, shared) {
 const full = levelGeometry(THREE, false);
 const ring = levelGeometry(THREE, true);
 const materials = [];
 for (let level = 0; level < CLIPMAP.levels; level++) {
  const material = new THREE.RawShaderMaterial({
   glslVersion: THREE.GLSL3,
   vertexShader: SNOW_VERTEX,
   fragmentShader: SNOW_FRAGMENT,
   uniforms: { ...shared, uOrigin: { value: new THREE.Vector2() }, uSpacing: { value: levelSpacing(level) } },
   side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(level === 0 ? full : ring, material);
  mesh.frustumCulled = false; // the vertex shader projects; three.js's camera knows nothing of it
  mesh.renderOrder = level;
  glScene.add(mesh);
  materials.push(material);
 }
 return materials;
}

// The sky: one screen-covering triangle at the far plane, drawn after the terrain where none is (depth test).
function addSky(THREE, glScene, look, frame) {
 const s = skyLook(look.sky);
 const geo = new THREE.BufferGeometry();
 geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
 const material = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  vertexShader: SKY_VERTEX,
  fragmentShader: SKY_FRAGMENT,
  uniforms: {
   uStops: { value: s.stops },
   uStopCount: { value: s.count },
   uRows: { value: new THREE.Vector2() },
   uSun: { value: new THREE.Vector4() },
   uSunColour: { value: new THREE.Vector3(s.sunColour[0], s.sunColour[1], s.sunColour[2]) },
  },
  depthWrite: false,
 });
 if (look.spikeEnv) { // SPIKE (?spike=env): the spec v1.5 sky and Pyrenees ridge layers
  const v = spikeSkyValues(look.spikeEnv, frame.rotation * 180 / Math.PI);
  material.fragmentShader = SPIKE_SKY_FRAGMENT;
  Object.assign(material.uniforms, {
   uView: { value: new THREE.Vector4() },
   uSkyCol: { value: v.skyCol },
   uSunPos: { value: new THREE.Vector4(...v.sunPos) },
   uSunCol: { value: new THREE.Vector3(...v.sunCol) },
   uGlowCol: { value: new THREE.Vector3(...v.glowCol) },
   uMidCol: { value: new THREE.Vector3(...v.midCol) },
   uPeak: { value: v.peaks },
   uCapDepth: { value: v.caps },
   uLayerCol: { value: v.cols },
  });
 }
 const mesh = new THREE.Mesh(geo, material);
 mesh.frustumCulled = false;
 mesh.renderOrder = CLIPMAP.levels;
 glScene.add(mesh);
 return material;
}

/**
 * The GPU terrain on canvas (with its WebGL2 context gl) for the built world: bakes the textures (about 40 MB on the
 * GPU for the procedural map, terrain-bake.js) and builds the meshes once. Returns {render(view, scene), bytes
 * (terrainTextureBytes plus the trees' and the park's buffers), trees {drawCalls, trianglesPerTree, drawn, triangles:
 * this frame's}, park {drawCalls, triangles, kickers, rails, flags, drawn: features drawn this frame}};
 * render draws the terrain, sky and trees for the camera updateCamera() set, at the screen canvas's
 * size (view.W × view.Hh px). Throws if the GPU cannot hold the map or the textures are over GL_TEXTURE_BUDGET_MB.
 * THREE: the three.js module (env.THREE).
 */
export function createGlTerrain(THREE, gl, canvas, view, scene) {
 const largest = Math.max(view.map.width, view.map.height);
 if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < largest) throw new Error('GL terrain: textures of ' + largest + ' px');
 const bytes = checkTextureBudget(view.map.width, view.map.height);
 const renderer = new THREE.WebGLRenderer({
  canvas, context: gl, antialias: false, alpha: false, depth: true, stencil: true,
 });
 renderer.setPixelRatio(1);
 renderer.sortObjects = false;
 const tex = makeTextures(THREE, renderer, view, scene);
 const shared = sharedUniforms(THREE, tex, view, scene.look);
 const glScene = new THREE.Scene();
 const levels = addLevels(THREE, glScene, shared);
 const s = snowLook(scene.look, view.mapFrame);
 const ribbon = createTrackRibbon(THREE, glScene, shared, view.trail, ribbonLook(s.shade, s.lit));
 const trees = createTreeMesh(THREE, glScene, shared, scene.treeArr, scene.terrain, scene.look, view.mapFrame);
 const treeStats = { drawCalls: trees.drawCalls, trianglesPerTree: trees.triangles, drawn: 0, triangles: 0 };
 const park = createParkMesh(THREE, glScene, shared, scene.course, scene.terrain, scene.look, view.mapFrame,
  scene.pistePoles);
 const parkStats = { drawCalls: park.drawCalls, triangles: park.triangles, kickers: park.counts.kickers,
  rails: park.counts.rails, flags: park.counts.flags, drawn: 0 };
 const sky = addSky(THREE, glScene, scene.look, view.mapFrame);
 const unused = new THREE.Camera(); // three.js wants one; the shaders project for themselves
 const proj = createProjection();
 const at = { u: 0, v: 0 };
 const sun = s.sun;
 const rs = { du: 0, dv: 0, axisU: 0, axisV: 0, along: 1, across: 1, strength: 0, soft: 0 };
 const ground = { u: 0, v: 0 };
 const origin = { u: 0, v: 0 };
 function render(v, sc) {
  const p = setProjection(proj, sc.camera, v.W, v.Hh);
  if (canvas.width !== v.W || canvas.height !== v.Hh) renderer.setSize(v.W, v.Hh, false);
  shared.uCam.value.set(p.x, p.y, p.height);
  shared.uDir.value.set(p.dirX, p.dirY);
  shared.uScreen.value.set(p.focalC, p.rowC, p.W, p.Hh);
  v.mapFrame.toGrid(p.x, p.y, at);
  shared.uCamGrid.value.set(at.u, at.v);
  for (let level = 0; level < levels.length; level++) {
   levelOrigin(level, at.u, at.v, origin);
   levels[level].uniforms.uOrigin.value.set(origin.u, origin.v);
  }
  const sun = sunDisc(sc.look.sky, sc.camera, v.W, v.Hh, sc.frame, v.sun);
  sky.uniforms.uRows.value.set(Math.max(1, p.rowC), p.Hh);
  sky.uniforms.uSun.value.set(sun.X, sun.Y, sun.r, sun.on ? 1 : 0);
  if (sky.uniforms.uView) sky.uniforms.uView.value.set(p.focalC, p.W, camCompass(sc.camera), 0);
  // the rider's shadow: read-only on the drawn pose (view.drawn: x, y m, z m above the ground)
  v.mapFrame.toGrid(v.drawn.x, v.drawn.y, ground);
  riderShadow(v.drawn.z, sun, rs);
  shared.uRiderShadow.value.set(ground.u + rs.du, ground.v + rs.dv, rs.strength, rs.soft);
  shared.uRiderAxes.value.set(rs.axisU, rs.axisV, rs.along, rs.across);
  ribbon.update(v.trail);
  treeStats.drawn = trees.update(sc.camera);
  treeStats.triangles = treeStats.drawn * trees.triangles;
  parkStats.drawn = park.update(sc.camera);
  renderer.render(glScene, unused);
 }
 return { render, bytes: addGpuBytes(addGpuBytes(bytes, trees.bytes), park.bytes), trees: treeStats, park: parkStats };
}
