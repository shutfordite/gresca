/*
 * Gresca · rider animation  v0.4.0
 * Pure maths on top of the Hanga Dawn spec (HANGA). No canvas, no DOM.
 * Loads in the browser (window.RiderAnim) and in Node (require), like the spec module.
 *
 * Two layers:
 *  1. Pose state machine, as the spec describes it: HANGA.poseFor picks the pose, HANGA.blendTime says how
 *     fast to blend into it, landing holds for timing.hold.land and a wipeout snaps in.
 *  2. Body dynamics on top of the blended pose, so the rider reacts to real terrain nobody animated:
 *     a spring-damped compression driven by the ground under the feet and by landings, a lean
 *     into the edge (F6), unweighting between turns, angulation, arm counterbalance,
 *     and a deeper stance on steep or fast ground.
 *
 * All joint maths is in the spec's rider space (metres, x across, y up, z forward, regular stance).
 * Goofy is left to HANGA.projectRider, which mirrors z after the pose is built.
 */
(function (root) {
'use strict';
var HANGA = root.HANGA || (typeof require === 'function' ? require('./gresca-hanga-spec.js') : null);
var D2R = Math.PI / 180, R2D = 180 / Math.PI, LIVE = '__live';

var RA = {
 version: '0.4.0',
 /* Every number here is a starting point to tune on a phone. */
 tune: {
  edgeFull: 0.6,       // rad of edge angle that counts as a full carve (turn = 1 for poseFor)
  turnSmooth: 0.08,    // s, low-pass on the turn signal, so ride and carve do not flicker
  edgeLean: 0.4,       // deg of body lean per deg of edge angle (the edge in rad is converted to deg first)
  leanSpeedMin: 1,     // m/s, slower than this the body does not lean into the edge
  leanSpeedFull: 4,    // m/s, from this speed the lean is the full edgeLean (smoothstep between)
  leanMax: 24,         // deg, a little past the spec's 18–20° carve poses
  unweightHeight: 0.05, // m, how far the body rises as the edge passes through flat between two turns
  unweightTime: 0.32,  // s, the whole rise and sink (a half sine: up, then back into the new turn)
  unweightMinEdge: 0.2, // rad, the edge must have reached this far on one side before flipping counts as a turn change
  skidFrom: 2, skidTo: 6, // m/s of sideways slip where the skid read starts and where it is full
  skidSit: 0.04,       // m, extra crouch at a full skid
  skidCounter: 0.25,   // share of the lean given up at a full skid (hips out, body counters the slide)
  skidSmooth: 0.1,     // s, time constant of the skid read
  boardLead: 0.04,     // m, snowboard: the leading shoulder, elbow and hand move this far into the turn at a full edge
  skiLead: 0.07,       // m, skis: the inside ski runs this far ahead of the outside one at full lean
  brakeRoll: 10,       // deg, snowboard skids on its heel edge when braking
  rollHz: 1.8, rollZeta: 0.75,   // spring that takes the lean to its target
  compHz: 2.2, compZeta: 0.5,    // spring for the legs absorbing the ground (compression, metres)
  compMin: -0.06, compMax: 0.3,  // m, extension and full squat
  feetAccelMax: 30,    // m/s², clamp on the ground's vertical acceleration under the feet
  landKick: 0.25,      // compression speed (m/s) added per m/s of landing speed
  impactMax: 16,       // m/s
  steepPerDeg: 0.004,  // m of extra crouch per degree steeper than the map's mean gradient
  steepMin: -0.02, steepMax: 0.06,
  tuckFrom: 14, tuckTo: 24, tuckDepth: 0.07,  // m/s, m: a lower stance at speed
  angulation: 0.35,    // share of the lean the upper body takes back (shoulders stay more level)
  armOut: 0.12,        // m, outside hand rises and reaches out in a full lean
  armLag: 0.004,       // m per degree the lean is still behind its target (follow-through)
  breathe: 0.008, breatheHz: 0.3,  // m, Hz, when standing still
  twistMax: 45,        // deg, most the lower body and equipment turn away from the upper body (body twist)
  twistSmooth: 0.12,   // s, time constant of the twist easing in and out
  brakeSmooth: 0.1,    // s, time constant of the brake weight (0..1) easing in and out: no pop at the brake's edges
  brakeTwistMax: 110,  // deg, most the twist reaches at full brake (equipment across the fall line, upper body down it)
  brakeTwistSmooth: 0.05, // s, twist time constant at full brake (the sim yaws the equipment at up to 230 deg/s)
  brakeHeadMax: 60,    // deg, most the head turns against the shoulders to keep facing travel at full brake
  brakeSideMin: 8,     // deg, the equipment this far off travel decides the brake pose's side
  holdSpeed: 1.2,      // m/s, slower than this the upper body keeps its last heading (travel is no longer known)
  fakieSwap: 0.3,      // s, a switch skier's look swaps from one shoulder to the other (a full -1..+1 swing)
  fakieHyst: 10,       // deg, the fall line must pass this far beyond the board's line before the look swaps shoulders
  fakieSmooth: 0.1,    // s, time constant of the fakie look easing in and out (entering and leaving switch)
  sideHold: 0.26,      // cos of the angle from travel the equipment must pass before the upper body's side flips
  flipMin: 0.15,       // rad, the flip angle past which the rider counts as flipping (tuck pose), about 9 deg
  maxStep: 1 / 60      // s, springs are sub-stepped so a slow frame cannot blow them up
 },
 groups: {
  ski: {
   hips: ['hipL', 'hipR', 'hipC'], knees: ['kneeL', 'kneeR'],
   upper: ['neck', 'head', 'shL', 'shR', 'elbL', 'elbR', 'hanL', 'hanR'],
   hands: { hanL: [-1, 1], hanR: [1, 1], elbL: [-1, 0.5], elbR: [1, 0.5] },
   // the left and right ski's joints that run ahead (skiLead)
   lead: [['ankL', 'skiLt', 'skiLn'], ['ankR', 'skiRt', 'skiRn']],
   fwd: 2, hipsBack: 0.3
  },
  board: {
   hips: ['hipF', 'hipB', 'hipC'], knees: ['kneeF', 'kneeB'],
   upper: ['neck', 'head', 'shF', 'shB', 'elbF', 'elbB', 'hanF', 'hanB'],
   hands: { hanF: [0, 1], hanB: [0, 1], elbF: [0, 0.5], elbB: [0, 0.5] },
   fwd: 0, hipsBack: 0
  }
 }
};

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(t) { return t * t * (3 - 2 * t); }
function wrapRad(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function copyJ(J) { var o = {}, k; for (k in J) o[k] = [J[k][0], J[k][1], J[k][2]]; return o; }

/* Absolute joints of a named spec pose, regular stance. */
RA.poseTarget = function (rig, pose) { return HANGA.poseJoints(rig, pose, 'regular'); };

RA.create = function (rig) {
 return {
  rig: rig,
  pose: 'ride',
  from: null,
  t: 0,
  dur: 0,
  poseJ: RA.poseTarget(rig, 'ride'),
  turn: 0,
  twist: 0,
  headYaw: 0,
  brakeW: 0,
  fakieW: 0,
  fakieSide: 0,
  fakieLook: 0,
  ahead: null,
  lookSide: 0,
  brakeSide: null,
  riderSide: 1,
  edgeSign: 0,
  unweightT: 1e9,
  rise: 0,
  skidW: 0,
  bodyPitch: 0,
  flipping: false,
  roll: 0,
  rollV: 0,
  rollTarget: 0,
  comp: 0,
  compV: 0,
  compPeak: 0,
  landedAgo: null,
  time: 0,
  J: RA.poseTarget(rig, 'ride'),
 };
};

/* One damped spring step: x'' = -w²(x - rest) - 2ζw x' + force. */
function spring(x, v, rest, hz, zeta, force, dt) {
 var w = 2 * Math.PI * hz;
 v += (-w * w * (x - rest) - 2 * zeta * w * v + force) * dt;
 return [x + v * dt, v];
}

/*
 * Advance the animation by dt seconds.
 * inp: {
 *   wiped, grinding, airborne, braking, approach   booleans from the game
 *   flipRot     rad, optional: the sim's flip angle this jump, + front flip (0 on the snow). Drives s.bodyPitch (deg,
 *               never smoothed) and, past tune.flipMin in the air, the tuck pose (s.flipping)
 *   landed      true on the frame the rider touches down
 *   impact      landing speed, m/s (downwards, positive)
 *   speed       m/s along the snow
 *   edge        rad, the sim's edge angle (AnimInput.edge): + tips the equipment onto its left-turn edge
 *   skid        m/s, sideways slip (AnimInput.skid)
 *   riderSide   +1 if the rider's +x (right hand, or toe edge) is on the right of travel, else -1
 *   facing, travelDir   rad, optional: the equipment heading and the direction of travel (any angle convention, but
 *               the same for both). Without them there is no body twist
 *   isSwitch    skis riding tail first (the F7 look over the downhill shoulder; boards ignore it)
 *   downhillSide  +1 when the fall line is counter-clockwise of the equipment (the rider's left), -1 clockwise, 0 flat
 *   fallAngle   rad, optional: the fall line's angle from facing, + counter-clockwise (its sign is downhillSide); with
 *               it the look swaps only once the fall line is fakieHyst past the board's line (no flicker)
 *   feetAccelUp m/s², vertical acceleration of the ground under the feet (0 in the air)
 *   slopeDeg, meanSlopeDeg   local slope and the map's mean gradient
 * }
 */
RA.update = function (s, inp, dt) {
 var T = RA.tune, rig = s.rig, onSnow = !inp.airborne && !inp.wiped && !inp.grinding, k;
 s.time += dt;

 // ---- 1. pose state machine (spec: rider.timing, HANGA.poseFor, HANGA.blendTime) ----
 // edge + is a left turn of the equipment (world, counter-clockwise), the pose's turn is - to the left in travel
 var edge = inp.edge || 0, edgeN = clamp(edge / T.edgeFull, -1, 1);
 var turnIn = -edgeN * (inp.riderSide || 1);
 s.turn += (turnIn - s.turn) * Math.min(1, dt / T.turnSmooth);
 s.riderSide = inp.riderSide || 1;
 if (inp.landed && onSnow) { s.landedAgo = 0; s.compV += Math.min(inp.impact || 0, T.impactMax) * T.landKick; s.compPeak = 0; }
 else if (s.landedAgo != null) { s.landedAgo += dt; if (!onSnow || s.landedAgo > 2) s.landedAgo = null; }
 // F7: a skier riding switch looks over the downhill-side shoulder; the side keeps a hysteresis around the fall line
 var fakie = rig === 'ski' && !!inp.isSwitch && onSnow;
 if (fakie) {
  var ds = inp.downhillSide || 0, hasAngle = inp.fallAngle != null;
  var sa = hasAngle ? Math.sin(inp.fallAngle) : ds, hy = hasAngle ? Math.sin(T.fakieHyst * D2R) : 0;
  if (!s.fakieSide) s.fakieSide = sa > 0 ? 1 : sa < 0 ? -1 : (ds || -1);
  else if (s.fakieSide > 0 && sa < -hy) s.fakieSide = -1;
  else if (s.fakieSide < 0 && sa > hy) s.fakieSide = 1;
 } else if (s.fakieW === 0) s.fakieSide = 0;
 if (s.fakieW === 0) s.fakieLook = s.fakieSide;
 s.fakieLook += clamp(s.fakieSide - s.fakieLook, -2 * dt / T.fakieSwap, 2 * dt / T.fakieSwap);
 // F3: the flip angle goes to the projection as it is, every frame; the tuck follows the sim's angle in the air
 var flipRot = inp.airborne && !inp.wiped && !inp.grinding ? inp.flipRot || 0 : 0;
 s.bodyPitch = flipRot / D2R;
 s.flipping = Math.abs(flipRot) > T.flipMin;
 // turn is already in the rider's frame (riderSide), so poseFor gets goofy: false and toe stays the +x edge
 var name = HANGA.poseFor({
  rig: rig,
  wiped: inp.wiped,
  grinding: inp.grinding,
  airborne: inp.airborne,
  flipping: s.flipping,
  landedAgo: s.landedAgo,
  braking: inp.braking && onSnow,
  brakeSide: s.brakeSide,
  approach: inp.approach && onSnow,
  isSwitch: fakie,
  lookSide: s.fakieSide > 0 ? 'left' : 'right',
  turn: s.turn,
  goofy: false,
 });
 if (name !== s.pose) { s.from = copyJ(s.poseJ); s.pose = name; s.t = 0; s.dur = HANGA.blendTime(name); }
 s.t += dt;
 var tgt = RA.poseTarget(rig, name), w = s.dur > 0 ? smooth(Math.min(1, s.t / s.dur)) : 1;
 if (!s.from || w >= 1) { s.poseJ = tgt; s.from = null; }
 else { s.poseJ = {}; for (k in tgt) s.poseJ[k] = [0, 1, 2].map(function (i) { return s.from[k][i] + (tgt[k][i] - s.from[k][i]) * w; }); }

 // ---- 1b. body twist: the upper body leads toward travel, the lower body and equipment keep the heading ----
 // twist (deg, + clockwise seen from above, the spec's sign) = equipment heading - upper-body heading. The upper body
 // looks the way the rider would face when travelling (travelDir, or its reverse when riding backwards), clamped to
 // twistMax and eased with twistSmooth. The side it looks over only changes once the equipment is clearly (sideHold)
 // on the other side of travel, so a skid across the fall line cannot flip the upper body round.
 // Braking (F5): the weight brakeW grows to 1, and with it the clamp (to brakeTwistMax, equipment across the fall line)
 // and the speed of the twist; the head turns against the shoulders by what the twist still lacks, so the face keeps
 // looking down the fall line (travel).
 var bk = inp.braking && onSnow ? 1 : 0, twistT = 0, raw = 0, tau = T.twistSmooth, lim = T.twistMax;
 s.brakeW += (bk - s.brakeW) * Math.min(1, dt / T.brakeSmooth);
 if (s.brakeW < 1e-3) { s.brakeW = 0; if (!bk) s.brakeSide = null; }
 if (onSnow && inp.facing != null && inp.travelDir != null) {
  var c = Math.cos(inp.facing - inp.travelDir);
  if (!s.lookSide) s.lookSide = inp.riderSide || 1;
  else if (s.brakeW === 0 && !bk) { if (c > T.sideHold) s.lookSide = 1; else if (c < -T.sideHold) s.lookSide = -1; }
  var ahead = inp.travelDir + (s.lookSide < 0 ? Math.PI : 0);
  // nearly stopped, travel is the equipment's own heading (AnimInput): keep looking where the rider was going
  if ((inp.speed == null || inp.speed >= T.holdSpeed) || s.ahead == null) s.ahead = ahead;
  else ahead = s.ahead;
  raw = wrapRad(ahead - inp.facing) * R2D;
  lim = T.twistMax + s.brakeW * (T.brakeTwistMax - T.twistMax);
  tau = T.twistSmooth + s.brakeW * (T.brakeTwistSmooth - T.twistSmooth);
  twistT = clamp(raw, -lim, lim);
  // which way the ski tips turn (the board always skids on its heel edge), kept for the whole brake: from the first
  // clear angle off travel; until then, and without facing and travel, braking stays 'crouch'
  if (bk && !s.brakeSide && Math.abs(raw) > T.brakeSideMin) {
   s.brakeSide = rig === 'board' ? 'heel' : raw < 0 ? 'left' : 'right';
  }
 }
 // F7: ease the switch look in and out with the weight fakieW; the shoulders open and the head turns (the spec's
 // switchL / switchR twist and head yaw, + for the left shoulder), swapping with fakieLook (-1 right .. +1 left)
 var fw = s.fakieW += ((fakie && !bk ? 1 : 0) - s.fakieW) * Math.min(1, dt / T.fakieSmooth), fh = 0;
 if (fw < 1e-3) s.fakieW = fw = 0;
 if (fw > 0) {
  var sw = HANGA.rider.poses.ski.switchL;
  twistT += (sw.twistDeg * s.fakieLook - twistT) * fw;
  fh = sw.headYawDeg * s.fakieLook * fw;
 }
 s.twist += (twistT - s.twist) * Math.min(1, dt / tau);
 s.headYaw = (s.brakeW > 0 ? -clamp(raw - s.twist, -T.brakeHeadMax, T.brakeHeadMax) * s.brakeW : 0) * (1 - fw) + fh;

 // ---- 2. body dynamics ----
 // Skid read: a low-passed 0..1 of how hard the equipment slides sideways; the body sits lower and gives up some lean.
 var skidIn = onSnow ? clamp((Math.abs(inp.skid || 0) - T.skidFrom) / (T.skidTo - T.skidFrom), 0, 1) : 0;
 s.skidW += (skidIn - s.skidW) * Math.min(1, dt / T.skidSmooth);
 // Lean: the body tips into the turn by the edge angle (deg of lean per deg of edge, not at a crawl). + edge is a
 // left turn, so the lean is toward the rider's -x (positive roll) when the rider's +x is on the right of travel.
 var speedW = smooth(clamp(((inp.speed || 0) - T.leanSpeedMin) / (T.leanSpeedFull - T.leanSpeedMin), 0, 1));
 var lean = onSnow ? clamp(T.edgeLean * R2D * edge * speedW * (1 - T.skidCounter * s.skidW), -T.leanMax, T.leanMax) : 0;
 var rollT = lean * (inp.riderSide || 1);
 // Unweighting: as the edge passes through flat from one turn to the other the body rises, a half sine over
 // unweightTime, and sinks into the new turn. Counts only after the edge reached unweightMinEdge on one side.
 if (onSnow && speedW > 0) {
  if (s.edgeSign * edge < 0) {
   if (s.unweightT >= T.unweightTime) s.unweightT = 0;
   s.edgeSign = 0;
  }
  if (Math.abs(edge) >= T.unweightMinEdge) s.edgeSign = edge > 0 ? 1 : -1;
 } else s.edgeSign = 0;
 s.unweightT += dt;
 s.rise = s.unweightT < T.unweightTime ? T.unweightHeight * Math.sin(Math.PI * s.unweightT / T.unweightTime) : 0;
 if (rig === 'board' && inp.braking && onSnow) rollT += T.brakeRoll;
 s.rollTarget = rollT;
 var sub = Math.max(1, Math.ceil(dt / T.maxStep)), h = dt / sub, i, r;
 if (inp.wiped) { s.roll = HANGA.rider.poses[rig][name].roll; s.rollV = 0; s.comp = 0; s.compV = 0; }
 else {
  var rest = 0, force = 0;
  if (onSnow) {
   rest = clamp(T.steepPerDeg * ((inp.slopeDeg || 0) - (inp.meanSlopeDeg || 0)), T.steepMin, T.steepMax) +
          T.tuckDepth * clamp(((inp.speed || 0) - T.tuckFrom) / (T.tuckTo - T.tuckFrom), 0, 1) + T.skidSit * s.skidW;
   force = clamp(inp.feetAccelUp || 0, -T.feetAccelMax, T.feetAccelMax);
  }
  for (i = 0; i < sub; i++) {
   r = spring(s.roll, s.rollV, rollT, T.rollHz, T.rollZeta, 0, h); s.roll = r[0]; s.rollV = r[1];
   r = spring(s.comp, s.compV, rest, T.compHz, T.compZeta, force, h); s.comp = r[0]; s.compV = r[1];
   if (s.comp > T.compMax) { s.comp = T.compMax; s.compV = Math.min(0, s.compV); }
   if (s.comp < T.compMin) { s.comp = T.compMin; s.compV = Math.max(0, s.compV); }
  }
  s.compPeak = Math.max(s.compPeak, s.comp);
 }
 s.J = RA.applyBody(s, inp, onSnow);
 return s;
};

/* Body dynamics as joint offsets on top of the blended pose. */
RA.applyBody = function (s, inp, onSnow) {
 var T = RA.tune, g = RA.groups[s.rig], J = copyJ(s.poseJ), q = s.comp - (onSnow ? s.rise : 0), f = g.fwd, k;
 if (inp.wiped) return J;
 // Compression: hips drop, knees go forward, the upper body folds forward over the feet.
 g.hips.forEach(function (j) { J[j][1] -= q; J[j][2] -= g.hipsBack * q; });
 g.knees.forEach(function (j) { J[j][1] -= 0.5 * q; J[j][f] += 0.45 * q; });
 g.upper.forEach(function (j) { J[j][1] -= 1.05 * q; J[j][f] += 0.5 * q; });
 if (onSnow && (inp.speed || 0) < 1) {
  var b = T.breathe * Math.sin(2 * Math.PI * T.breatheHz * s.time);
  g.upper.forEach(function (j) { J[j][1] += b; });
 }
 if (!onSnow) return J;
 if (inp.powderPose && inp.sink > 0) {
  // Spike: deep powder. A subtle, B stronger: the hips and knees drop, the upper body leans back.
  var pw = clamp(inp.sink / 0.5, 0, 1) * (inp.powderPose > 1 ? 1 : 0.5), pk;
  for (pk = 0; pk < g.hips.length; pk++) { J[g.hips[pk]][1] -= 0.12 * pw; J[g.hips[pk]][f] -= 0.15 * pw; }
  for (pk = 0; pk < g.knees.length; pk++) { J[g.knees[pk]][1] -= 0.06 * pw; J[g.knees[pk]][f] += 0.08 * pw; }
  for (pk = 0; pk < g.upper.length; pk++) { J[g.upper[pk]][1] -= 0.12 * pw; J[g.upper[pk]][f] -= (0.1 + 0.25 * Math.max(0, J[g.upper[pk]][1] - J.hipC[1])) * pw; }
 }
 // Angulation: the legs take the lean, the upper body leans back toward upright.
 var sr = Math.sin(s.roll * D2R), hipY = J.hipC[1];
 g.upper.forEach(function (j) { J[j][0] += (J[j][1] - hipY) * sr * T.angulation; });
 // Skis: the inside ski runs ahead (the L joints are on the rider's -x, where the body leans for a + roll).
 if (s.rig === 'ski') {
  var lead = clamp(s.roll / T.leanMax, -1, 1) * T.skiLead;
  for (k = 0; k < 2; k++) {
   var ahead = Math.max(0, k ? -lead : lead), joints = g.lead[k];
   for (var i = 0; i < joints.length; i++) J[joints[i]][2] += ahead;
  }
 }
 // Board: the shoulders lead into the turn. The rider faces +x and travels along +z (riderSide 1) or -z (-1), so the
 // leading side is F or B; s.turn is + toward the rider's +x, so the leading side moves with it and the other against.
 if (s.rig === 'board') {
  var fwdSide = (s.riderSide || 1) > 0, ld = T.boardLead * s.turn * (1 - s.brakeW);
  [['shF', 'shB'], ['elbF', 'elbB'], ['hanF', 'hanB']].forEach(function (pair) {
   J[pair[fwdSide ? 0 : 1]][0] += ld;
   J[pair[fwdSide ? 1 : 0]][0] -= ld;
  });
 }
 // Arms: the outside hand rises and reaches out; all hands trail behind a change of lean.
 var out = clamp(s.roll / T.leanMax, -1, 1), lag = s.rollTarget - s.roll;
 for (k in g.hands) {
  var side = g.hands[k][0], wgt = g.hands[k][1];
  if (side) { J[k][1] += T.armOut * out * side * wgt; J[k][0] += 0.5 * T.armOut * out * wgt; }
  else { J[k][0] += T.armOut * out * wgt; J[k][1] += 0.4 * T.armOut * Math.abs(out) * wgt; }
  J[k][0] -= T.armLag * lag * wgt;
 }
 return J;
};

/* The current pose as a spec pose: {roll, lift, move} relative to the rig's base joints. */
RA.livePose = function (s) {
 var base = HANGA.rider.joints[s.rig], move = {}, k;
 for (k in s.J) move[k] = [s.J[k][0] - base[k][0], s.J[k][1] - base[k][1], s.J[k][2] - base[k][2]];
 return { label: 'Live', roll: s.roll, lift: 0, move: move };
};

/*
 * Draw list for the current pose, straight from HANGA.projectRider (lift is left to the game's jump height).
 * options (optional): passed through to projectRider as they are (spec v1.4: cameraPitchDeg, twistDeg, headYawDeg,
 * bodyPitchDeg, all degrees). The live pose has no twist or head yaw of its own. Body twist (s.twist) is added as
 * options.twistDeg unless options has one; yawDeg is then the upper body's heading (view: facing yaw - s.twist). The
 * spec mirrors a goofy board's twist with its joints, so it is negated here and s.twist stays the real turn.
 */
RA.project = function (s, yawDeg, pitchDeg, stance, options) {
 HANGA.rider.poses[s.rig][LIVE] = RA.livePose(s);
 if (s.bodyPitch !== 0 && !(options && options.bodyPitchDeg != null)) {
  var f = s.flipOpts || (s.flipOpts = {});
  f.cameraPitchDeg = options ? options.cameraPitchDeg : undefined;
  f.twistDeg = options ? options.twistDeg : undefined;
  f.headYawDeg = options ? options.headYawDeg : undefined;
  f.bodyPitchDeg = s.bodyPitch;
  options = f;
 }
 if ((s.twist !== 0 || s.headYaw !== 0) && !(options && options.twistDeg != null)) {
  var o = s.opts || (s.opts = {}), mirror = s.rig === 'board' && stance === 'goofy' ? -1 : 1;
  o.cameraPitchDeg = options ? options.cameraPitchDeg : undefined;
  o.bodyPitchDeg = options ? options.bodyPitchDeg : undefined;
  o.headYawDeg = options && options.headYawDeg != null ? options.headYawDeg : mirror * s.headYaw;
  o.twistDeg = mirror * s.twist;
  options = o;
 }
 return HANGA.projectRider(s.rig, LIVE, yawDeg, pitchDeg, 0, stance, options);
};

if (typeof module !== 'undefined' && module.exports) module.exports = RA;
else root.RiderAnim = RA;
})(this);
