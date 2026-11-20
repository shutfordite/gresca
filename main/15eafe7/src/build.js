// build(): fast row-wise fbm, then heights, groomed mask, colour map, lift, trees, park paint and village.
// fbm(x,y) along whole map rows: fbmRows() returns row(y,out), which fills out[x] (x = 0..W0-1) for row y. Gives
// exactly the same numbers as fbm(): the same lattice hashes and the same arithmetic in the same order, but each
// lattice hash is computed once rather than 12 Math.sin calls per cell, and the per-column and per-row terms once
// per column and row (M2). Memory: about 150 KB of tables, plus the caller's 8 KB row.
function fbmRows(){
 const S=[90,40,17],WT=[.55,.3,.15],n=S.length,ni=[],hs=[],ci=[],cu=[],cu1=[],
 rj=new Int32Array(n),rv=new Float64Array(n),rv1=new Float64Array(n);
 for(let o=0;o<n;o++){const s=S[o],w=Math.floor((W0-1)/s)+2,h=Math.floor((H0-1)/s)+2,T=new Float64Array(w*h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)T[j*w+i]=hash(i,j);ni.push(w);hs.push(T);
  const I=new Int32Array(W0),U=new Float64Array(W0),U1=new Float64Array(W0);
  for(let x=0;x<W0;x++){const X=x/s,i=Math.floor(X),fx=X-i,u=fx*fx*(3-2*fx);I[x]=i;U[x]=u;U1[x]=1-u}
  ci.push(I);cu.push(U);cu1.push(U1)}
 const [T0,T1,T2]=hs,[I0,I1,I2]=ci,[U0,Ua,U2]=cu,[V0,Va,V2]=cu1,[w0,w1,w2]=ni,k0=WT[0],k1=WT[1],k2=WT[2];
 return(y,out)=>{
  for(let o=0;o<n;o++){const Y=y/S[o],j=Math.floor(Y),fy=Y-j,v=fy*fy*(3-2*fy);rj[o]=j*ni[o];rv[o]=v;rv1[o]=1-v}
  const r0=rj[0],r1=rj[1],r2=rj[2],v0=rv[0],v1=rv[1],v2=rv[2],q0=rv1[0],q1=rv1[1],q2=rv1[2];
  for(let x=0;x<W0;x++){
   let a=r0+I0[x],u=U0[x],p=V0[x];
   const n0=T0[a]*p*q0+T0[a+1]*u*q0+T0[a+w0]*p*v0+T0[a+w0+1]*u*v0;
   a=r1+I1[x];u=Ua[x];p=Va[x];
   const n1=T1[a]*p*q1+T1[a+1]*u*q1+T1[a+w1]*p*v1+T1[a+w1+1]*u*v1;
   a=r2+I2[x];u=U2[x];p=V2[x];
   const n2=T2[a]*p*q2+T2[a+1]*u*q2+T2[a+w2]*p*v2+T2[a+w2+1]*u*v2;
   out[x]=n0*k0+n1*k1+n2*k2}
  return out}}

