// The game's façade seen on the procedural map's own grid (docs/adr/0005-enu-frame.md): tests are written there.
// The game itself works in world metres (x east, y north, headings counter-clockwise from east) and places the map's
// grid in the world with a MapFrame (Gresca.world.frame). The tests are about the procedural map, which is authored
// on its grid: x across the piste, y down it, headings clockwise from +x (so heading PI/2 is straight down), compass
// degrees as at the default placement. mapView(G) converts every coordinate of the façade through the game's own
// frame, both ways, so the same tests run with the map at any placement (npm run test:rotated). The conversions are exact at
// the default placement (rotation 0: x = u, y = -v), so there nothing changes, bit for bit.

// m: how far a value read back through a rotated frame may be from the one the game set (a few ulps of the round
// trip through cos and sin; ADR 0005). At the default placement the round trip is exact, so the tolerance is 0.
export const ROTATED_TOL = 1e-9;

/** The façade G (ENU) as a frozen façade on the map's grid: the same members, coordinates converted. */
export function mapView(G) {
 const F = G.world.frame;
 const ROT_DEG = F.rotation * 180 / Math.PI;
 const pos = (x, y) => {
  const p = F.toGrid(x, y);
  return { x: p.u, y: p.v };
 };
 const vec = (x, y) => {
  const p = F.vecToGrid(x, y);
  return { x: p.u, y: p.v };
 };
 const heading = (h) => F.headingToGrid(h); // its own inverse
 const side = (s) => (s === 0 ? 0 : -s); // the grid is mirrored: counter-clockwise there is clockwise here
 const tol = F.rotation === 0 ? 0 : ROTATED_TOL;

 // state() and set() names that carry coordinates
 function stateToGrid(s) {
  const o = { ...s };
  if ('x' in s) Object.assign(o, pos(s.x, s.y));
  if ('vx' in s) {
   const v = vec(s.vx, s.vy);
   o.vx = v.x;
   o.vy = v.y;
  }
  for (const k of ['heading', 'travelHeading', 'boardHeading', 'fallLine']) if (k in s) o[k] = heading(s[k]);
  if ('downhillSide' in s) o.downhillSide = side(s.downhillSide);
  if (s.camera) o.camera = cameraToGrid(s.camera);
  return o;
 }
 function cameraToGrid(c) {
  const o = { ...c };
  if ('x' in c) Object.assign(o, pos(c.x, c.y));
  if ('dirX' in c) {
   const d = vec(c.dirX, c.dirY);
   o.dirX = d.x;
   o.dirY = d.y;
  }
  if ('heading' in c) o.heading = heading(c.heading);
  return o;
 }
 // A patch on the grid -> the same patch in the world. A pair written half (x alone) keeps the other half as now.
 function pairToWorld(p, out, kx, ky, now, toWorld) {
  if (!(kx in p) && !(ky in p)) return;
  const x = kx in p ? p[kx] : now[kx];
  const y = ky in p ? p[ky] : now[ky];
  const w = toWorld(x, y);
  out[kx] = w.x;
  out[ky] = w.y;
 }
 function patchToWorld(p) {
  const o = { ...p };
  const now = (('x' in p) !== ('y' in p) || ('vx' in p) !== ('vy' in p)) ? stateToGrid(G.state()) : null;
  pairToWorld(p, o, 'x', 'y', now, F.toWorld);
  pairToWorld(p, o, 'vx', 'vy', now, F.vecToWorld);
  for (const k of ['heading', 'travelHeading', 'boardHeading', 'fallLine']) if (k in p) o[k] = heading(p[k]);
  if ('downhillSide' in p) o.downhillSide = side(p.downhillSide);
  if (p.camera && typeof p.camera === 'object') {
   const c = { ...p.camera };
   const cnow = (('x' in c) !== ('y' in c) || ('dirX' in c) !== ('dirY' in c)) ? stateToGrid(G.state()).camera : null;
   pairToWorld(p.camera, c, 'x', 'y', cnow, F.toWorld);
   pairToWorld(p.camera, c, 'dirX', 'dirY', cnow, F.vecToWorld);
   if ('heading' in c) c.heading = heading(c.heading);
   o.camera = c;
  }
  return o;
 }
 // place() on the grid: {x, y, vx, vy, heading, z, vz}; y alone puts the rider on the centreline level with it, x
 // alone at y 500 (as the façade did before C2).
 function placeToWorld(p) {
  const o = { ...p };
  delete o.x;
  delete o.y;
  if ('x' in p) Object.assign(o, F.toWorld(p.x, 'y' in p ? p.y : 500));
  else if ('y' in p) Object.assign(o, { s: course.project(0, p.y).s, d: 0 });
  if ('vx' in p || 'vy' in p) {
   const v = F.vecToWorld(p.vx || 0, p.vy || 0);
   o.vx = v.x;
   o.vy = v.y;
  }
  if ('heading' in p) o.heading = heading(p.heading);
  return o;
 }

 const railToGrid = (r) => {
  const a = pos(r.x0, r.y0);
  const b = pos(r.x1, r.y1);
  const d = vec(r.dx, r.dy);
  return { ...r, x0: a.x, y0: a.y, x1: b.x, y1: b.y, dx: d.x, dy: d.y };
 };
 const kickerToGrid = (k) => k && { ...k, ...pos(k.x, k.y) };
 const W = G.world;
 const C = W.course;
 const at = (fn) => (px, py, ...rest) => {
  const w = F.toWorld(px, py);
  return fn(w.x, w.y, ...rest);
 };
 const course = Object.freeze({
  length: C.length,
  startS: C.startS,
  finishS: C.finishS,
  project: at((x, y) => {
   const p = C.project(x, y);
   const t = vec(p.tx, p.ty);
   return { ...p, tx: t.x, ty: t.y };
  }),
  point: (s, d) => {
   const p = C.point(s, d);
   return pos(p.x, p.y);
  },
  fallLine: at((x, y) => {
   const f = C.fallLine(x, y);
   const d = vec(f.fx, f.fy);
   const g = vec(f.gx, f.gy);
   return { ...f, fx: d.x, fy: d.y, gx: g.x, gy: g.y, heading: heading(f.heading) };
  }),
  widthAt: (s) => C.widthAt(s),
  kickerAt: (s, d) => kickerToGrid(C.kickerAt(s, d)),
  get kickers() { return C.kickers.map(kickerToGrid); },
  get rails() { return C.rails.map(railToGrid); },
 });
 const lipY = (k) => pos(k.x, k.y).y;
 const world = Object.freeze({
  frame: W.frame,
  bounds: W.bounds,
  size: Object.freeze({ x: W.bounds.width, y: W.bounds.length }), // m, the map's extent on its grid
  finishY: (() => {
   const p = C.point(C.finishS, 0);
   return pos(p.x, p.y).y;
  })(),
  centre: (y) => course.point(course.project(0, y).s, 0).x, // m, x of the centreline level with y
  height: at(W.height),
  cellHeight: at(W.cellHeight),
  gradient: at((x, y) => {
   const g = W.gradient(x, y);
   const v = vec(g.gx, g.gy);
   return { gx: v.x, gy: v.y };
  }),
  slopeDeg: at(W.slopeDeg),
  layers: W.layers,
  groomed: at(W.groomed),
  noise: at(W.noise),
  rampHeight: at(W.rampHeight),
  get kickers() { return C.kickers.map(lipY); },
  get bigKickers() { return C.kickers.filter((k) => k.big).map(lipY); },
  get rails() { return W.rails.map(railToGrid); },
  course,
  get trees() { return W.trees.map((T) => pos(T.x, T.y)); },
 });

 const D = G.debug;
 const debug = Object.freeze({
  ...D,
  project: at((x, y, h) => D.project(x, y, h)),
  camCompass: () => ((D.camCompass() + ROT_DEG) % 360 + 360) % 360, // compass as at the default placement
  sunAzimuthDeg: () => ((D.sunAzimuthDeg() + ROT_DEG) % 360 + 360) % 360,
  heightFast: at(D.heightFast),
  colourAt: at(D.colourAt),
  baseColourAt: at(D.baseColourAt),
  view: () => {
   const v = D.view();
   return { ...v, ...pos(v.x, v.y), from: { ...v.from, ...pos(v.from.x, v.from.y) } };
  },
 });

 return Object.freeze({
  ...G,
  state: () => stateToGrid(G.state()),
  set: (p) => G.set(patchToWorld(p)),
  place: (o = {}) => G.place(placeToWorld(o)),
  particles: () => G.particles().map((p) => {
   const v = vec(p.vx, p.vy);
   return { ...p, ...pos(p.x, p.y), vx: v.x, vy: v.y };
  }),
  emitParticles(n, px, py, pz, spread, up, dvx, dvy) {
   const w = F.toWorld(px, py);
   const v = F.vecToWorld(dvx, dvy);
   G.emitParticles(n, w.x, w.y, pz, spread, up, v.x, v.y);
  },
  world,
  debug,
  raw: G, // the façade itself, in world metres
  // a <= b and a >= b for a grid value read back through the frame: exact at the default placement, within
  // ROTATED_TOL when the map is rotated (the only place a test allows for the frame's rounding)
  le: (a, b) => a <= b + tol,
  ge: (a, b) => a >= b - tol,
 });
}
