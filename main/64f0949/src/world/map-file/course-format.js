// The gresca-map-1 course file's constants (docs/adr/0010-map-course-format.md): pure, no Node APIs.
// Shared by the compiler (core.js), the run geometry (course-run.js) and the validator (validate.js).

/** What kind of gresca-map-1 file a course is (the terrain file is 'terrain', format.js). */
export const KIND_COURSE = 'course';
/** The tree sets the art spec has (HANGA.maps[id].treeSet). */
export const TREE_SETS = Object.freeze(['sugi', 'pine']);
/** What a park rail or box is, as in the Course contract (core/contracts.js). */
export const RAIL_TYPES = Object.freeze(['rail', 'box']);

/** deg, how far the file's meanSlopeDeg may differ from the run measured on the terrain it names. */
export const MEAN_SLOPE_TOLERANCE_DEG = 1;
/** deg, the steepest mean slope a course may claim (a run steeper than this on average is a cliff, R5). */
export const MAX_MEAN_SLOPE_DEG = 45;
/** m, the piste widths a course may have. */
export const WIDTH_RANGE_M = Object.freeze({ min: 4, max: 200 });
/** m, the shortest run that makes a course. */
export const MIN_LENGTH_M = 50;
/** m, how far a point of the smoothed run may stray past the terrain's bounds (the grid edge is a hard edge). */
export const RUN_BOUNDS_TOLERANCE_M = 0.05;

/** deg, the sun's elevation limits: above the horizon, below the zenith. */
export const SUN_ELEVATION_RANGE_DEG = Object.freeze({ min: 1, max: 89 });
/** deg, the default sun elevation of a compiled course (low, a dawn or late light: the El Tarter spec value). */
export const DEFAULT_SUN_ELEVATION_DEG = 16;

/** deg, the horizon profile's steps: whole degrees that divide 360 (the spec uses 1). */
export const HORIZON_STEPS_DEG = Object.freeze([1, 2, 3, 4, 5, 6, 8, 9, 10]);
/** deg above the horizontal, the lowest and highest horizon angle a profile may hold. */
export const HORIZON_ANGLE_RANGE_DEG = Object.freeze({ min: -60, max: 60 });
/** m, the eye height above the run's middle point that the horizon is seen from. */
export const HORIZON_EYE_M = 2;
/** m, how far along each heading the horizon is searched, and the step between samples (the grid's own scale). */
export const HORIZON_MIN_RANGE_M = 200;