function build(){
 const row=fbmRows(),F=new Float64Array(W0);
 for(let y=0;y<H0;y++){const c=cx(y),hy=2700-y*.26;row(y,F);for(let x=0;x<W0;x++){const d=Math.abs(x-c),t=Math.max(0,Math.min(1,(d-18)/16)),m=1-t*t*(3-2*t),i=y*W0+x;
  M[i]=m*255;H[i]=hy+(F[x]-.5)*110*(1-m*.92)+Math.min(d,260)*.16}}
 // kicker ramps are real terrain, so they show up in the shading and in the 3D view
 for(const k of KICK)for(let yy=k-11;yy<=k+4;yy++){const c=Math.round(cx(yy));for(let xx=c-11;xx<=c+11;xx++)H[yy*W0+xx]+=bump(xx,yy)}
 // Colour map: lavender shadows, warm lit snow, grey rock, and fine corduroy stripes on the groomed piste.
 const img=mx.createImageData(W0,H0),D=img.data;
 for(let y=0;y<H0;y++){const c=cx(y);for(let x=0;x<W0;x++){const i=y*W0+x;let gx=0,gy=0;
  if(x>0&&x<W0-1&&y>0&&y<H0-1){gx=(H[i+1]-H[i-1])/2;gy=(H[i+W0]-H[i-W0])/2}
  const sl=Math.hypot(gx,gy),sh=Math.max(.55,Math.min(1.12,.86-(gx+gy)*.22)),lit=Math.max(0,Math.min(1,(sh-.55)/.5)),m=M[i]/255,rk=Math.max(0,Math.min(1,(sl-.5)*4))*(1-m);
  let r=170+lit*74+m*6,g=168+lit*78+m*6,b=214+lit*38+m*4;
  if(m>0){const st=1+.045*m*Math.sin((x-c)*2.1);r*=st;g*=st;b*=st}
  r+=(118-r)*rk;g+=(120-g)*rk;b+=(130-b)*rk;
  const o=i*4;D[o]=r;D[o+1]=g;D[o+2]=b;D[o+3]=255}}
 mx.putImageData(img,0,0);
 // lift line
 mx.strokeStyle='#39424f';mx.lineWidth=1.2;mx.beginPath();mx.moveTo(820,2290);mx.lineTo(820,140);mx.stroke();
 for(let y=140;y<=2290;y+=70){mx.fillStyle='#39424f';mx.fillRect(818,y-2,5,5)}
 for(let y=200;y<2290;y+=420){mx.fillStyle='#ff6b3d';mx.fillRect(817,y,6,4)}
 // trees, each with a long soft shadow
 for(let gy=0;gy<H0/6;gy++)for(let gx=0;gx<W0/6;gx++){
  const x=gx*6+hash(gx,gy)*6,y=gy*6+hash(gy,gx+9)*6,i=(y|0)*W0+(x|0);
  if(y<20||y>FIN-10||x<10||x>W0-10||Math.abs(x-820)<10||M[i]>0||Math.abs(x-cx(y))<40||H[i]>2560)continue;
  if(vn(x/60,y/60)<.42||hash(gx+5,gy+3)<.35)continue;
  const T={x,y};trees.set(gx*10000+gy,T);treeArr.push(T);
  mx.fillStyle='rgba(96,86,150,.30)';mx.beginPath();mx.moveTo(x-1.4,y);mx.lineTo(x+1.4,y);mx.lineTo(x+9,y-10);mx.closePath();mx.fill();
  mx.fillStyle='#1f4a3a';mx.beginPath();mx.arc(x,y,1.6,0,7);mx.fill()}
 // kickers: a bluish pad up the ramp, then a pale lip with an orange edge (stronger for the big ones). Painted row by row so it follows the curve of the piste.
 for(const k of KICK){const big=KBIG.has(k),w=big?10:9;
  for(let yy=k-11;yy<k+5;yy++){const c=cx(yy);
   mx.fillStyle=yy<k?(big?'rgba(110,124,196,.45)':'rgba(120,134,196,.34)'):(big?'#b7c6dd':'#9fb0c8');mx.fillRect(c-w,yy,w*2,1);
   if(yy===k){mx.fillStyle='#ff6b3d';mx.fillRect(c-w,yy,w*2,1.3)}}}
 for(const r of RAILS){mx.strokeStyle='rgba(96,86,150,.35)';mx.lineWidth=1.4;mx.beginPath();mx.moveTo(r.x0+1.2,r.y0-.8);mx.lineTo(r.x0+r.dx*r.len+1.2,r.y0+r.dy*r.len-.8);mx.stroke()}
 // village and finish
 for(let k=0;k<26;k++){const x=cx(FIN+60)-230+hash(k,1)*460,y=FIN+40+hash(k,2)*70,w=12+hash(k,3)*8;
  mx.fillStyle='rgba(30,40,60,.3)';mx.fillRect(x+2,y+2,w,10);mx.fillStyle=hash(k,4)>.5?'#b5543a':'#8a6a5a';mx.fillRect(x,y,w,10);mx.fillStyle='#f2f6fa';mx.fillRect(x,y,w,3)}
 const fc=cx(FIN);for(let k=0;k<16;k++){mx.fillStyle=k%2?'#fff':'#d33';mx.fillRect(fc-40+k*5,FIN,5,3)}
 mx.fillStyle='#d33';mx.fillRect(fc-42,FIN-8,3,11);mx.fillRect(fc+39,FIN-8,3,11);
 mx.fillStyle='#16202e';mx.font='bold 13px Trebuchet MS,sans-serif';mx.textAlign='center';mx.fillText('PAS DE LA CASA',fc,FIN+30);
 col=mx.getImageData(0,0,W0,H0).data;col0=col.slice();
 $('mc').getContext('2d').drawImage(map,0,0,W0,H0,0,0,42,103);
}

