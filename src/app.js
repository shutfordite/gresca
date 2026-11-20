// TEMPORARY (B2a, removed later in this PR): the former classic scripts, unchanged, inside createGame(env) so that
// their top-level names are per-game locals rather than page globals. Later commits move them into layer modules.
import { W0, H0, FIN, KICK, KBIG, RAILS, cx, bump } from './world/course.js';
import { fbm } from './world/noise.js';
import { createWorld, buildWorld } from './world/build.js';
import { paintColourMap } from './view/colour-map.js';

/** Builds one independent game from env (browser dependencies); returns its window.Gresca façade. */
export function createGame(env) {
const document = env.document;
const HANGA = env.HANGA;
const RiderAnim = env.RiderAnim;
const setTimeout = (fn, ms) => env.setTimeout(fn, ms);
const requestAnimationFrame = (fn) => env.requestAnimationFrame(fn);
const addEventListener = (type, fn) => env.window.addEventListener(type, fn);
// read at each use, as the globals were: the pixel ratio can change, and touching storage can throw
const env_ = env;
const world=createWorld();
const {H,M,trees,treeArr,terrain}=world;
const map=document.createElement('canvas');map.width=W0;map.height=H0;
const mx=map.getContext('2d');
// ==== formerly src/dom.js ====
// Page elements: $(), the game canvas and its 2D context, HUD and menu elements, canvas resize.
const $=id=>document.getElementById(id);
const cv=$('c'),ctx=cv.getContext('2d');
const msg=$('msg'),msgT=$('t'),go=$('go'),scoreEl=$('score'),info=$('info'),pop=$('pop'),dot=$('dot'),gl=$('gl'),gr=$('gr'),pb=$('pb'),ps=$('ps');
let W,Hh;
function resize(){const d=Math.min(2,env_.devicePixelRatio||1);cv.width=cv.clientWidth*d;cv.height=cv.clientHeight*d;W=cv.width;Hh=cv.height}
addEventListener('resize',resize);resize();

// ==== formerly src/camera.js ====
// Camera constants and state (cam), fog, the sky gradient and sun disc, partial slope-follow tilt; the colour map globals.
// Camera: behind and well above the rider, looking steeply down the slope.
const FOV=1.15,NS=152,CAMBACK=10,CAMH=7.6,HZ=.14,RSC=.55;
// Hanga Dawn look (spec terrain.fog, sky, maps[id].sun). MAP_ID picks the map's sun and gradient.
const MAP_ID='procedural',FOG=HANGA.terrain.fog.rgb.slice(),
 FAR=(()=>{let z=3;for(let k=0;k<NS-1;k++)z+=1+z*.012;return z})(), // distance of the last terrain sample
 fogAt=z=>HANGA.fogAmount(z,FAR);
// Camera heading in compass degrees. Procedural map: world x = game x, world y = -game y.
function camCompass(){return((Math.atan2(Math.cos(camA),-Math.sin(camA))*180/Math.PI)%360+360)%360}
// Sun disc on screen: at the map's sun azimuth, a little above the horizon line (spec sky.sun).
function sunDisc(){
 const S=HANGA.sky.sun,az=HANGA.maps[MAP_ID].sun.azimuthDeg,rel=((az-camCompass()+540)%360-180)*Math.PI/180,
 r=W*S.radiusFracOfWidth,X=(rel/FOV+.5)*W,Y=(cam.hz-cam.pt)*cam.kx-S.aboveHorizonFrac*Hh;
 return{X,Y,r,on:Math.abs(rel)<Math.PI/2&&X>-r&&X<W+r&&Y>-r}}
function drawSky(){
 const hy=Math.max(1,(cam.hz-cam.pt)*cam.kx),sg=ctx.createLinearGradient(0,0,0,hy);
 for(const [o,role] of HANGA.sky.stops)sg.addColorStop(o,HANGA.colour(role));
 ctx.fillStyle=sg;ctx.fillRect(0,0,W,Hh)}
function drawSun(){const s=sunDisc();if(!s.on)return;
 ctx.fillStyle=HANGA.colour(HANGA.sky.sun.colour);ctx.beginPath();ctx.arc(s.X,s.Y,s.r,0,7);ctx.fill()}
// cam.s is the slope ahead (metres dropped per metre). The camera height still follows it, but the view tilt
// (cam.pt = sc * tilt) follows it only partly, from cameraTilt below.
// Partial slope follow (spec camera.slopeFollow, HANGA.cameraPitch). The game's view is "full tilt": its look-down
// grows by atan(s). The spec's rule is applied as a change to that: aim at the ground lookAheadM ahead of the rider
// from a camera rel metres above them, and look down by (fullPitch - partialPitch) less. Level ground: no change.
// s: full-tilt slope (tan); rel: camera height above the rider's ground; drop: how far the ground lookAheadM ahead
// lies below the rider's. Returns the view tilt (tan). The rider clamp is applied in draw(), in screen pixels.
function cameraTilt(s,rel,drop){
 const F=HANGA.camera.slopeFollow,D=CAMBACK+F.lookAheadM,R2D=180/Math.PI,
 level=-Math.atan(rel/D)*R2D,full=-Math.atan((rel+drop)/D)*R2D,
 part=HANGA.cameraPitch(level,full,Infinity,0); // negative = looking down
 return Math.tan(Math.atan(s)-(part-full)/R2D)}
const cam={px:0,py:0,dx:0,dy:1,RW:1,RH:1,kx:1,sc:1,hz:0,s:.26,pt:0,tilt:.26};
let col,col0;

function build(){
 buildWorld(world);
 paintColourMap(mx,world);
 col=mx.getImageData(0,0,W0,H0).data;col0=col.slice();
 $('mc').getContext('2d').drawImage(map,0,0,W0,H0,0,0,42,103);
}

// ==== formerly src/sim.js ====
// Simulation state, equipment (RIGS), seeded RNG, spray particles, start() and jumps, landings and crashes.
// ---- state ----
// `a` is the direction the board points. The board is twin tip, so riding or landing with it
// pointing backwards (switch) is just as good as forwards; `rot` counts the spin in the air.
let L=0,R=0,B=0,JU=0,state='load',x,y,vx,vy,a,crash,crashes,time,spin,camA=1.57,camH=0,jz=0,jv=0,airT=0,kick=false,score=0,popT=0,popTxt='',rot=0,both=false,grind=null,grindD=0,rig='board',landN=0,landV=0;
const TAU=Math.PI*2;
// Equipment. Both are twin tip. Skis carve a little quicker and grip better; the board spins a little slower.
const RIGS={board:{turn:1,grip:5,spin:7},ski:{turn:1.12,grip:6.5,spin:8}};
// ---- seeded random numbers ----
// Everything random in the simulation draws from rnd(), never Math.random(), so a run replays exactly from its seed.
// mulberry32: 32 bits of state, uniform in [0,1). start() reseeds from rngSeed; Gresca.seed(n) changes the seed.
let rngSeed=1,rngS=1;
function reseed(){rngS=rngSeed>>>0}
function rnd(){let t=rngS=(rngS+0x6D2B79F5)|0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}
const parts=[],MAXP=160;
function emit(n,px_,py_,pz,spread,up,dvx,dvy){for(let k=0;k<n&&parts.length<MAXP;k++)parts.push({x:px_,y:py_,z:pz,vx:dvx+(rnd()-.5)*spread,vy:dvy+(rnd()-.5)*spread,vz:up*(.4+rnd()*.6),t:0,life:.45+rnd()*.4})}
function stepParts(dt){for(let k=parts.length-1;k>=0;k--){const p=parts[k];p.t+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=6*dt;p.vx*=.96;p.vy*=.96;if(p.t>p.life||p.z<-.2)parts.splice(k,1)}}

function start(){x=cx(60);y=60;vx=0;vy=2;a=Math.PI/2;crash=0;crashes=0;time=0;spin=0;score=0;popT=0;airT=0;kick=false;parts.length=0;jz=jv=JU=0;rot=0;both=false;grind=null;grindD=0;reseed();
 col.set(col0);camA=1.57;cam.s=.26;camH=terrain.height(x,60)+CAMH+cam.s*CAMBACK;state='run';msg.hidden=true;simAcc=0;ipSnap()}

function jumpStep(dt){
 if(crash>0){jz=0;jv=0;airT=0;return}
 const s=Math.hypot(vx,vy);
 if(jz>0)JU=0;
 if(jz<=0&&jv<=0){
  if(JU){jz=.01;jv=6.5;JU=0;airT=0;rot=0;kick=false}
  else{const kk=Math.abs(x-cx(y))<9&&s>4?KICK.find(k=>y>=k&&y<k+5):undefined;
   if(kk!==undefined){jz=.01;jv=(2.5+s*.3)*(KBIG.includes(kk)?1.35:1);airT=0;rot=0;kick=true}}}
 if(jz>0||jv>0){airT+=dt;jv-=15*dt;jz+=jv*dt;
  if(jz<=0){const land=jv;jz=0;jv=0;landV=-land;landN++;
   emit(12,x,y,.1,3,2.5,vx*.3,vy*.3);
   // twin tip: the board only has to line up with the direction of travel, nose first or tail first
   const dv=Math.atan2(vy,vx)-a,ax=((dv%Math.PI)+Math.PI)%Math.PI,mis=Math.min(ax,Math.PI-ax),rt=Math.round(Math.abs(rot)/Math.PI)*180;
   if(Math.hypot(vx,vy)>3&&land<-8&&mis>.6){crash=1.1;crashes++;vx=vy=0;airT=0}
   else if(airT>.35){const pts=Math.round(airT*60+(kick?20:0)+rt/180*40);score+=pts;popTxt='+'+pts+'p '+(rt?rt+' ':'')+'Air';popT=1.6}}}
}

// ==== formerly src/park.js ====
// Rails and boxes: getting onto them, grinding along them and leaving them.
// ---- rails and boxes ----
// Ride onto one on the snow, or drop onto it from the air, roughly along its length (nose or tail first).
function railCheck(){
 if(grind||crash>0||jv>0)return;
 const s=Math.hypot(vx,vy);if(s<3)return;
 for(const r of RAILS){
  if(y<r.y0-1||y>r.y1||jz>r.h+.6)continue;
  const ox=x-r.x0,oy=y-r.y0,t=ox*r.dx+oy*r.dy,perp=Math.abs(-ox*r.dy+oy*r.dx);
  if(t<-1||t>r.len-4||perp>1.5)continue;
  const phi=Math.atan2(r.dy,r.dx),wd=d=>Math.abs(Math.atan2(Math.sin(d),Math.cos(d))),bd=((a-phi)%Math.PI+Math.PI)%Math.PI;
  if(wd(Math.atan2(vy,vx)-phi)>.6||Math.min(bd,Math.PI-bd)>.6)continue;
  grind={r,t:Math.max(0,t)};grindD=0;jz=r.h;jv=0;airT=0;JU=0;emit(8,x,y,r.h,2.5,2,vx*.1,vy*.1);return}
}
function grindStep(dt){
 const r=grind.r,spd=Math.max(3,Math.hypot(vx,vy)*(1-.12*dt));
 grind.t+=spd*dt;grindD+=spd*dt;
 const t=Math.min(grind.t,r.len);
 x=r.x0+r.dx*t;y=r.y0+r.dy*t;vx=r.dx*spd;vy=r.dy*spd;jz=r.h;jv=0;
 const phi=Math.atan2(r.dy,r.dx),tgt=Math.cos(a-phi)>=0?phi:phi+Math.PI;
 a+=Math.atan2(Math.sin(tgt-a),Math.cos(tgt-a))*Math.min(1,dt*10);
 if(rnd()<.7)emit(1,x,y,r.h,1.2,1.2,0,0);
 if(JU)endGrind(true);else if(grind.t>=r.len)endGrind(false)}
function endGrind(jump){const r=grind.r,pts=Math.round(grindD*3);
 score+=pts;popTxt='+'+pts+'p '+(r.t==='box'?'Box':'Rail');popT=1.6;
 grind=null;grindD=0;jz=r.h;jv=jump?6.5:2.5;JU=0;airT=jump?0:-.6;rot=0;kick=false}

// ==== formerly src/step.js ====
// step(dt): one physics step: steering, gravity, grip, friction, braking, trees, snow tracks, the finish.
const TQ=[0,4,W0*4,W0*4+4];
// Gravity. The pull down the fall line is GRAVITY*GRAVITY_GAIN*tan(slope) in m/s², with tan(slope) = |gradient| of the
// terrain's smooth surface at the rider. On the piste's 10-20° slopes tan is within 2-7% of sin, so this is close to
// the textbook g·sin(slope) of a slider on an incline, made 1.6 times stronger on purpose for game feel (the strength
// the game has always been tuned with). Before B3 this was a bare 15.7 times a cell-by-cell central difference.
const GRAVITY=9.81,     // m/s², real gravity
 GRAVITY_GAIN=1.6,      // dimensionless, game-feel gain on gravity along the slope
 grav={gx:0,gy:0};      // m/m, reused for the terrain gradient under the rider (no allocation per step)
function step(dt){
 time+=dt;
 if(grind){grindStep(dt);return}
 const s=Math.hypot(vx,vy);let slip=0;
 if(crash>0){crash-=dt;spin+=dt*14}
 else if(jz>.05){spin=0;const da=((R?1:0)-(L?1:0))*dt*RIGS[rig].spin;a+=da;rot+=da} // in the air, left and right spin the board
 else{spin=0;a+=((R?1:0)-(L?1:0))*dt*(2.7-Math.min(s,30)*.045)*RIGS[rig].turn;a=((a%TAU)+TAU)%TAU;
  const bs=a>=Math.PI?Math.PI:0;a=bs+Math.max(.15,Math.min(Math.PI-.15,a-bs))} // on the snow, carve within forward or switch
 terrain.gradient(x,y,grav);const m=terrain.groomed(x,y);
 if(crash<=0){const air=jz>.05,gk=(air?0:(B?.3:1))*GRAVITY*GRAVITY_GAIN;vx-=grav.gx*gk*dt;vy-=grav.gy*gk*dt;
  const dx=Math.cos(a),dy=Math.sin(a),al=vx*dx+vy*dy,sx=vx-al*dx,sy=vy-al*dy,k=Math.exp(-(air?.4:(B?2.2:RIGS[rig].grip))*dt);
  slip=Math.hypot(sx,sy);
  vx=dx*al+sx*k;vy=dy*al+sy*k;
  const f=Math.max(0,1-(.0035*s+.02+(air?0:(1-m)*.18))*dt);vx*=f;vy*=f;
  if(B&&!air){const sn=Math.hypot(vx,vy);if(sn>0){const ns=Math.max(0,sn-16*dt);vx*=ns/sn;vy*=ns/sn}}}
 x+=vx*dt;y+=vy*dt;jumpStep(dt);railCheck();
 if(x<6){x=6;vx=0}if(x>terrain.bounds.maxX-6){x=terrain.bounds.maxX-6;vx=0}if(y<6){y=6;vy=0}
 if(crash<=0&&jz<1.5){const gx0=(x/6)|0,gy0=(y/6)|0;
  for(let u=-1;u<=1;u++)for(let v=-1;v<=1;v++){const T=trees.get((gx0+u)*10000+gy0+v);
   if(T&&Math.hypot(T.x-x,T.y-y)<2.4&&s>1){crash=1.1;crashes++;x-=vx*.12;y-=vy*.12;vx=vy=0}}}
 if(crash<=0&&jz<=.05){
  // deeper track in the snow, and spray when carving hard or braking. The track is a fixed depth below the snow as
  // built (col0), never compounded per step: a slow rider stays over one cell for many steps, which turned it black.
  const dk=(B||slip>3)?.8:.9,o=((y|0)*W0+(x|0))*4,dg=dk+.02,db=Math.min(1,dk+.07);
  for(const q of TQ){const i=o+q;col[i]=Math.min(col[i],col0[i]*dk);col[i+1]=Math.min(col[i+1],col0[i+1]*dg);col[i+2]=Math.min(col[i+2],col0[i+2]*db)}
  const sn=Math.hypot(vx,vy);
  if(B&&sn>3)emit(1,x,y,.15,2.2,1.6,-vx*.15,-vy*.15);
  else if(slip>4)emit(1,x,y,.15,2.2,1.4,0,0)}
 if(y>FIN){state='done';msg.hidden=false;msgT.textContent='Finished in '+time.toFixed(1)+' s with '+score+' points and '+crashes+' crash'+(crashes==1?'':'es')+'.';go.textContent='Ride again';go.hidden=false}
}

// ==== formerly src/input.js ====
// Input: touch halves and swipe, keyboard, the Drop in button.
// ---- input: hold the left or right half of the screen to turn (or spin in the air); both halves together jump; swipe down to brake ----
const ptrs=new Map(),kb={L:0,R:0,B:0},SWIPE=36;
function applyInput(){let l=kb.L,r=kb.R,b=kb.B;
 for(const p of ptrs.values()){if(p.side<0)l=1;else r=1;if(p.brake)b=1}
 if(l&&r&&!both)JU=1; // both sides pressed together = jump
 both=!!(l&&r);L=l;R=r;B=b;gl.classList.toggle('on',!!l);gr.classList.toggle('on',!!r)}
function sideOf(px){return px<cv.clientWidth/2?-1:1}
function pDown(id,px,py){ptrs.set(id,{y0:py,side:sideOf(px),brake:false});applyInput()}
function pMove(id,px,py){const p=ptrs.get(id);if(!p)return;const dy=py-p.y0;
 p.brake=dy>SWIPE;p.side=sideOf(px);applyInput()}
function pUp(id){ptrs.delete(id);applyInput()}
cv.addEventListener('pointerdown',e=>{e.preventDefault();try{cv.setPointerCapture(e.pointerId)}catch(_){}pDown(e.pointerId,e.clientX,e.clientY)});
cv.addEventListener('pointermove',e=>pMove(e.pointerId,e.clientX,e.clientY));
['pointerup','pointercancel'].forEach(n=>cv.addEventListener(n,e=>pUp(e.pointerId)));
addEventListener('keydown',e=>{const k=e.key;if(k=='ArrowLeft'||k=='a')kb.L=1;if(k=='ArrowRight'||k=='d')kb.R=1;if(k=='ArrowDown'||k=='s')kb.B=1;if(k==' '||k=='ArrowUp'||k=='w')JU=1;applyInput()});
addEventListener('keyup',e=>{const k=e.key;if(k=='ArrowLeft'||k=='a')kb.L=0;if(k=='ArrowRight'||k=='d')kb.R=0;if(k=='ArrowDown'||k=='s')kb.B=0;applyInput()});
go.addEventListener('click',start);
// ==== formerly src/menu.js ====
// The Snowboard / Skis picker and its gresca-rig storage key.
// ---- equipment picker in the menu (remembered between visits where the browser allows it) ----
function setRig(r){rig=r;pb.classList.toggle('on',r==='board');ps.classList.toggle('on',r==='ski');
 pb.setAttribute('aria-pressed',r==='board');ps.setAttribute('aria-pressed',r==='ski');
 try{env_.localStorage.setItem('gresca-rig',r)}catch(_){}}
pb.addEventListener('click',()=>setRig('board'));ps.addEventListener('click',()=>setRig('ski'));
try{const s=env_.localStorage.getItem('gresca-rig')||env_.localStorage.getItem('gv-rig');if(s==='ski'||s==='board')setRig(s)}catch(_){}

// ==== formerly src/sprites.js ====
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
 for(const k of KICK){if(k+5<cam.py||k-11>cam.py+260)continue;const big=KBIG.includes(k),c=cx(k),h=big?3.2:2.4;
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

// ==== formerly src/rider-view.js ====
// Rider animation glue (game state in, RiderAnim out) and drawRider().
// ---- rider animation: game state in, RiderAnim (art/gresca-rider-anim.js) on top of the Hanga spec ----
// Snowboard stance from the menu (spec rider.stance). Goofy mirrors the rig; the board stays twin tip.
let stance='regular';
try{if(env_.localStorage.getItem(HANGA.rider.stance.storageKey)==='goofy')stance='goofy'}catch(_){}
let anim=null,animPrev=null,riderList=null,riderYaw=0;
// Everything the animation needs from the game, measured once per drawn frame.
function animInput(dt){
 const x=drawn.x,y=drawn.y,jz=drawn.z; // the drawn rider pose (interpolated), not the simulation's
 const s=Math.hypot(vx,vy),air=!grind&&jz>.05,dir=s>.5?Math.atan2(vy,vx):a,g=terrain.height(x,y); // ground under the feet, smooth between cells
 let p=animPrev;
 if(!p||Math.hypot(x-p.x,y-p.y)>8)p=animPrev={x,y,dir,g,gv:0,ga:0,n:landN,air:true}; // first frame, or the run restarted
 const k=dt>0?Math.min(1,dt/.05):0,wr=d=>Math.atan2(Math.sin(d),Math.cos(d));
 // Vertical speed and acceleration of the ground under the feet, low-passed over about 50 ms.
 // The first frame back on the snow only seeds the speed: the landing itself comes in through `impact`.
 let gv=0,ga=0;
 if(dt>0&&!air){const v=(g-p.g)/dt;if(p.air)gv=v;else{gv=p.gv+(v-p.gv)*k;ga=p.ga+((gv-p.gv)/dt-p.ga)*k}}
 const turn=dt>0&&s>1&&!air?wr(dir-p.dir)/dt:0;
 // The rider's facing: the board heading, turned round for goofy because the spec mirrors that rig in z.
 const aR=a+(rig==='board'&&stance==='goofy'?Math.PI:0),side=Math.cos(aR-dir)>=0?1:-1;
 const landed=landN!==p.n&&!air&&crash<=0;
 animPrev={x,y,dir,g,gv,ga,n:landN,air:air||!!grind};
 riderYaw=wr(aR-camA)*180/Math.PI;
 return{wiped:crash>0,grinding:!!grind,airborne:air,braking:!!B,landed,impact:landV,speed:s,pathTurn:turn,riderSide:side,
  approach:!air&&s>4&&Math.abs(x-cx(y))<9&&KICK.some(k=>y>=k-14&&y<k),
  feetAccelUp:ga,slopeDeg:terrain.slopeDeg(x,y),meanSlopeDeg:HANGA.maps.procedural.meanSlopeDeg}}
function animTick(dt){
 const r=rig==='ski'?'ski':'board';
 if(!anim||anim.rig!==r){anim=RiderAnim.create(r);animPrev=null}
 RiderAnim.update(anim,animInput(dt),dt);
 riderList=RiderAnim.project(anim,riderYaw,null,stance);
 return riderList}

// Hanga Dawn rider: the draw list from HANGA.projectRider, in metres with +y up, scaled by m pixels per metre.
// Each item is outlined in the key colour, then filled (spec section 3: keyline 0.012 m, never under 1 px).
function drawRider(c,m,list){
 const K=HANGA.colour('key'),kl=Math.max(1,HANGA.rider.widths.keyline*m),col=r=>HANGA.colour(r);
 const path=pts=>{c.beginPath();c.moveTo(pts[0][0]*m,-pts[0][1]*m);for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0]*m,-pts[i][1]*m)};
 const stroke=(pts,w,colour,outline)=>{path(pts);c.lineCap=c.lineJoin='round';
  if(outline){c.strokeStyle=K;c.lineWidth=w*m+2*kl;c.stroke()}c.strokeStyle=col(colour);c.lineWidth=Math.max(1,w*m);c.stroke()};
 const dot=(p,r,colour)=>{c.fillStyle=K;c.beginPath();c.arc(p[0]*m,-p[1]*m,r*m+kl,0,7);c.fill();
  c.fillStyle=col(colour);c.beginPath();c.arc(p[0]*m,-p[1]*m,r*m,0,7);c.fill()};
 for(const it of list){
  if(it.kind==='ellipse')continue; // the shadow is drawn on the ground by the caller
  if(it.kind==='equip'){for(const sh of it.shapes){
    if(sh.kind==='line'){stroke(sh.pts,sh.width,sh.colour,false);continue}
    path(sh.pts);c.closePath();c.fillStyle=col(sh.colour);c.fill();
    if(sh.keyline){c.strokeStyle=K;c.lineWidth=kl;c.lineJoin='round';c.stroke()}}continue}
  if(it.kind==='circle'||it.kind==='head'){dot(it.pts[0],it.width,it.colour);
   if(it.goggles){stroke(it.goggles.frame.pts,it.goggles.frame.width,it.goggles.frame.colour,false);stroke(it.goggles.lens.pts,it.goggles.lens.width,it.goggles.lens.colour,false)}
   if(it.strap)stroke(it.strap.pts,it.strap.width,it.strap.colour,false);continue}
  stroke(it.pts,it.width,it.colour,true)} // limb, torso and boot capsules
}

