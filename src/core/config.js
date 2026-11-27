// Tunables shared by the simulation, the camera, the renderer and input: constants only, units in comments.

export const TAU = Math.PI * 2; // rad, one full turn

// ---- equipment ----
// Both are twin tip. Skis grip better and go edge to edge quicker (so they turn in a little quicker) but carve a
// longer radius; the board spins a little slower. turn: dimensionless gain on the low-speed pivot rate
// (sim/tuning.js EDGE.PIVOT_RATE); grip: 1/s, how fast sideways slip dies in a skid; spin: rad/s in the air.
// The edge and carve (F6, sim/edge.js): sidecut: m, the carve radius at 90 degrees of edge (R = sidecut / sin(edge)),
// shorter than real gear (about 7 m for a board, 13-16 m for skis) for an arcade turn; edgeRate: rad/s, how fast
// the edge angle follows the steer; edgeGrip: m/s², the most sideways acceleration the edge holds before it skids.
export const RIGS = Object.freeze({
 board: Object.freeze({ turn: 1, grip: 5, spin: 7, sidecut: 5, edgeRate: 5, edgeGrip: 28 }),
 ski: Object.freeze({ turn: 1.12, grip: 6.5, spin: 8, sidecut: 5.8, edgeRate: 12, edgeGrip: 32 }),
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
export const MAX_PARTICLES = 160; // particles alive at once, at most

// ---- input ----
export const SWIPE_PX = 36; // CSS px a finger must move down to brake

// ---- camera: behind and well above the rider, looking steeply down the slope ----
// The framings the player can switch between (CV1, tap the rider). back: m behind the rider; height: m above the
// rider's ground; fov: rad, horizontal field of view; focalFrac: focal length as a fraction of the render height;
// horizonFrac: untilted horizon row as a fraction of the render height (A today; B and C from the closed spike #87).
export const CAM_MODES = Object.freeze([
 Object.freeze({ id: 'A', label: 'Classic cam', back: 10, height: 7.6, fov: 1.15, focalFrac: 0.75, horizonFrac: 0.14 }),
 Object.freeze({ id: 'B', label: 'Chase cam', back: 14, height: 2.5, fov: 1.43, focalFrac: 0.6, horizonFrac: 0.455 }),
 Object.freeze({ id: 'C', label: 'High cam', back: 20, height: 3, fov: 0.86, focalFrac: 1.0, horizonFrac: 0.535 }),
]);
// Mode A's values (the default and today's camera): what code that does not follow the mode reads.
export const FOV = CAM_MODES[0].fov;     // rad, horizontal field of view
export const RAY_SAMPLES = 152; // terrain samples along each screen column
export const CAM_BACK = CAM_MODES[0].back;  // m behind the rider
export const CAM_HEIGHT = CAM_MODES[0].height; // m above the rider's ground
export const HORIZON_FRAC = CAM_MODES[0].horizonFrac; // untilted horizon row as a fraction of the render height
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
