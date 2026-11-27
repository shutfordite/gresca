// The Hanga Dawn look: builds the Look (look.js) from the art spec. The only file that reads HANGA's fields.
import { MAP_ID } from '../../core/config.js';
import { validateLook, hexRgb } from './look.js';

// Colours the game draws that the spec has no role for yet. They are the game's current values, kept here so the
// look is the one place colours live; each is a request for a later spec version.
const SIGNAL_ORANGE = '#ff6b3d';
const FINISH_RED = '#d33';
const UNSPECIFIED = Object.freeze({
 // billboards on the 3D view (view/sprites.js, view/draw.js)
 poleShaft: '#3a3f58',
 kickerFlag: SIGNAL_ORANGE,
 bigKickerFlag: '#ffd23d',
 railBar: '#c9372c',
 boxBar: '#6fcfa0',
 kickerPad: '#c4cdea',
 kickerLip: '#8fa4c8',
 bigKickerLip: '#ffb23d',
 treeCrown: '#1f4a3a',
 sprayPuff: '#f6f8ff',
 // the colour map (view/colour-map.js, until D2)
 mapLift: '#39424f',
 mapLiftMarker: SIGNAL_ORANGE,
 mapTreeShadow: 'rgba(96,86,150,.30)',
 mapKickerPad: 'rgba(120,134,196,.34)',
 mapBigKickerPad: 'rgba(110,124,196,.45)',
 mapKickerLip: '#9fb0c8',
 mapBigKickerLip: '#b7c6dd',
 mapKickerEdge: SIGNAL_ORANGE,
 mapRailShadow: 'rgba(96,86,150,.35)',
 mapHouseShadow: 'rgba(30,40,60,.3)',
 mapRoof: '#b5543a',
 mapRoofAlt: '#8a6a5a',
 mapRoofSnow: '#f2f6fa',
 mapFinishLight: '#fff',
 mapFinishDark: FINISH_RED,
 mapFinishPost: FINISH_RED,
 mapLabel: '#16202e',
 // piste edge poles on real maps (view/piste-poles.js): Europe's difficulty colours, orange on the right-hand ones
 pisteGreen: '#2e9e4f',
 pisteBlue: '#2f6fd6',
 pisteRed: '#d8333a',
 pisteBlack: '#1b1d22',
 pisteYellow: '#f2c230',
 pisteRightTop: SIGNAL_ORANGE,
});

// The colour map's snow tone (view/colour-map.js paintSnow until D2), not in the spec yet: RGB 0..255.
const SNOW_SHADE = Object.freeze([170, 168, 214]); // fully in shade
const SNOW_LIT_GAIN = Object.freeze([74, 78, 38]);  // added when fully lit
const GROOMED_GAIN = Object.freeze([6, 6, 4]);      // added on the groomed piste
const ROCK_RGB = Object.freeze([118, 120, 130]);    // bare rock
const CORDUROY_DEPTH = 0.045;                       // dimensionless, the corduroy stripes' brightness swing
const CAVITY_GAIN = Object.freeze([-26, -22, -6]);  // added in a full hollow (minus on a full ridge): sky-shaded blue
const GRAIN_DEPTH = 0.035;                          // dimensionless, wind-blown grain's brightness swing off piste
const GROOMED_GRAIN = 0.3;                          // dimensionless, how much grain is left on the groomed piste
const SPRAY_MAX_ALPHA = 0.8;                        // opacity of a new snow puff

// CSS custom properties for styles/*.css, not in the spec yet (spec ui.* has the v2 HUD; S1 moves to it).
// styles/base.css repeats them as its :root defaults, so the page has its colours before the module runs.
const UI_TOKENS = Object.freeze({
 '--bg': '#0e1a2b',
 '--ink': '#f3f5fb',
 '--acc': '#f2b52a',
 '--on-acc': '#1b2038',
 '--veil': 'rgba(24,30,58,.78)',
 '--halo': 'rgba(30,34,64,.7)',
 '--halo-strong': 'rgba(30,34,64,.8)',
 '--light': '#fff',
 '--mini-edge': 'rgba(255,255,255,.35)',
});

