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
 col.set(col0);camA=1.57;cam.s=.26;camH=H[60*W0+(x|0)]+CAMH+cam.s*CAMBACK;state='run';msg.hidden=true;simAcc=0;ipSnap()}

function jumpStep(dt){
 if(crash>0){jz=0;jv=0;airT=0;return}
 const s=Math.hypot(vx,vy);
 if(jz>0)JU=0;
 if(jz<=0&&jv<=0){
  if(JU){jz=.01;jv=6.5;JU=0;airT=0;rot=0;kick=false}
  else{const kk=Math.abs(x-cx(y))<9&&s>4?KICK.find(k=>y>=k&&y<k+5):undefined;
   if(kk!==undefined){jz=.01;jv=(2.5+s*.3)*(KBIG.has(kk)?1.35:1);airT=0;rot=0;kick=true}}}
 if(jz>0||jv>0){airT+=dt;jv-=15*dt;jz+=jv*dt;
  if(jz<=0){const land=jv;jz=0;jv=0;landV=-land;landN++;
   emit(12,x,y,.1,3,2.5,vx*.3,vy*.3);
   // twin tip: the board only has to line up with the direction of travel, nose first or tail first
   const dv=Math.atan2(vy,vx)-a,ax=((dv%Math.PI)+Math.PI)%Math.PI,mis=Math.min(ax,Math.PI-ax),rt=Math.round(Math.abs(rot)/Math.PI)*180;
   if(Math.hypot(vx,vy)>3&&land<-8&&mis>.6){crash=1.1;crashes++;vx=vy=0;airT=0}
   else if(airT>.35){const pts=Math.round(airT*60+(kick?20:0)+rt/180*40);score+=pts;popTxt='+'+pts+'p '+(rt?rt+' ':'')+'Air';popT=1.6}}}
}

