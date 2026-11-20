// Rider animation glue (game state in, RiderAnim out) and drawRider().
// ---- rider animation: game state in, RiderAnim (art/gresca-rider-anim.js) on top of the Hanga spec ----
// Snowboard stance from the menu (spec rider.stance). Goofy mirrors the rig; the board stays twin tip.
let stance='regular';
try{if(localStorage.getItem(HANGA.rider.stance.storageKey)==='goofy')stance='goofy'}catch(_){}
let anim=null,animPrev=null,riderList=null,riderYaw=0;
// Ground height between cells, so the feet feel the terrain smoothly rather than in 1 m steps.
function hAt(px,py){const ix=Math.max(0,Math.min(W0-2,px|0)),iy=Math.max(0,Math.min(H0-2,py|0)),fx=px-ix,fy=py-iy,i=iy*W0+ix;
 return H[i]*(1-fx)*(1-fy)+H[i+1]*fx*(1-fy)+H[i+W0]*(1-fx)*fy+H[i+W0+1]*fx*fy}
// Everything the animation needs from the game, measured once per drawn frame.
function animInput(dt){
 const x=drawn.x,y=drawn.y,jz=drawn.z; // the drawn rider pose (interpolated), not the simulation's
 const s=Math.hypot(vx,vy),air=!grind&&jz>.05,dir=s>.5?Math.atan2(vy,vx):a,g=hAt(x,y);
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
 const i=(y|0)*W0+(x|0),gx=(H[i+1]-H[i-1])/2,gy=(H[i+W0]-H[i-W0])/2;
 const landed=landN!==p.n&&!air&&crash<=0;
 animPrev={x,y,dir,g,gv,ga,n:landN,air:air||!!grind};
 riderYaw=wr(aR-camA)*180/Math.PI;
 return{wiped:crash>0,grinding:!!grind,airborne:air,braking:!!B,landed,impact:landV,speed:s,pathTurn:turn,riderSide:side,
  approach:!air&&s>4&&Math.abs(x-cx(y))<9&&KICK.some(k=>y>=k-14&&y<k),
  feetAccelUp:ga,slopeDeg:Math.atan(Math.hypot(gx,gy))*180/Math.PI,meanSlopeDeg:HANGA.maps.procedural.meanSlopeDeg}}
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

