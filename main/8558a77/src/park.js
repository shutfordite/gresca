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