// One table of every role: the spec palette, then the roles the spec does not have yet (no name in both).
function colourTable(palette) {
 for (const role of Object.keys(UNSPECIFIED)) {
  if (role in palette) throw new Error('Look: role ' + role + ' is in the spec palette now: drop it from hanga.js');
 }
 return Object.freeze({ ...palette, ...UNSPECIFIED });
}

// The colour map's snow tone: shade, plus the sun, plus the groomed piste, plus the relief (hollows bluer and darker,
// ridges brighter), times the corduroy and the grain, mixed toward rock. cavity and grain default to 0 (the old tone).
function terrainTone(lit, groomed, stripeWave, rock, out, cavity = 0, grain = 0) {
 const grainSwing = 1 + GRAIN_DEPTH * grain * (1 - (1 - GROOMED_GRAIN) * groomed);
 for (let i = 0; i < 3; i++) {
  let c = SNOW_SHADE[i] + lit * SNOW_LIT_GAIN[i] + groomed * GROOMED_GAIN[i] + cavity * CAVITY_GAIN[i];
  if (groomed > 0) c *= 1 + CORDUROY_DEPTH * groomed * stripeWave;
  c *= grainSwing;
  out[i] = c + (ROCK_RGB[i] - c) * rock;
 }
 return out;
}

function sky(H, colour, sunAt) {
 const sun = H.sky.sun;
 return Object.freeze({
  stops: Object.freeze(H.sky.stops.map(([o, role]) => Object.freeze([o, colour(role)]))),
  sun: Object.freeze({
   colour: colour(sun.colour),
   radiusFracOfWidth: sun.radiusFracOfWidth,
   aboveHorizonFrac: sun.aboveHorizonFrac,
   azimuthDeg: sunAt.azimuthDeg,
   elevationDeg: sunAt.elevationDeg,
  }),
 });
}

function sprites(colour) {
 return Object.freeze({
  tree: Object.freeze({ colour: colour('treeCrown'), rgb: Object.freeze(hexRgb(colour('treeCrown'))) }),
  flag: Object.freeze({ kicker: colour('kickerFlag'), bigKicker: colour('bigKickerFlag') }),
  pole: Object.freeze({ colour: colour('poleShaft') }),
  pistePole: Object.freeze({
   green: colour('pisteGreen'),
   blue: colour('pisteBlue'),
   red: colour('pisteRed'),
   black: colour('pisteBlack'),
   yellow: colour('pisteYellow'),
   rightTop: colour('pisteRightTop'),
  }),
  rail: Object.freeze({ colour: colour('railBar') }),
  box: Object.freeze({ colour: colour('boxBar') }),
  kickerRamp: Object.freeze({
   pad: colour('kickerPad'), lip: colour('kickerLip'), bigLip: colour('bigKickerLip'),
  }),
  spray: Object.freeze({ rgb: Object.freeze(hexRgb(colour('sprayPuff'))), maxAlpha: SPRAY_MAX_ALPHA }),
 });
}

// Camera framing. Read from the spec at each use: tests (and tuning by hand) change slopeFollow while a game runs.
function camera(H) {
 const follow = H.camera.slopeFollow;
 return Object.freeze({
  get lookAheadM() { return follow.lookAheadM; },
  get riderMarginDeg() { return follow.riderMarginDeg; },
  partialPitchDeg: (levelDeg, fullDeg) => H.cameraPitch(levelDeg, fullDeg, Infinity, 0),
 });
}

