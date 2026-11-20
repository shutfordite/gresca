// The Snowboard / Skis picker and its gresca-rig storage key.
// ---- equipment picker in the menu (remembered between visits where the browser allows it) ----
function setRig(r){rig=r;pb.classList.toggle('on',r==='board');ps.classList.toggle('on',r==='ski');
 pb.setAttribute('aria-pressed',r==='board');ps.setAttribute('aria-pressed',r==='ski');
 try{localStorage.setItem('gresca-rig',r)}catch(_){}}
pb.addEventListener('click',()=>setRig('board'));ps.addEventListener('click',()=>setRig('ski'));
try{const s=localStorage.getItem('gresca-rig')||localStorage.getItem('gv-rig');if(s==='ski'||s==='board')setRig(s)}catch(_){}

