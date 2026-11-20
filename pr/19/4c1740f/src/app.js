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

