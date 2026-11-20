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
 return hash(i, j) * (1 - u) * (1 - v) + hash(i + 1, j) * u * (1 - v) + hash(i, j + 1) * (1 - u) * v + hash(i + 1, j + 1) * u * v;
}

/** 0..1, three octaves of value noise at map point (x, y) in m (90, 40 and 17 m features). */
export const fbm = (x, y) => vn(x / 90, y / 90) * 0.55 + vn(x / 40, y / 40) * 0.3 + vn(x / 17, y / 17) * 0.15;

// fbm(x,y) along whole map rows: fbmRows(nx, ny) returns row(y,out), which fills out[x] (x = 0..nx-1) for row y. Gives
// exactly the same numbers as fbm(): the same lattice hashes and the same arithmetic in the same order, but each
// lattice hash is computed once rather than 12 Math.sin calls per cell, and the per-column and per-row terms once
// per column and row (M2). Memory: about 150 KB of tables, plus the caller's 8 KB row.
/** Row-wise fbm for a nx × ny cell map: returns row(y, out) that fills out[0..nx-1] and returns out. */
export function fbmRows(nx, ny) {
 const S=[90,40,17],WT=[.55,.3,.15],n=S.length,ni=[],hs=[],ci=[],cu=[],cu1=[],
 rj=new Int32Array(n),rv=new Float64Array(n),rv1=new Float64Array(n);
 for(let o=0;o<n;o++){const s=S[o],w=Math.floor((nx-1)/s)+2,h=Math.floor((ny-1)/s)+2,T=new Float64Array(w*h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)T[j*w+i]=hash(i,j);ni.push(w);hs.push(T);
  const I=new Int32Array(nx),U=new Float64Array(nx),U1=new Float64Array(nx);
  for(let x=0;x<nx;x++){const X=x/s,i=Math.floor(X),fx=X-i,u=fx*fx*(3-2*fx);I[x]=i;U[x]=u;U1[x]=1-u}
  ci.push(I);cu.push(U);cu1.push(U1)}
 const [T0,T1,T2]=hs,[I0,I1,I2]=ci,[U0,Ua,U2]=cu,[V0,Va,V2]=cu1,[w0,w1,w2]=ni,k0=WT[0],k1=WT[1],k2=WT[2];
 return(y,out)=>{
  for(let o=0;o<n;o++){const Y=y/S[o],j=Math.floor(Y),fy=Y-j,v=fy*fy*(3-2*fy);rj[o]=j*ni[o];rv[o]=v;rv1[o]=1-v}
  const r0=rj[0],r1=rj[1],r2=rj[2],v0=rv[0],v1=rv[1],v2=rv[2],q0=rv1[0],q1=rv1[1],q2=rv1[2];
  for(let x=0;x<nx;x++){
   let a=r0+I0[x],u=U0[x],p=V0[x];
   const n0=T0[a]*p*q0+T0[a+1]*u*q0+T0[a+w0]*p*v0+T0[a+w0+1]*u*v0;
   a=r1+I1[x];u=Ua[x];p=Va[x];
   const n1=T1[a]*p*q1+T1[a+1]*u*q1+T1[a+w1]*p*v1+T1[a+w1+1]*u*v1;
   a=r2+I2[x];u=U2[x];p=V2[x];
   const n2=T2[a]*p*q2+T2[a+1]*u*q2+T2[a+w2]*p*v2+T2[a+w2+1]*u*v2;
   out[x]=n0*k0+n1*k1+n2*k2}
  return out}}
