// Run with `npm run check`. Keeps the gauge in step with the copy on the page:
// each section's heading names the signal the gauge shows when that section is centred.
import assert from "node:assert/strict";
import { signalFor, windAt } from "./storm.ts";

assert.equal(signalFor(38), 0);
assert.equal(signalFor(39), 1);
assert.equal(signalFor(184), 4);
assert.equal(signalFor(185), 5);

// Six sections, one screen each, so section i is centred at p = i / 5.
const expected = [1, 2, 4, 5, 0, 0];
expected.forEach((signal, i) => assert.equal(signalFor(windAt(i / 5)), signal, `section ${i}`));

console.log("storm check ok");