// ==== formerly src/draw.js ====
// draw(): camera follow, terrain raycast, sky and sun, trees, rails, flags, spray, the rider, the HUD.
const RAY_EXACT_M=40; // m, the raycaster samples the exact terrain surface this close to the camera, the fast path beyond
// dt: s since the last drawn frame (camera smoothing and animation). alpha: 0..1, how far the shown rider is from the
// step before the latest one to the latest one (see the fixed timestep below); 1, the default, shows the current state.
function draw(dt,alpha=1){
 riderPose(alpha);
 const x=drawn.x,y=drawn.y,jz=drawn.z; // the rider as drawn; draw() reads the simulation but never writes it
 const RW=Math.min(360,Math.round(cv.clientWidth/1.6)),RH=Math.round(RW*Hh/W);
 if(lo.width!==RW||lo.height!==RH){lo.width=RW;lo.height=RH}
 // The camera follows the direction of travel, not the nose: when riding switch it still looks down the
 // slope, and it ignores the board while it spins in the air.
 const back=vx*Math.cos(a)+vy*Math.sin(a)<-1.5,tgt=jz>.05?(Math.hypot(vx,vy)>1.5?Math.atan2(vy,vx):camA):(back?a+Math.PI:a),
 dT=Math.atan2(Math.sin(tgt-camA),Math.cos(tgt-camA));
 camA+=dT*Math.min(1,dt*3.2);
 // Ground heights from the terrain's smooth surface (it clamps to the map edge): under the rider, under the camera,
 // and 20 m ahead (the slope the camera height follows).
 const dx=Math.cos(camA),dy=Math.sin(camA),px=x-dx*CAMBACK,py=y-dy*CAMBACK,gR=terrain.height(x,y);
 cam.s+=(Math.max(-.3,Math.min(.8,(gR-terrain.height(x+dx*20,y+dy*20))/20))-cam.s)*Math.min(1,dt*3);
 camH+=(Math.max(gR+CAMH+cam.s*CAMBACK+jz*.5,terrain.height(px,py)+2.5)-camH)*Math.min(1,dt*6);
 const hz=RH*HZ,sc=RH*.75,kx=W/RW,im=lx.createImageData(RW,RH),D=im.data;
 // View tilt: partial slope follow, then clamp so the rider stays riderMarginDeg inside the bottom of the frame.
 const LA=HANGA.camera.slopeFollow.lookAheadM,
 yMax=RH-sc*Math.tan(HANGA.camera.slopeFollow.riderMarginDeg*Math.PI/180),
 tilt=Math.max(cameraTilt(cam.s,camH-gR,gR-terrain.height(x+dx*LA,y+dy*LA)),((camH-gR)/CAMBACK*sc+hz-yMax)/sc);
 cam.tilt=tilt;
 cam.px=px;cam.py=py;cam.dx=dx;cam.dy=dy;cam.RW=RW;cam.RH=RH;cam.kx=kx;cam.sc=sc;cam.hz=hz;cam.pt=sc*tilt;
 // Terrain raycast. Within RAY_EXACT_M of the camera the heights are terrain.height, the same surface the rider and
 // physics use, so the board sits on the snow you see (docs/REAL-WORLD-DATA.md 3b). Further out they come from
 // terrain.heightFast, its documented fast path (bilinear: on the groomed piste within about 3 cm of height for 99% of
 // points and 12 cm at worst, at a big kicker's lip; test/terrain.test.js). Colours come from the colour map col, CW cells
 // wide (the same grid as the procedural terrain's base layer).
 const TB=terrain.bounds,X1=TB.maxX-2,Y1=TB.maxY-2,CW=map.width,CW4=CW*4;
 for(let c=0;c<RW;c++){
  const ph=(c/RW-.5)*FOV,cs=Math.cos(ph),rx=Math.cos(camA+ph),ry=Math.sin(camA+ph);
  let ym=RH,z=3;
  for(let k=0;k<NS;k++){
   const xx=px+rx*z,yy=py+ry*z;occ[c*NS+k]=ym;
   if(xx>=1&&xx<X1&&yy>=1&&yy<Y1){
    const ix=xx|0,iy=yy|0,fx=xx-ix,fy=yy-iy,mi=iy*CW+ix,
    h=z<RAY_EXACT_M?terrain.height(xx,yy):terrain.heightFast(xx,yy),
    ys=Math.floor((camH-h)/(z*cs)*sc+hz-cam.pt);
    if(ys<ym){const o4=mi*4,f=fogAt(z);let c0=col[o4],c1=col[o4+1],c2=col[o4+2];
     if(z<80){const o1=o4+CW4,w00=(1-fx)*(1-fy),w10=fx*(1-fy),w01=(1-fx)*fy,w11=fx*fy;
      c0=c0*w00+col[o4+4]*w10+col[o1]*w01+col[o1+4]*w11;c1=c1*w00+col[o4+5]*w10+col[o1+1]*w01+col[o1+5]*w11;c2=c2*w00+col[o4+6]*w10+col[o1+2]*w01+col[o1+6]*w11}
     const r=c0+(FOG[0]-c0)*f,g=c1+(FOG[1]-c1)*f,b=c2+(FOG[2]-c2)*f;
     for(let q=Math.max(0,ys);q<ym;q++){const o=(q*RW+c)*4;D[o]=r;D[o+1]=g;D[o+2]=b;D[o+3]=255}
     ym=Math.max(0,ys)}}
   z+=1+z*.012}
 }
 lx.putImageData(im,0,0);
 drawSky();drawSun(); // behind the terrain: transparent render pixels show the sky, and ridges cover the sun
 ctx.imageSmoothingEnabled=true;ctx.drawImage(lo,0,0,W,Hh);
 // trees, far to near, hidden when a nearer ridge covers them
 const vis=[];
 for(const T of treeArr){
  const f=(T.x-cam.px)*cam.dx+(T.y-cam.py)*cam.dy;if(f<3||f>300)continue; // project() would drop it anyway: skip the height lookup
  const P=project(T.x,T.y,terrain.height(T.x,T.y));if(!P||P.f>300)continue;vis.push({P})}
 vis.sort((u,v)=>v.P.f-u.P.f);
 for(const {P} of vis){
  const ci=Math.min(RW-1,Math.max(0,(P.X/kx)|0)),k=Math.max(0,Math.min(NS-1,Math.floor(Math.log((P.z+83.33)/86.33)/Math.log(1.012)))),
  ysb=P.Y/kx,hs=9/P.f*sc;
  if(occ[ci*NS+k]<ysb-hs*.6)continue;
  const fg=fogAt(P.z),X=P.X,Y=P.Y,hh=hs*kx;
  ctx.fillStyle=`rgb(${(31+(FOG[0]-31)*fg)|0},${(74+(FOG[1]-74)*fg)|0},${(58+(FOG[2]-58)*fg)|0})`;
  for(let j=0;j<3;j++){const by=Y-hh*(.12+.27*j),w=hh*(.34-.07*j);ctx.beginPath();ctx.moveTo(X-w,by);ctx.lineTo(X+w,by);ctx.lineTo(X,by-hh*.42);ctx.fill()}
 }
 drawRails();drawFlags();
 // snow spray
 for(const p of parts){const P=project(p.x,p.y,terrain.height(p.x,p.y)+p.z);if(!P)continue;
  const k=p.t/p.life;ctx.fillStyle='rgba(246,248,255,'+(.8*(1-k)).toFixed(2)+')';ctx.beginPath();ctx.arc(P.X,P.Y,Math.max(1,P.s*(.2+.5*k)),0,7);ctx.fill()}
 // rider: small, in the lower third
 const mf=sc/CAMBACK*kx,m=mf*RSC,list=animTick(dt),shd=list[0],ss=1/(1+jz*.25);
 ctx.save();ctx.translate(W/2,((camH-gR)/CAMBACK*sc+hz-cam.pt)*kx);
 ctx.globalAlpha=.55;ctx.fillStyle=HANGA.colour(shd.colour);ctx.beginPath();ctx.ellipse(shd.c[0]*m,-shd.c[1]*m,shd.rx*m*ss,shd.ry*m*ss,0,0,7);ctx.fill();ctx.globalAlpha=1;
 ctx.translate(0,-jz*mf);
 if(crash>0){ctx.translate(0,-.9*m);ctx.rotate(spin);ctx.translate(0,.9*m)}
 drawRider(ctx,m,list);
 ctx.restore();
 // compact HUD
 const sp=Math.hypot(vx,vy);
 scoreEl.textContent=score;
 info.textContent=Math.round(sp*3.6)+' km/h · '+Math.max(0,Math.round(FIN-y))+' m to go';
 pop.textContent=popTxt;pop.style.opacity=Math.min(1,popT*2);
 dot.style.left=x/TB.maxX*42+'px';dot.style.top=y/TB.maxY*103+'px'}

