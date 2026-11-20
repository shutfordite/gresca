// Input: touch halves and swipe, keyboard, the Drop in button.
// ---- input: hold the left or right half of the screen to turn (or spin in the air); both halves together jump; swipe down to brake ----
const ptrs=new Map(),kb={L:0,R:0,B:0},SWIPE=36;
function applyInput(){let l=kb.L,r=kb.R,b=kb.B;
 for(const p of ptrs.values()){if(p.side<0)l=1;else r=1;if(p.brake)b=1}
 if(l&&r&&!both)JU=1; // both sides pressed together = jump
 both=!!(l&&r);L=l;R=r;B=b;gl.classList.toggle('on',!!l);gr.classList.toggle('on',!!r)}
function sideOf(px){return px<cv.clientWidth/2?-1:1}
function pDown(id,px,py){ptrs.set(id,{y0:py,side:sideOf(px),brake:false});applyInput()}
function pMove(id,px,py){const p=ptrs.get(id);if(!p)return;const dy=py-p.y0;
 p.brake=dy>SWIPE;p.side=sideOf(px);applyInput()}
function pUp(id){ptrs.delete(id);applyInput()}
cv.addEventListener('pointerdown',e=>{e.preventDefault();try{cv.setPointerCapture(e.pointerId)}catch(_){}pDown(e.pointerId,e.clientX,e.clientY)});
cv.addEventListener('pointermove',e=>pMove(e.pointerId,e.clientX,e.clientY));
['pointerup','pointercancel'].forEach(n=>cv.addEventListener(n,e=>pUp(e.pointerId)));
addEventListener('keydown',e=>{const k=e.key;if(k=='ArrowLeft'||k=='a')kb.L=1;if(k=='ArrowRight'||k=='d')kb.R=1;if(k=='ArrowDown'||k=='s')kb.B=1;if(k==' '||k=='ArrowUp'||k=='w')JU=1;applyInput()});
addEventListener('keyup',e=>{const k=e.key;if(k=='ArrowLeft'||k=='a')kb.L=0;if(k=='ArrowRight'||k=='d')kb.R=0;if(k=='ArrowDown'||k=='s')kb.B=0;applyInput()});
go.addEventListener('click',start);