// The rider: named poses through HANGA.projectRider, live animation states through RiderAnim.project.
function rider(H, riderAnim) {
 const R = H.rider;
 function project(rig, pose, view) {
  if (typeof pose === 'string') return H.projectRider(rig, pose, view.yawDeg, view.pitchDeg, 0, view.stance);
  if (!riderAnim) throw new Error('Look: rider.project of a live pose needs RiderAnim (createHangaLook)');
  if (pose.rig !== rig) throw new Error('Look: rider.project: the pose is a ' + pose.rig + ' pose, not ' + rig);
  return riderAnim.project(pose, view.yawDeg, view.pitchDeg, view.stance);
 }
 return Object.freeze({
  poses: Object.freeze({
   ski: Object.freeze(R.poseOrder.ski.slice()),
   board: Object.freeze(R.poseOrder.board.slice()),
  }),
  project,
  keylineM: R.widths.keyline,
  meanSlopeDeg: H.maps[MAP_ID].meanSlopeDeg,
  stanceStorageKey: R.stance.storageKey,
 });
}

// SPIKE (?spike=env, throwaway): the v1.5 environment as plain numbers and hex colours for the GPU sky and trees.
function spikeEnv(H) {
 const E = H.environment;
 const P = H.palette;
 const B = E.backdrops.pyrenees;
 const species = (s) => Object.freeze({
  heightM: s.reference.heightM,
  typicalM: s.heightM.typical,
  profile: Object.freeze(s.profile.map((q) => Object.freeze(q.slice()))),
  lit: P[s.roles.lit], body: P[s.roles.body], shade: P[s.roles.shade], trunk: P[s.roles.trunk],
  snow: P[s.roles.snow], snowShade: P[s.roles.snowShade],
  cover: s.snowLoad.coverOfTierUpperSide.typical,
 });
 return Object.freeze({
  sun: H.maps['el-tarter'].sun,
  sky: Object.freeze({
   stops: Object.freeze(E.sky.stops.map((s) => Object.freeze({ elevationDeg: s.elevationDeg, colour: P[s.role] }))),
   follows: E.sky.followsSun,
   sun: E.sky.sun,
   sunColour: P[E.sky.sun.role],
   glowColour: P[E.sky.sun.glow.role],
   skyMid: P.skyMid,
   haze: P.skyHorizon,
  }),
  backdrop: Object.freeze({
   ridge: B.ridge,
   layers: Object.freeze(B.layers.map((l) => Object.freeze({
    id: l.id, fill: P[l.roles.fill], shade: P[l.roles.shade], cap: P[l.roles.cap], hazeMix: l.hazeMix, capRule: l.cap,
   }))),
   peaks: Object.freeze(B.peaks),
  }),
  trees: Object.freeze({
   pine: species(E.trees.sets.pine.species.uncinata),
   fir: species(E.trees.sets.pine.species.fir),
   firShare: E.trees.sets.pine.mix.firShareByAltM[0][1],
  }),
 });
}

/**
 * The Hanga Dawn Look from the art spec (HANGA: window.HANGA, passed in through env) and, for live rider poses,
 * riderAnim (RiderAnim). Resolves every colour once; validated before it is returned (throws naming the field).
 */
export function createHangaLook(spec, riderAnim, spike = null) {
 const envSpike = spike === 'env' && spec.environment ? spikeEnv(spec) : null;
 const table = colourTable(spec.palette);
 const colour = (role) => {
  const c = table[role];
  if (c === undefined) throw new Error('Look: unknown colour role ' + role);
  return c;
 };
 return validateLook(Object.freeze({
  version: 'hanga-' + spec.version,
  roles: Object.freeze(Object.keys(table)),
  colour,
  terrainTone,
  sky: sky(spec, colour, envSpike ? envSpike.sun : spec.maps[MAP_ID].sun),
  fog: Object.freeze({ rgb: Object.freeze(spec.terrain.fog.rgb.slice()), amount: spec.fogAmount }),
  sprites: sprites(colour),
  camera: camera(spec),
  ui: UI_TOKENS,
  rider: rider(spec, riderAnim || null),
  spikeEnv: envSpike,
 }));
}
