// The input's façade fields (debug.js state() and set()): what the rider is told, as 0 or 1.
import { field, nested } from '../core/facade-fields.js';

// A 0-or-1 input field: any truthy value writes 1.
const flag = (input, key) => field(() => input[key], (v) => { input[key] = v ? 1 : 0; });

/** The input's fields: input {left, right, brake, jump}; jump is one-shot (writing it also sets jumpPressed). */
export function inputFields(input) {
 const jump = field(() => input.jump, (v) => {
  input.jump = v ? 1 : 0;
  input.jumpPressed = input.jump;
 });
 return {
  input: nested('input', {
   left: flag(input, 'left'), right: flag(input, 'right'), brake: flag(input, 'brake'), jump,
  }),
 };
}
