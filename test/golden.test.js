// The golden trace (tools/golden-trace.mjs): three fixed-seed, fixed-dt rides through the park, per step, bitwise.
// The hash was recorded on main before B2c moved the game onto the Course interface; a refactor must not change it.
// A deliberate feel change updates GOLDEN_HASH in the same PR and says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goldenTrace } from '../tools/golden-trace.mjs';

const GOLDEN_HASH = 'f130e83999e59b65f4cd51939c723c85121ccc385b4692f11b87f0c838c9aa16';

test('the golden trace (rider, score, events, HUD, flags, rails, animation) is unchanged', async () => {
 const t = await goldenTrace();
 const events = t.rides.flatMap((r) => r.rows.filter((x) => x.e).flatMap((x) => x.e));
 assert.ok(events.some((e) => e.includes('"grindStart"')), 'the trace grinds a rail');
 assert.ok(events.some((e) => e.includes('"finish"')), 'the trace reaches the finish');
 assert.ok(t.rides.some((r) => r.rows.some((x) => x.r[11])), 'the trace launches off a kicker');
 assert.equal(t.hash, GOLDEN_HASH);
});
