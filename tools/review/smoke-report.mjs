// Turns a smoke test result (tools/review/smoke.mjs) into review findings, pure, so the rule is tested in Node.
import { FAIL, INFO, WARN } from './checks.mjs';

const MIN_DISTANCE_M = 1; // m the rider must have moved after dropping in (wall-clock riding, so only "it moves")

/** result: {head, base?} as smoke.mjs writes it, or null when the smoke test did not run. */
export function smokeFindings(result) {
 if (!result || !result.head) return [[FAIL, 'smoke test did not run (see the job log)']];
 const findings = [];
 const h = result.head;
 if (h.error) findings.push([FAIL, `the page did not get to riding: ${h.error}`]);
 for (const p of h.problems || []) {
  const onMain = result.base && (result.base.problems || []).includes(p);
  findings.push(onMain ? [WARN, `${p} (also on main)`] : [FAIL, p]);
 }
 if (h.state) {
  const moved = Math.hypot(h.state.dx, h.state.dy);
  const line = `after Drop in and 3 s of riding: phase \`${h.state.phase}\`, moved ${moved.toFixed(1)} m, ` +
   `speed ${Number(h.state.speed).toFixed(1)} m/s`;
  findings.push(moved >= MIN_DISTANCE_M ? [INFO, line] : [FAIL, line + ' (the rider barely moved)']);
 }
 if (!findings.some(([s]) => s !== INFO)) findings.push([INFO, 'no page errors or failed requests']);
 findings.push([INFO, 'screenshots (menu, riding) are in the `pr-check` artifact: open them only if flagged']);
 return findings;
}