// ==== formerly src/app.js ====
// Fixed 120 Hz timestep with interpolation, the frame loop, and start-up (build, then the menu).
// ---- fixed timestep ----
// The simulation always advances in steps of SIM_DT, whatever the display's frame rate, so jumps, landings, crashes and
// grinds come out the same at 30, 60, 120 or 144 Hz. Each frame adds its real duration to simAcc and runs as many whole
// steps as fit, at most SIM_MAX in one frame; after a longer stall (background tab, slow device, GC pause) the rest is
// dropped, so the game slows down rather than spiralling. draw() shows the rider interpolated between the last two
// steps by the leftover fraction (alpha), so motion stays smooth when frames and steps don't line up.
const SIM_DT=1/120, // s, one simulation step (120 Hz)
 SIM_MAX=8,         // steps, the most run in one frame (8/120 s = 67 ms of simulation)
 SIM_EPS=1e-9;      // s, slack so frame times that are exact multiples of SIM_DT don't lose a step to rounding
let simAcc=0,        // s of real time not yet simulated
 ipX=0,ipY=0,ipZ=0;  // m, rider x, y and height above the ground before the latest step (where interpolation starts)
// The rider pose the view shows: m, m, m above the ground, and the alpha it was blended with. View state, not sim state.
const drawn={x:0,y:0,z:0,alpha:1};
function ipSnap(){ipX=x;ipY=y;ipZ=jz} // no interpolation across a teleport (new run, place)
function riderPose(alpha){
 // alpha 1, or a jump no step could make (more than 8 m), shows the current state as it is
 if(alpha>=1||Math.abs(x-ipX)+Math.abs(y-ipY)>8){drawn.x=x;drawn.y=y;drawn.z=jz;drawn.alpha=1;return}
 drawn.x=ipX+(x-ipX)*alpha;drawn.y=ipY+(y-ipY)*alpha;drawn.z=ipZ+(jz-ipZ)*alpha;drawn.alpha=alpha}
