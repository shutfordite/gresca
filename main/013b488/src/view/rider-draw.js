// The Hanga Dawn rider: draws the list HANGA.projectRider makes (via RiderAnim.project) onto a 2D context.

/**
 * Draws the rider's draw list (in metres with +y up) on c, scaled by m px per metre. Each item is outlined in the key
 * colour, then filled (spec section 3: keyline 0.012 m, never under 1 px). The shadow ellipse is skipped: the caller
 * draws it on the ground.
 */
export function drawRider(c, hanga, m, list) {
 const K = hanga.colour('key');
 const kl = Math.max(1, hanga.rider.widths.keyline * m);
 const col = (r) => hanga.colour(r);
 const path = (pts) => {
  c.beginPath();
  c.moveTo(pts[0][0] * m, -pts[0][1] * m);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] * m, -pts[i][1] * m);
 };
 const stroke = (pts, w, colour, outline) => {
  path(pts);
  c.lineCap = c.lineJoin = 'round';
  if (outline) {
   c.strokeStyle = K;
   c.lineWidth = w * m + 2 * kl;
   c.stroke();
  }
  c.strokeStyle = col(colour);
  c.lineWidth = Math.max(1, w * m);
  c.stroke();
 };
 const dot = (p, r, colour) => {
  c.fillStyle = K;
  c.beginPath();
  c.arc(p[0] * m, -p[1] * m, r * m + kl, 0, 7);
  c.fill();
  c.fillStyle = col(colour);
  c.beginPath();
  c.arc(p[0] * m, -p[1] * m, r * m, 0, 7);
  c.fill();
 };
 for (const it of list) {
  if (it.kind === 'ellipse') continue; // the shadow is drawn on the ground by the caller
  if (it.kind === 'equip') {
   for (const sh of it.shapes) {
    if (sh.kind === 'line') {
     stroke(sh.pts, sh.width, sh.colour, false);
     continue;
    }
    path(sh.pts);
    c.closePath();
    c.fillStyle = col(sh.colour);
    c.fill();
    if (sh.keyline) {
     c.strokeStyle = K;
     c.lineWidth = kl;
     c.lineJoin = 'round';
     c.stroke();
    }
   }
   continue;
  }
  if (it.kind === 'circle' || it.kind === 'head') {
   dot(it.pts[0], it.width, it.colour);
   if (it.goggles) {
    stroke(it.goggles.frame.pts, it.goggles.frame.width, it.goggles.frame.colour, false);
    stroke(it.goggles.lens.pts, it.goggles.lens.width, it.goggles.lens.colour, false);
   }
   if (it.strap) stroke(it.strap.pts, it.strap.width, it.strap.colour, false);
   continue;
  }
  stroke(it.pts, it.width, it.colour, true); // limb, torso and boot capsules
 }
}
