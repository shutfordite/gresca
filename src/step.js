// step(dt): one physics step: steering, gravity, grip, friction, braking, trees, snow tracks, the finish.
const TQ=[0,4,W0*4,W0*4+4];
function step(dt){
 time+=dt;
 if(grind){grindStep(dt);return}
 const s=Math.hypot(vx,vy);let slip=0;
 if(crash>0){crash-=dt;spin+=dt*14}
 else if(jz>.05){spin=0;const da=((R?1:0)-(L?1:0))*dt*RIGS[rig].spin;a+=da;rot+=da} // in the air, left and right spin the board
 else{spin=0;a+=((R?1:0)-(L?1:0))*dt*(2.7-Math.min(s,30)*.045)*RIGS[rig].turn;a=((a%TAU)+TAU)%TAU;
  const bs=a>=Math.PI?Math.PI:0;a=bs+Math.max(.15,Math.min(Math.PI-.15,a-bs))} // on the snow, carve within forward or switch
 const i=(y|0)*W0+(x|0),gx=(H[i+1]-H[i-1])/2,gy=(H[i+W0]-H[i-W0])/2,m=M[i]/255;
 if(crash<=0){const air=jz>.05,gk=air?0:(B?.3:1);vx-=gx*15.7*gk*dt;vy-=gy*15.7*gk*dt;
  const dx=Math.cos(a),dy=Math.sin(a),al=vx*dx+vy*dy,sx=vx-al*dx,sy=vy-al*dy,k=Math.exp(-(air?.4:(B?2.2:RIGS[rig].grip))*dt);
  slip=Math.hypot(sx,sy);
  vx=dx*al+sx*k;vy=dy*al+sy*k;
  const f=Math.max(0,1-(.0035*s+.02+(air?0:(1-m)*.18))*dt);vx*=f;vy*=f;
  if(B&&!air){const sn=Math.hypot(vx,vy);if(sn>0){const ns=Math.max(0,sn-16*dt);vx*=ns/sn;vy*=ns/sn}}}
 x+=vx*dt;y+=vy*dt;jumpStep(dt);railCheck();
 if(x<6){x=6;vx=0}if(x>W0-6){x=W0-6;vx=0}if(y<6){y=6;vy=0}
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

