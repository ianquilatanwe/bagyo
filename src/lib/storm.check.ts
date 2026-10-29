// Run with `npm run check`. Keeps the gauge in step with the copy on the page:
// each section's heading names the signal the gauge shows when that section is centred.
import assert from "node:assert/strict";
import { canopyHit, rimEnd } from "./rain.ts";
import { signalFor, windAt } from "./storm.ts";

assert.equal(signalFor(38), 0);
assert.equal(signalFor(39), 1);
assert.equal(signalFor(184), 4);
assert.equal(signalFor(185), 5);

// Six sections, one screen each, so section i is centred at p = i / 5.
const expected = [1, 2, 4, 5, 0, 0];
expected.forEach((signal, i) => assert.equal(signalFor(windAt(i / 5)), signal, `section ${i}`));

// The umbrella's canopy as the rain sees it: a dome above the rim, nothing below it,
// and it turns with the umbrella.
const c = { x: 100, y: 100, angle: 0, scale: 1, blocking: true, vx: 0, vy: 0 };
assert.equal(canopyHit(c, 100, 95), 1); // just right of the centre line, inside the dome
assert.equal(canopyHit(c, 90, 105), -1);
assert.equal(canopyHit(c, 100, 120), 0); // below the rim: the shaft, not the canopy
assert.equal(canopyHit(c, 100, 80), 0); // above the tip
assert.deepEqual(rimEnd(c, 1), [128, 113]);
const tilted = { ...c, angle: Math.PI / 2 }; // turned a quarter clockwise: the rim's right end now points down
assert.deepEqual(rimEnd(tilted, 1).map(Math.round), [87, 128]);
assert.equal(canopyHit(tilted, 120, 100), 0); // past the tip, which now points right
assert.equal(canopyHit(tilted, 80, 100), 0); // past the rim, now on the left
assert.notEqual(canopyHit(tilted, 105, 100), 0);

console.log("storm check ok");
