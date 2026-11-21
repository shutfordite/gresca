// The Look: the one seam through which the view gets colours, tones, sky, fog, sprite styles, camera framing, UI
// tokens and the rider projection (docs/adr/0006-look-interface.md). The interface, its validator and CSS helpers.

/**
 * @typedef {object} Look
 * @property {string} version  which look and spec version built it, e.g. 'hanga-1.4.0'
 * @property {readonly string[]} roles  every colour role colour() knows
 * @property {(role: string) => string} colour  a role's CSS colour; throws on an unknown role
 * @property {(lit: number, groomed: number, stripeWave: number, rock: number, out: number[]) => number[]}
 *  terrainTone  the colour map's snow tone (until D2): lit 0..1 (sun), groomed 0..1 (piste), stripeWave -1..1 (the
 *  corduroy wave at this texel), rock 0..1 (how much bare rock); fills out [r, g, b] (0..255, unrounded) and returns it
 * @property {{stops: ReadonlyArray<readonly [number, string]>, sun: LookSun}} sky  gradient stops from the top of the
 *  screen (0) to the horizon (1), CSS colours; and the sun disc
 * @property {{rgb: readonly number[], amount: (dM: number, farM: number) => number}} fog  fog colour (0..255) and how
 *  much fog (0..1) at dM m from the camera when the render ends at farM m
 * @property {LookSprites} sprites  colours of the billboards drawn on the 3D view
 * @property {{lookAheadM: number, riderMarginDeg: number,
 *  partialPitchDeg: (levelDeg: number, fullDeg: number) => number}} camera  framing: the slope-follow aim point (m
 *  ahead of the rider), the rider's margin inside the bottom of the frame (deg), and the partly followed pitch (deg,
 *  negative looks down) between the level-ground and full-slope pitches
 * @property {Readonly<Record<string, string>>} ui  CSS custom properties ('--name': value) for styles/*.css
 * @property {LookRider} rider  the rider: what S3 hands S4
 */

/**
 * @typedef {object} LookSun
 * @property {string} colour  CSS colour of the disc
 * @property {number} radiusFracOfWidth  disc radius as a fraction of the screen width
 * @property {number} aboveHorizonFrac  disc centre above the horizon line, as a fraction of the screen height
 * @property {number} azimuthDeg  compass degrees of the map's sun, before the map frame turns it
 */

/**
 * @typedef {object} LookSprites
 * @property {{colour: string, rgb: readonly number[]}} tree  crown colour (rgb 0..255 for the fog mix)
 * @property {{kicker: string, bigKicker: string}} flag  pennants beside small and big kickers
 * @property {{colour: string}} pole  flag poles and rail posts
 * @property {{colour: string}} rail  rail bars and their flags
 * @property {{colour: string}} box  box bars and their flags
 * @property {{rgb: readonly number[], maxAlpha: number}} spray  snow puffs: colour (0..255) and opacity when new
 */

/**
 * @typedef {object} LookRider
 * @property {{ski: readonly string[], board: readonly string[]}} poses  the named poses of each rig
 * @property {(rig: string, pose: string | object, view: RiderView) => object[]} project  the draw list (metres, +y
 *  up, colours as roles for colour()) of rig 'ski' | 'board' in a named pose or a live animation state (made by
 *  RiderAnim.create(rig)), seen from view. Allocates the list.
 * @property {number} keylineM  outline width, m (drawn never under 1 px)
 * @property {number} meanSlopeDeg  deg, the map's mean gradient the animation's crouch is measured from
 * @property {string} stanceStorageKey  the storage key of the snowboard stance
 */

/**
 * @typedef {object} RiderView
 * @property {number} yawDeg  deg, + with the rider turned to the right of the camera's view (clockwise)
 * @property {number | null} pitchDeg  deg the camera looks down on the rider; null for the look's default
 * @property {string} stance  'regular' | 'goofy'
 */

const RIGS = Object.freeze(['ski', 'board']);
const SPRITES = Object.freeze({
 tree: ['colour'], flag: ['kicker', 'bigKicker'], pole: ['colour'], rail: ['colour'], box: ['colour'], spray: [],
});
// #rgb, #rrggbb, or rgb()/rgba() with numbers: the colour forms the game's canvas and CSS code uses.
const COLOUR_RE = /^(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgba?\((?:\s*[\d.]+\s*,){2}\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\))$/;

/** True if s is a CSS colour in one of the forms the game uses (#rgb, #rrggbb, rgb(), rgba()). */
export const isColour = (s) => typeof s === 'string' && COLOUR_RE.test(s);

/** 'rgb(r,g,b)' for canvas fillStyle; r, g, b 0..255 as given (callers round). Allocates the string. */
export const cssRgb = (r, g, b) => 'rgb(' + r + ',' + g + ',' + b + ')';

/** 'rgba(r,g,b,a)' with a (0..1) to 2 decimals, for canvas fillStyle. rgb: 0..255. Allocates the string. */
export const cssRgba = (rgb, a) => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a.toFixed(2) + ')';

