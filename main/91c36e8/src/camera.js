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

