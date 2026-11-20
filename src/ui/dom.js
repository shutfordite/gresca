// The page elements the game uses, looked up once: the game canvas and its 2D context, the HUD and the menu.

/** The page's elements by role: canvas and ctx, the menu (msg, msgT, go, pb, ps), the HUD and the gloves. */
export function getUi(document) {
 const $ = (id) => document.getElementById(id);
 const canvas = $('c');
 return {
  canvas,
  ctx: canvas.getContext('2d'),
  msg: $('msg'),     // the menu and result screen
  msgT: $('t'),      // its text
  go: $('go'),       // Drop in / Ride again
  scoreEl: $('score'),
  info: $('info'),   // speed and metres to go
  pop: $('pop'),     // trick popup
  dot: $('dot'),     // the rider on the minimap
  gl: $('gl'),       // left glove hint
  gr: $('gr'),       // right glove hint
  pb: $('pb'),       // Snowboard button
  ps: $('ps'),       // Skis button
  minimap: $('mc'),  // minimap canvas
 };
}