// One simulation step: physics, spray and the popup timer.
function simTick(){ipX=x;ipY=y;ipZ=jz;step(SIM_DT);stepParts(SIM_DT);popT=Math.max(0,popT-SIM_DT)}
let last=0;
function loop(ts){const dt=Math.max(0,(ts-last)/1000||0);last=ts;let alpha=1;
 if(state==='run'){simAcc+=dt;let n=0;
  while(state==='run'&&n<SIM_MAX&&simAcc>=SIM_DT-SIM_EPS){simTick();simAcc-=SIM_DT;n++}
  if(state!=='run'||simAcc>=SIM_DT)simAcc=0; // run ended, or a stall longer than SIM_MAX steps: drop the rest
  simAcc=Math.max(0,simAcc);
  if(state==='run')alpha=simAcc/SIM_DT}
 else simAcc=0;
 // the camera and animation get the real frame time, capped like the simulation
 if(state!=='load')draw(Math.min(dt,SIM_MAX*SIM_DT),alpha);requestAnimationFrame(loop)}
setTimeout(()=>{build();state='ready';x=cx(60);y=60;vx=vy=0;a=1.57;crash=0;crashes=0;time=0;spin=0;camA=1.57;camH=terrain.height(x,60)+CAMH;
 msgT.textContent='Ride from the Encampadors ridge down to Pas de la Casa. Hold the left or right side of the screen to turn. Press both sides together to jump, then tap left or right in the air to spin. Swipe down to brake. Avoid the trees.';go.hidden=false},60);
