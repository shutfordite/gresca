// The page elements the game uses, looked up once: the game canvas and its 2D context, the HUD and the menu.

/** Sets the CSS custom properties ('--name': value, the Look's ui) on doc's root element, for styles/*.css. */
export function applyUiTokens(doc, tokens) {
 const style = doc.documentElement.style;
 for (const name of Object.keys(tokens)) style.setProperty(name, tokens[name]);
}

/** The page's elements by role: canvas and ctx, the menu (msg, msgT, go, pb, ps, cb) and Controls screen (ctl, cc), the HUD and the gloves. */
export function getUi(doc) {
 const $ = (id) => doc.getElementById(id);
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
  menuMain: $('menu'), // the menu's own content (title, text, picker, buttons)
  cb: $('cb'),       // Controls button
  ctl: $('ctl'),     // the Controls screen
  ctlBody: $('ctl-body'), // where the table's rows go
  cc: $('cc'),       // Back button on the Controls screen
  pz: $('pz'),       // pause button (in the run)
  pausep: $('pausep'), // the pause panel
  pr: $('pr'),       // Resume
  pc: $('pc'),       // Controls, from the pause panel
  pm: $('pm'),       // Back to menu
  minimap: $('mc'),  // minimap canvas
 };
}
