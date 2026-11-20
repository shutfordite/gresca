// Page elements: $(), the game canvas and its 2D context, HUD and menu elements, canvas resize.
const $=id=>document.getElementById(id);
const cv=$('c'),ctx=cv.getContext('2d');
const msg=$('msg'),msgT=$('t'),go=$('go'),scoreEl=$('score'),info=$('info'),pop=$('pop'),dot=$('dot'),gl=$('gl'),gr=$('gr'),pb=$('pb'),ps=$('ps');
let W,Hh;
function resize(){const d=Math.min(2,devicePixelRatio||1);cv.width=cv.clientWidth*d;cv.height=cv.clientHeight*d;W=cv.width;Hh=cv.height}
addEventListener('resize',resize);resize();

