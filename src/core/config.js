// Tunables shared by the simulation, the camera, the renderer and input: constants only, units in comments.

export const TAU = Math.PI * 2; // rad, one full turn

// ---- equipment ----
// Both are twin tip. Skis grip harder and go edge to edge quicker but carve a longer radius and sink deeper in
// powder; the board floats sooner and spins a little slower. turn: dimensionless gain on the low-speed pivot rate
// (sim/tuning.js EDGE.PIVOT_RATE); spin: rad/s in the air.
// The edge and the snow (sim/edge.js, sim/contact.js): sidecut: m, the carve radius at 90 degrees of edge
// (R = sidecut / sin(edge)), a little shorter than real gear (about 7 m for a board, 12-16 m for skis);
// edgeRate: rad/s, how fast the rider tips onto an edge (weight moving over, the turn building while steer is held);
// releaseRate: rad/s, how fast an edge flattens or rolls to the other one (letting go is quicker than tipping in);
// edgeGrip: m/s², the most sideways acceleration a fully tipped edge holds on firm snow before it breaks into a skid;
// skidGrip: 0..1, the share of edgeGrip the snow still gives once the edge slides (kinetic against static);
// yawLag: s, how long the equipment takes to answer a new turn rate on firm snow (its swing weight);
// float: m/s, the speed at which it planes on top of deep powder instead of ploughing through it.
export const RIGS = Object.freeze({
 board: Object.freeze({
  turn: 1, // dimensionless, low-speed pivot gain
  spin: 7, // rad/s in the air
  sidecut: 5.5, // m, carve radius at 90 degrees of edge
  edgeRate: 2.2, // rad/s, tipping onto an edge
  releaseRate: 4.5, // rad/s, flattening or rolling over
  edgeGrip: 28, // m/s², sideways hold of a full edge on firm snow
  skidGrip: 0.72, // 0..1 of edgeGrip once sliding
  yawLag: 0.09, // s, swing weight
  float: 9, // m/s, planes on deep powder
 }),
 ski: Object.freeze({
  turn: 1.12, // dimensionless, low-speed pivot gain
  spin: 8, // rad/s in the air
  sidecut: 7.5, // m, carve radius at 90 degrees of edge
  edgeRate: 3.6, // rad/s, tipping onto an edge
  releaseRate: 5.5, // rad/s, flattening or rolling over
  edgeGrip: 32, // m/s², sideways hold of a full edge on firm snow
  skidGrip: 0.78, // 0..1 of edgeGrip once sliding
  yawLag: 0.05, // s, swing weight
  float: 13, // m/s, planes on deep powder
 }),
});

// ---- fixed timestep ----
export const SIM_DT = 1 / 120; // s, one simulation step (120 Hz)
export const SIM_MAX = 8;      // steps, the most run in one frame (8/120 s = 67 ms of simulation)
export const SIM_EPS = 1e-9;   // s, slack so frame times that are exact multiples of SIM_DT don't lose a step

// ---- physics ----
// Gravity. The pull down the fall line is GRAVITY*GRAVITY_GAIN*tan(slope) in m/s², with tan(slope) = |gradient| of the
// terrain's smooth surface at the rider. On the piste's 10-20° slopes tan is within 2-7% of sin, so this is close to
// the textbook g·sin(slope) of a slider on an incline, made 1.6 times stronger on purpose for game feel (the strength
// the game has always been tuned with). Before B3 this was a bare 15.7 times a cell-by-cell central difference.
export const GRAVITY = 9.81;    // m/s², real gravity
export const GRAVITY_GAIN = 1.6; // dimensionless, game-feel gain on gravity along the slope

// ---- spray particles ----
export const MAX_PARTICLES = 360; // particles alive at once, at most (deep powder throws a plume)

// ---- input ----
export const SWIPE_PX = 36; // CSS px a finger must move down to brake

// ---- camera: behind and well above the rider, looking steeply down the slope ----
export const FOV = 1.15;     // rad, horizontal field of view
export const RAY_SAMPLES = 152; // terrain samples along each screen column
export const CAM_BACK = 10;  // m behind the rider
export const CAM_HEIGHT = 7.6; // m above the rider's ground
export const HORIZON_FRAC = 0.14; // untilted horizon row as a fraction of the render height
export const RIDER_SCALE = 0.55; // dimensionless, rider draw scale
export const MAP_ID = 'procedural'; // picks the map's sun and sky in HANGA.maps
// m, the raycaster samples the exact terrain surface this close to the camera, the fast path beyond
export const RAY_EXACT_M = 40;
export const RAY_START_M = 3; // m, the first terrain sample along each screen column
export const RAY_SPREAD = 0.012; // dimensionless, each sample is 1 m plus this fraction further than the last
// m, distance of the last terrain sample
export const RAY_FAR = (() => {
 let z = RAY_START_M;
 for (let k = 0; k < RAY_SAMPLES - 1; k++) z += 1 + z * RAY_SPREAD;
 return z;
})();