/** [r, g, b] (0..255) of a '#rrggbb' or '#rgb' colour. Throws on any other form. */
export function hexRgb(hex) {
 if (!/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(hex)) throw new Error('hexRgb: not a hex colour: ' + hex);
 const h = hex.length === 4 ? hex.replace(/[0-9a-fA-F]/g, (c) => c + c) : hex;
 return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}

// Throws "Look: <path> <problem>" unless ok.
function check(ok, path, problem) {
 if (!ok) throw new Error('Look: ' + path + ' ' + problem);
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isFn = (v) => typeof v === 'function';
const isRgb = (v) => Array.isArray(v) && v.length === 3 && v.every((c) => isNum(c) && c >= 0 && c <= 255);

function checkColours(look) {
 check(Array.isArray(look.roles) && look.roles.length > 0, 'roles', 'must list the colour roles');
 check(isFn(look.colour), 'colour', 'must be a function');
 for (const r of look.roles) check(isColour(look.colour(r)), 'colour(\'' + r + '\')', 'is not a colour');
 check(isFn(look.terrainTone), 'terrainTone', 'must be a function');
 const out = look.terrainTone(0.5, 0.5, 0, 0.5, [0, 0, 0]);
 check(isRgb(out), 'terrainTone()', 'must fill out with [r, g, b] in 0..255');
}

function checkSkyAndFog(look) {
 const sky = look.sky || {};
 check(Array.isArray(sky.stops) && sky.stops.length > 1, 'sky.stops', 'needs two or more stops');
 sky.stops.forEach((s, i) => check(isNum(s[0]) && s[0] >= 0 && s[0] <= 1 && isColour(s[1]), 'sky.stops[' + i + ']',
  'must be [0..1, colour]'));
 const sun = sky.sun || {};
 check(isColour(sun.colour), 'sky.sun.colour', 'is not a colour');
 for (const k of ['radiusFracOfWidth', 'aboveHorizonFrac', 'azimuthDeg']) check(isNum(sun[k]), 'sky.sun.' + k, 'NaN');
 const fog = look.fog || {};
 check(isRgb(fog.rgb), 'fog.rgb', 'must be [r, g, b] in 0..255');
 check(isFn(fog.amount), 'fog.amount', 'must be a function');
}

function checkSprites(look) {
 const sp = look.sprites || {};
 for (const [name, keys] of Object.entries(SPRITES)) {
  check(sp[name] && typeof sp[name] === 'object', 'sprites.' + name, 'is missing');
  for (const k of keys) check(isColour(sp[name][k]), 'sprites.' + name + '.' + k, 'is not a colour');
 }
 check(isRgb(sp.tree.rgb), 'sprites.tree.rgb', 'must be [r, g, b] in 0..255');
 check(isRgb(sp.spray.rgb), 'sprites.spray.rgb', 'must be [r, g, b] in 0..255');
 check(isNum(sp.spray.maxAlpha) && sp.spray.maxAlpha >= 0 && sp.spray.maxAlpha <= 1, 'sprites.spray.maxAlpha',
  'must be 0..1');
}

function checkCameraUiRider(look) {
 const cam = look.camera || {};
 check(isNum(cam.lookAheadM) && isNum(cam.riderMarginDeg), 'camera', 'needs lookAheadM and riderMarginDeg');
 check(isFn(cam.partialPitchDeg), 'camera.partialPitchDeg', 'must be a function');
 check(look.ui && typeof look.ui === 'object', 'ui', 'is missing');
 for (const [k, v] of Object.entries(look.ui)) {
  check(/^--[a-z][a-z0-9-]*$/.test(k) && typeof v === 'string' && v !== '', 'ui[\'' + k + '\']',
   'must be a --custom-property with a value');
 }
 const rd = look.rider || {};
 check(isFn(rd.project), 'rider.project', 'must be a function');
 for (const rig of RIGS) {
  check(rd.poses && Array.isArray(rd.poses[rig]) && rd.poses[rig].length > 0, 'rider.poses.' + rig, 'is empty');
 }
 check(isNum(rd.keylineM) && rd.keylineM > 0, 'rider.keylineM', 'must be > 0');
 check(isNum(rd.meanSlopeDeg), 'rider.meanSlopeDeg', 'NaN');
 check(typeof rd.stanceStorageKey === 'string' && rd.stanceStorageKey !== '', 'rider.stanceStorageKey', 'is empty');
}

/** Checks a Look's whole shape (and that every role resolves); throws an Error naming the field. Returns the look. */
export function validateLook(look) {
 check(look && typeof look === 'object', '', 'is not an object');
 check(typeof look.version === 'string' && look.version !== '', 'version', 'is empty');
 checkColours(look);
 checkSkyAndFog(look);
 checkSprites(look);
 checkCameraUiRider(look);
 return look;
}
