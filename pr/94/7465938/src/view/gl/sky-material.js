// The GL sky: the Look's gradient down to the tilted horizon and the sun disc, drawn where no terrain is (as sky.js).
import { hexRgb } from '../look/look.js';

export const MAX_SKY_STOPS = 8; // gradient stops the shader takes

/** The vertex shader: one triangle over the whole screen at the far plane (drawn last, behind the terrain). */
export const SKY_VERTEX = `
precision highp float;
in vec3 position;
void main() {
 gl_Position = vec4(position.xy, 0.99999, 1.0);
}
`;

/** The fragment shader: the stops from the top of the screen (0) to the horizon row (1), then the sun disc. */
export const SKY_FRAGMENT = `
precision highp float;
uniform vec4 uStops[${MAX_SKY_STOPS}]; // rgb 0..1, offset 0..1
uniform int uStopCount;
uniform vec2 uRows;  // the horizon row (canvas px from the top, at least 1), the canvas height (px)
uniform vec4 uSun;   // disc centre X, Y (canvas px from the top left), radius (px), 1 if on screen
uniform vec3 uSunColour;
out vec4 outColour;
void main() {
 float y = uRows.y - gl_FragCoord.y;
 float t = clamp(y / uRows.x, 0.0, 1.0);
 vec3 c = uStops[0].rgb;
 for (int i = 1; i < ${MAX_SKY_STOPS}; i++) {
  if (i >= uStopCount) break;
  float a = uStops[i - 1].w;
  float b = uStops[i].w;
  if (t >= a) c = mix(uStops[i - 1].rgb, uStops[i].rgb, clamp((t - a) / max(b - a, 1e-6), 0.0, 1.0));
 }
 float d = distance(vec2(gl_FragCoord.x, y), uSun.xy);
 c = mix(c, uSunColour, uSun.w * clamp(uSun.z - d + 0.5, 0.0, 1.0));
 outColour = vec4(c, 1.0);
}
`;

/**
 * The sky's uniform values from the Look's sky: stops (Float32Array MAX_SKY_STOPS × 4: rgb 0..1 and offset), count,
 * sunColour (0..1 RGB). Throws if the Look has more stops than the shader takes. Pure.
 */
export function skyLook(sky) {
 if (sky.stops.length > MAX_SKY_STOPS) throw new Error('GL sky: the Look has more than ' + MAX_SKY_STOPS + ' stops');
 const stops = new Float32Array(MAX_SKY_STOPS * 4);
 sky.stops.forEach(([offset, colour], i) => {
  const rgb = hexRgb(colour);
  stops.set([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, offset], i * 4);
 });
 const sun = hexRgb(sky.sun.colour);
 return { stops, count: sky.stops.length, sunColour: [sun[0] / 255, sun[1] / 255, sun[2] / 255] };
}
