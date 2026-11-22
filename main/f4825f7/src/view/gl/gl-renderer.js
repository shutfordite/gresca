// The GPU terrain (three.js, WebGL2; docs/adr/0008-three-js-gpu-renderer.md): textures baked from the built world,
// the clipmap meshes and the sky on their own canvas under the screen canvas, drawn each frame from the game camera.
import { NEAR_M, FAR_M, createProjection, setProjection } from './gl-projection.js';
import { CLIPMAP, levelGrid, levelOrigin, levelSpacing } from './terrain-mesh.js';
import { bakeHeights, bakeSlopes, bakeRelief, bakeAux, bakePaint, bakePiste, halfArray, PISTE_STEP_M,
 RELIEF_M_PER_BYTE } from './terrain-bake.js';
import { makeDetailTexture, DETAIL_SIZE } from './detail-texture.js';
import { SNOW_VERTEX, SNOW_FRAGMENT, snowLook } from './snow-material.js';
import { createTrackRibbon, ribbonLook } from './track-ribbon.js';
import { SKY_VERTEX, SKY_FRAGMENT, skyLook } from './sky-material.js';
import { sunDisc } from '../sky.js';
import { checkTextureBudget } from './gl-budget.js';
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

// The terrain's textures from the built world (terrain-bake.js).
function makeTextures(THREE, renderer, view, scene) {
 const nx = view.map.width;
 const ny = view.map.height;
 const frame = view.mapFrame;
 if (!view.colSnow) throw new Error('GL terrain: the colour map was built without its plain snow (keepSnow)');
 const heights = bakeHeights(scene.terrain, frame, nx, ny);
 const aux = bakeAux(bakeRelief(heights, nx, ny), scene.terrain, frame, nx, ny);
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
 return {
  uCam: { value: new THREE.Vector3() },
  uDir: { value: new THREE.Vector2() },
  uScreen: { value: new THREE.Vector4() },
  uClip: { value: new THREE.Vector3(FOV, NEAR_M, FAR_M) },
  uCamGrid: { value: new THREE.Vector2() },
  uGridU: { value: new THREE.Vector2(f.ux, f.uy) },
  uGridV: { value: new THREE.Vector2(f.vx, f.vy) },
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
function addSky(THREE, glScene, look) {
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
 const mesh = new THREE.Mesh(geo, material);
 mesh.frustumCulled = false;
 mesh.renderOrder = CLIPMAP.levels;
 glScene.add(mesh);
 return material;
}

/**
 * The GPU terrain on canvas (with its WebGL2 context gl) for the built world: bakes the textures (about 40 MB on the
 * GPU for the procedural map, terrain-bake.js) and builds the meshes once. Returns {render(view, scene), bytes
 * (terrainTextureBytes)}; render draws the terrain and sky for the camera updateCamera() set, at the screen canvas's
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
 const sky = addSky(THREE, glScene, scene.look);
 const unused = new THREE.Camera(); // three.js wants one; the shaders project for themselves
 const proj = createProjection();
 const at = { u: 0, v: 0 };
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
  ribbon.update(v.trail);
  renderer.render(glScene, unused);
 }
 return { render, bytes };
}
