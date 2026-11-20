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

