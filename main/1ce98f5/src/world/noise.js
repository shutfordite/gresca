// Seeded value noise for the procedural terrain: hash(), vn(), fbm() and the fast row-wise fbmRows().

/** 0..1, a fixed pseudo-random value for the lattice point (i, j). */
export const hash = (i, j) => {
 const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
 return n - Math.floor(n);
};

/** 0..1, smooth value noise at (x, y) in lattice units. */
export function vn(x, y) {
 const i = Math.floor(x);
 const j = Math.floor(y);
 const fx = x - i;
 const fy = y - j;
 const u = fx * fx * (3 - 2 * fx);
 const v = fy * fy * (3 - 2 * fy);
 return hash(i, j) * (1 - u) * (1 - v) + hash(i + 1, j) * u * (1 - v) +
  hash(i, j + 1) * (1 - u) * v + hash(i + 1, j + 1) * u * v;
}

/** 0..1, three octaves of value noise at map point (x, y) in m (90, 40 and 17 m features). */
export const fbm = (x, y) => vn(x / 90, y / 90) * 0.55 + vn(x / 40, y / 40) * 0.3 + vn(x / 17, y / 17) * 0.15;

// fbm(x,y) along whole map rows: fbmRows(nx, ny) returns row(y,out), which fills out[x] (x = 0..nx-1) for row y. Gives
// exactly the same numbers as fbm(): the same lattice hashes and the same arithmetic in the same order, but each
// lattice hash is computed once rather than 12 Math.sin calls per cell, and the per-column and per-row terms once
// per column and row (M2). Memory: about 150 KB of tables, plus the caller's 8 KB row.
/** Row-wise fbm for a nx × ny cell map: returns row(y, out) that fills out[0..nx-1] and returns out. */
export function fbmRows(nx, ny) {
 const S = [90, 40, 17];   // m, the three octaves' feature sizes (as fbm)
 const WT = [0.55, 0.3, 0.15]; // their weights
 const n = S.length;
 const ni = [];  // lattice columns per octave
 const hs = [];  // lattice hashes per octave
 const ci = [];  // per map column: lattice column
 const cu = [];  // per map column: smoothed fraction u
 const cu1 = []; // per map column: 1 - u
 const rj = new Int32Array(n);
 const rv = new Float64Array(n);
 const rv1 = new Float64Array(n);
 for (let o = 0; o < n; o++) {
  const s = S[o];
  const w = Math.floor((nx - 1) / s) + 2;
  const h = Math.floor((ny - 1) / s) + 2;
  const T = new Float64Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) T[j * w + i] = hash(i, j);
  ni.push(w);
  hs.push(T);
  const I = new Int32Array(nx);
  const U = new Float64Array(nx);
  const U1 = new Float64Array(nx);
  for (let x = 0; x < nx; x++) {
   const X = x / s;
   const i = Math.floor(X);
   const fx = X - i;
   const u = fx * fx * (3 - 2 * fx);
   I[x] = i;
   U[x] = u;
   U1[x] = 1 - u;
  }
  ci.push(I);
  cu.push(U);
  cu1.push(U1);
 }
 const [T0, T1, T2] = hs;
 const [I0, I1, I2] = ci;
 const [U0, Ua, U2] = cu;
 const [V0, Va, V2] = cu1;
 const [w0, w1, w2] = ni;
 const k0 = WT[0];
 const k1 = WT[1];
 const k2 = WT[2];
 return (y, out) => {
  for (let o = 0; o < n; o++) {
   const Y = y / S[o];
   const j = Math.floor(Y);
   const fy = Y - j;
   const v = fy * fy * (3 - 2 * fy);
   rj[o] = j * ni[o];
   rv[o] = v;
   rv1[o] = 1 - v;
  }
  const r0 = rj[0];
  const r1 = rj[1];
  const r2 = rj[2];
  const v0 = rv[0];
  const v1 = rv[1];
  const v2 = rv[2];
  const q0 = rv1[0];
  const q1 = rv1[1];
  const q2 = rv1[2];
  for (let x = 0; x < nx; x++) {
   let a = r0 + I0[x];
   let u = U0[x];
   let p = V0[x];
   const n0 = T0[a] * p * q0 + T0[a + 1] * u * q0 + T0[a + w0] * p * v0 + T0[a + w0 + 1] * u * v0;
   a = r1 + I1[x];
   u = Ua[x];
   p = Va[x];
   const n1 = T1[a] * p * q1 + T1[a + 1] * u * q1 + T1[a + w1] * p * v1 + T1[a + w1 + 1] * u * v1;
   a = r2 + I2[x];
   u = U2[x];
   p = V2[x];
   const n2 = T2[a] * p * q2 + T2[a + 1] * u * q2 + T2[a + w2] * p * v2 + T2[a + w2 + 1] * u * v2;
   out[x] = n0 * k0 + n1 * k1 + n2 * k2;
  }
  return out;
 };
}
