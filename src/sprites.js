// Rendering helpers: project() to the screen, flags and poles, rails and boxes.
// ---- rendering: behind-the-rider view ----
const lo=document.createElement('canvas'),lx=lo.getContext('2d'),occ=new Int16Array(400*NS);
// Screen position of a world point (wx,wy) at height h, in canvas pixels. null if behind or off to the side.
function project(wx,wy,h){const ox=wx-cam.px,oy=wy-cam.py,f=ox*cam.dx+oy*cam.dy;if(f<3)return null;
 const r=-ox*cam.dy+oy*cam.dx,p=Math.atan2(r,f);if(Math.abs(p)>FOV/2+.08)return null;
 return{X:(.5+p/FOV)*cam.RW*cam.kx,Y:((camH-h)/f*cam.sc+cam.hz-cam.pt)*cam.kx,s:cam.sc/f*cam.kx,f,z:Math.hypot(f,r)}}

let flagsDrawn=0;
// Orange flags on both sides of every kicker lip, and a flag at the start of each rail, so features can be spotted from far up the slope.
function pole(wx,wy,hgt,color){const gh=terrain.height(wx,wy),A=project(wx,wy,gh),T=project(wx,wy,gh+hgt);if(!A||!T)return;
 ctx.strokeStyle='#3a3f58';ctx.lineWidth=Math.max(1,A.s*.08);ctx.beginPath();ctx.moveTo(A.X,A.Y);ctx.lineTo(T.X,T.Y);ctx.stroke();
 const fw=Math.max(5,A.s*.9),fh=Math.max(4,A.s*.55);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(T.X,T.Y);ctx.lineTo(T.X+fw,T.Y+fh*.5);ctx.lineTo(T.X,T.Y+fh);ctx.closePath();ctx.fill();flagsDrawn++}
function drawFlags(){flagsDrawn=0;
 for(const k of KICK){if(k+5<cam.py||k-11>cam.py+260)continue;const big=KBIG.has(k),c=cx(k),h=big?3.2:2.4;
  pole(c-11,k,h,'#ff6b3d');pole(c+11,k,h,'#ff6b3d');if(big){pole(c-11,k-8,h,'#ffd23d');pole(c+11,k-8,h,'#ffd23d')}}
 for(const r of RAILS){if(r.y1<cam.py||r.y0>cam.py+260)continue;pole(r.x0+(r.x0>cx(r.y0)?3:-3),r.y0,1.8,r.t==='box'?'#6fcfa0':'#c9372c')}}

let railsDrawn=0;
// Rails are red bars on posts, boxes are wider mint-green bars. Drawn as short segments so the near end can run off screen.
function drawRails(){
 let n=0;
 for(const r of RAILS){
  if(r.y1<cam.py-5||r.y0>cam.py+260)continue;
  let prev=null;
  for(let t=0;t<=r.len+.01;t+=1.5){const tt=Math.min(t,r.len),wx=r.x0+r.dx*tt,wy=r.y0+r.dy*tt,gh=terrain.height(wx,wy),P=project(wx,wy,gh+r.h);
   if(P&&prev){ctx.strokeStyle=r.t==='box'?'#6fcfa0':'#c9372c';ctx.lineWidth=Math.max(r.t==='box'?5:3,P.s*(r.t==='box'?1.3:.5));ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(prev.X,prev.Y);ctx.lineTo(P.X,P.Y);ctx.stroke();n++}
   if(P&&t%6<1.5){const G=project(wx,wy,gh);if(G){ctx.strokeStyle='#3a3f58';ctx.lineWidth=Math.max(1,P.s*.12);ctx.beginPath();ctx.moveTo(P.X,P.Y);ctx.lineTo(G.X,G.Y);ctx.stroke()}}
   prev=P}
 }
 railsDrawn=n}