requestAnimationFrame(loop);

// ==== formerly src/debug.js ====
// window.Gresca: the test and debug façade.
// ---- test and debug façade ----
// window.Gresca is the one stable way for tests (and a debugging console) to read and drive the game. Tests never
// name the globals above, so game state can move into objects or modules later by re-pointing this section only.
// Units: metres (m), seconds (s), m/s and radians (rad). Map axes: +x across the map, +y down the run.
// Everything it returns is a copy: changing a returned value changes nothing in the game. Write with set().
// It adds no top-level names of its own, and nothing in the game calls it.
// TODO(B2): add Gresca.events (land, crash, grind start and end, score) once the simulation emits events.
const Gresca=(()=>{
 const camSnap=()=>({
  heading:camA,      // rad, direction the camera looks along the ground (same convention as the rider heading)
  height:camH,       // m, camera altitude (absolute, same datum as world.height)
  x:cam.px,y:cam.py, // m, camera position on the map, CAMBACK behind the rider
  dirX:cam.dx,dirY:cam.dy, // unit view direction on the map
  slope:cam.s,       // smoothed slope ahead, metres dropped per metre (full-tilt tan)
  tilt:cam.tilt,     // view tilt (tan) after partial slope follow and the rider clamp
  pitchPx:cam.pt,    // view tilt in low-res render pixels (focalPx * tilt)
  focalPx:cam.sc,    // low-res render pixels per unit of (height / distance)
  horizonPx:cam.hz,  // untilted horizon row, low-res render pixels from the top
  renderW:cam.RW,renderH:cam.RH, // low-res terrain render size, pixels
  pixelScale:cam.kx  // screen canvas pixels per low-res render pixel
 });
 const snapshot=()=>({
  phase:state, // 'load' | 'ready' | 'run' | 'done'
  x,y,                // m, rider position on the map
  vx,vy,              // m/s, rider velocity on the map
  speed:Math.hypot(vx,vy), // m/s, read only
  heading:a,          // rad, direction the board points; twin tip, so heading + PI is the same board ridden switch
  z:jz,               // m above the ground (0 on the snow, the rail height while grinding)
  vz:jv,              // m/s, vertical speed (+ up)
  airTime:airT,       // s in the air this jump (briefly negative after dropping off the end of a rail)
  rotation:rot,       // rad turned in the air this jump (+ right, - left)
  fromKicker:kick,    // true when this jump was launched by a kicker
  crashTimer:crash,   // s of wipeout left; the rider is crashed while this is > 0
  crashed:crash>0,    // read only
  wipeoutSpin:spin,   // rad, tumble angle while crashed
  crashes,            // count this run
  score,              // points this run
  time,               // s since the drop
  grinding:!!grind,   // read only
  grind:grind?{rail:RAILS.indexOf(grind.r),t:grind.t,dist:grindD}:null, // rail index into world.rails, m along it, m ground so far
  landings:landN,     // count of touchdowns since the page loaded
  landingSpeed:landV, // m/s downward at the last touchdown
  rig,                // 'board' | 'ski' (set() writes the variable only: no menu, no storage)
  stance,             // 'regular' | 'goofy'
  particles:parts.length, // live spray particles, read only (see clearParticles, emitParticles)
  popup:{text:popTxt,t:popT}, // trick popup text, s left on screen
  input:{left:L,right:R,brake:B,jump:JU}, // 0 or 1; jump is a one-shot request the physics clears
  camera:camSnap()
 });
 const READ_ONLY=new Set(['speed','crashed','grinding','particles']);
 const nested=(name,w)=>v=>{for(const k in v){if(!(k in w))throw new Error('Gresca.set: unknown field '+name+'.'+k);w[k](v[k])}};
 const WRITE={
  phase:v=>{state=v},x:v=>{x=v},y:v=>{y=v},vx:v=>{vx=v},vy:v=>{vy=v},heading:v=>{a=v},z:v=>{jz=v},vz:v=>{jv=v},
  airTime:v=>{airT=v},rotation:v=>{rot=v},fromKicker:v=>{kick=v},crashTimer:v=>{crash=v},wipeoutSpin:v=>{spin=v},
  crashes:v=>{crashes=v},score:v=>{score=v},time:v=>{time=v},landings:v=>{landN=v},landingSpeed:v=>{landV=v},
  rig:v=>{rig=v},stance:v=>{stance=v},
  grind:v=>{if(v===null){grind=null;return}grind={r:RAILS[v.rail],t:v.t};if('dist' in v)grindD=v.dist},
  popup:nested('popup',{text:v=>{popTxt=v},t:v=>{popT=v}}),
  input:nested('input',{left:v=>{L=v?1:0},right:v=>{R=v?1:0},brake:v=>{B=v?1:0},jump:v=>{JU=v?1:0}}),
  camera:nested('camera',{heading:v=>{camA=v},height:v=>{camH=v},x:v=>{cam.px=v},y:v=>{cam.py=v},dirX:v=>{cam.dx=v},dirY:v=>{cam.dy=v},
   slope:v=>{cam.s=v},tilt:v=>{cam.tilt=v},pitchPx:v=>{cam.pt=v},focalPx:v=>{cam.sc=v},horizonPx:v=>{cam.hz=v},
   renderW:v=>{cam.RW=v},renderH:v=>{cam.RH=v},pixelScale:v=>{cam.kx=v}})
 };
 // Write any of the fields state() reports, by the same names. Read-only fields are ignored, so a snapshot can be
 // written back whole; an unknown name throws.
 function set(p){for(const k in p){if(READ_ONLY.has(k))continue;if(!WRITE[k])throw new Error('Gresca.set: unknown field '+k);WRITE[k](p[k])}}
 const PLACE={x:null,y:500,vx:0,vy:0,heading:Math.PI/2,z:0,vz:0};
 return Object.freeze({
  state:snapshot,set,
  // New run (start()), then put the rider at {x,y,vx,vy,heading,z,vz}: defaults y 500 (the empty practice
  // stretch), x on the piste centreline, at rest, heading straight down. Clears crashes and all input.
  place(o={}){for(const k in o)if(!(k in PLACE))throw new Error('Gresca.place: unknown field '+k);
   const d=Object.assign({},PLACE,o);
   start();x=d.x===null?cx(d.y):d.x;y=d.y;vx=d.vx;vy=d.vy;a=d.heading;jz=d.z;jv=d.vz;crash=0;crashes=0;B=0;L=0;R=0;JU=0;ipSnap()},
  // The seed of the simulation's random numbers (spray today). seed(n) sets it and reseeds now; every start() (and so
  // place()) reseeds from it, so the same seed and the same input give the same run. Returns the seed. Default 1.
  seed(n){if(n!==undefined){rngSeed=n>>>0;reseed()}return rngSeed},
  // Advance the simulation sec seconds at a fixed timestep dt (physics, then spray, each step).
  // The real game loop steps at config.fixedStep (1/120 s) with the popup timer too; drive it with requestAnimationFrame.
  sim(sec,dt=1/120){const n=Math.round(sec/dt);for(let i=0;i<n;i++){step(dt);stepParts(dt)}},
  step(dt){step(dt)},               // one physics step only
  stepParticles(dt){stepParts(dt)}, // one spray step only
  frame(dt){draw(dt)},              // draw one frame (camera, terrain, rider, HUD), dt in s
  start(){start()},                 // what the Drop in button does
  input(o){set({input:o})},         // {left,right,brake,jump}, any subset; bypasses touch and keyboard
  resetInput(){ptrs.clear();kb.L=kb.R=kb.B=0;L=R=B=JU=0;both=false}, // lift every finger and key
  clearParticles(){parts.length=0},
  particles(){return parts.map(p=>({x:p.x,y:p.y,z:p.z,vx:p.vx,vy:p.vy,vz:p.vz,t:p.t,life:p.life}))}, // copies of the live spray: m, m/s, s
  emitParticles(n,px,py,pz,spread,up,dvx,dvy){emit(n,px,py,pz,spread,up,dvx,dvy)}, // m, m, m, m/s, m/s, m/s, m/s
  config:Object.freeze({maxParticles:MAXP,camBack:CAMBACK,riderScale:RSC,fixedStep:SIM_DT,maxStepsPerFrame:SIM_MAX}), // particle cap; camera m behind the rider; rider draw scale; s per simulation step; steps the loop runs per frame at most
  world:Object.freeze({
   size:Object.freeze({x:terrain.bounds.maxX,y:terrain.bounds.maxY}), // m, map extent (one height cell per metre)
   finishY:FIN,                    // m, the finish line
   centre:y=>cx(y),                // m, x of the piste centreline at y
   // The terrain (src/terrain.js) the physics, camera, renderer and rider all sample, kicker ramps included.
   height:(px,py)=>terrain.height(px,py),      // m, altitude of the smooth (bicubic) surface at (px,py)
   cellHeight:(px,py)=>terrain.cellHeight(px,py), // m, raw height of the cell containing (px,py) (before B3: height)
   gradient:(px,py)=>{const o=terrain.gradient(px,py);return{gx:o.gx,gy:o.gy}}, // m/m, rise per metre in +x and +y
   slopeDeg:(px,py)=>terrain.slopeDeg(px,py),  // degrees from horizontal at (px,py)
   layers:terrain.layers,                      // the terrain layers in use, in stack order (frozen)
   groomed:(px,py)=>Math.round(terrain.groomed(px,py)*255), // 0..255, how groomed the piste is in that cell (255 = groomed)
   noise:(px,py)=>fbm(px,py),      // 0..1, the terrain's fractal noise
   rampHeight:(px,py)=>bump(px,py),// m, kicker ramp height added at (px,py)
   get kickers(){return KICK.slice()},       // y of each kicker lip, top to bottom
   get bigKickers(){return [...KBIG]},       // the subset of kickers that are big
   get rails(){return RAILS.map(r=>({...r}))}, // {y0,y1,x0,x1,len,dx,dy,h,t:'rail'|'box'}
   get trees(){return treeArr.map(T=>({x:T.x,y:T.y}))}
  }),
  // Render internals, for tests of the look. Not game state: expect these to change with the renderer.
  debug:Object.freeze({
   drawn:()=>({rails:railsDrawn,flags:flagsDrawn}), // segments of rail and flags drawn last frame
   project:(wx,wy,h)=>{const P=project(wx,wy,h);return P&&{...P}}, // screen position of a map point, or null
   cameraTilt:(s,rel,drop)=>cameraTilt(s,rel,drop),
   camCompass:()=>camCompass(),   // camera heading, compass degrees
   sunDisc:()=>({...sunDisc()}),  // {X,Y,r,on}, canvas pixels
   screen:()=>({width:W,height:Hh}), // canvas pixels
   mapId:MAP_ID,
   fog:()=>({rgb:FOG.slice(),far:FAR,samples:NS}), // fog colour, distance of the last terrain sample (m), samples per column
   fogAt:z=>fogAt(z),
   heightFast:(px,py)=>terrain.heightFast(px,py), // m, the raycaster's fast terrain height (bilinear; see terrain.js)
   renderPixels:()=>lx.getImageData(0,0,lo.width,lo.height).data, // RGBA of the last low-res terrain render
   colourAt:(px,py)=>{const o=((py|0)*map.width+(px|0))*4;return[col[o],col[o+1],col[o+2],col[o+3]]}, // live colour map (with tracks)
   baseColourAt:(px,py)=>{const o=((py|0)*map.width+(px|0))*4;return[col0[o],col0[o+1],col0[o+2],col0[o+3]]}, // as built
   fillColourMap:v=>{col.fill(v)}, // until the next start()
   anim:()=>anim&&{rig:anim.rig,pose:anim.pose,comp:anim.comp,roll:anim.roll},
   animTick:dt=>{riderPose(1);animTick(dt)}, // advance the rider animation one frame without drawing (current pose)
   // The rider pose the last frame drew (m; z above the ground), the alpha it was blended with, and the physics state
   // before the latest step it was blended from (the current state is the other end).
   view:()=>({x:drawn.x,y:drawn.y,z:drawn.z,alpha:drawn.alpha,from:{x:ipX,y:ipY,z:ipZ}}),
   riderList:()=>riderList&&JSON.parse(JSON.stringify(riderList)), // last rider draw list
   riderYaw:()=>riderYaw          // deg, rider facing relative to the camera
  })
 });
})();
return Gresca;
}
