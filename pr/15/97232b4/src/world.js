// World data: the piste centreline cx(), rail geometry, kicker ramp shape, value noise, height/groomed arrays and their terrain, map canvas.
const cx=y=>500+170*Math.sin(y/350)+70*Math.sin(y/130+1);
// A rail is a straight chord that follows the piste: x0,y0 to its end, with unit direction dx,dy and length len.
const RAILS=RAIL_DEF.map(([ya,n,off,t])=>{const yb=ya+n,x0=cx(ya)+off,x1=cx(yb)+off,len=Math.hypot(x1-x0,yb-ya);
 return{y0:ya,y1:yb,x0,x1,len,dx:(x1-x0)/len,dy:(yb-ya)/len,h:t==='box'?.55:.75,t}});
// Kicker ramp: a curved rise up to the lip, then a short drop. Extra height in metres at (px,py).
function bump(px,py){let h=0;
 for(const k of KICK){if(py<k-11||py>k+4)continue;const d=Math.abs(px-cx(py));if(d>10)continue;
  const hk=KBIG.has(k)?2.2:1.3,u=py<k?Math.pow((py-(k-11))/11,1.5):1-(py-k)/4,w=d<7?1:1-(d-7)/3;h+=hk*u*w}
 return h}
const hash=(i,j)=>{const n=Math.sin(i*127.1+j*311.7)*43758.5453;return n-Math.floor(n)};
function vn(x,y){const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
return hash(i,j)*(1-u)*(1-v)+hash(i+1,j)*u*(1-v)+hash(i,j+1)*(1-u)*v+hash(i+1,j+1)*u*v}
const fbm=(x,y)=>vn(x/90,y/90)*.55+vn(x/40,y/40)*.3+vn(x/17,y/17)*.15;
const H=new Float32Array(W0*H0),M=new Uint8Array(W0*H0),trees=new Map(),treeArr=[];
// The procedural map's terrain (src/terrain.js): one base layer, the H grid (1 m cells, kicker ramps baked in by
// build()); sculpt, features and detail are empty. Groomed is the M mask of the cell containing (x,y), as 0..1.
// Everything outside world.js and build.js reads the ground through `terrain`, never H or M.
const terrain=Terrain.create({base:Terrain.grid(H,W0,H0,1),
 groomed:(x,y)=>M[Math.max(0,Math.min(H0-1,y|0))*W0+Math.max(0,Math.min(W0-1,x|0))]/255});
const map=document.createElement('canvas');map.width=W0;map.height=H0;
const mx=map.getContext('2d');
