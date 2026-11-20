// window.Gresca: the test and debug façade.
// ---- test and debug façade ----
// window.Gresca is the one stable way for tests (and a debugging console) to read and drive the game. Tests never
// name the globals above, so game state can move into objects or modules later by re-pointing this section only.
// Units: metres (m), seconds (s), m/s and radians (rad). Map axes: +x across the map, +y down the run.
// Everything it returns is a copy: changing a returned value changes nothing in the game. Write with set().
// It adds no top-level names of its own, and nothing in the game calls it.
// TODO(B2): add Gresca.events (land, crash, grind start and end, score) once the simulation emits events.
window.Gresca=(()=>{
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
   size:Object.freeze({x:W0,y:H0}), // m, map extent (one height cell per metre)
   finishY:FIN,                    // m, the finish line
   centre:y=>cx(y),                // m, x of the piste centreline at y
   height:(px,py)=>H[(py|0)*W0+(px|0)], // m, terrain altitude of the cell containing (px,py), kicker ramps included
   groomed:(px,py)=>M[(py|0)*W0+(px|0)], // 0..255, how groomed the piste is in that cell (255 = groomed)
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
   renderPixels:()=>lx.getImageData(0,0,lo.width,lo.height).data, // RGBA of the last low-res terrain render
   colourAt:(px,py)=>{const o=((py|0)*W0+(px|0))*4;return[col[o],col[o+1],col[o+2],col[o+3]]}, // live colour map (with tracks)
   baseColourAt:(px,py)=>{const o=((py|0)*W0+(px|0))*4;return[col0[o],col0[o+1],col0[o+2],col0[o+3]]}, // as built
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
