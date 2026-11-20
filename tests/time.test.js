import assert from "node:assert/strict";
import { test } from "node:test";
import { instantIn, partsIn } from "../custom_components/homenodes/frontend/time.js";
import { evalConditions } from "../custom_components/homenodes/frontend/conditions.js";
import { nextAt } from "../custom_components/homenodes/frontend/schedule.js";

// 13:00 UTC on Friday 20 November 2026: 18:30 in Kolkata (+05:30), 08:00 in New York (-05:00).
const moment = Date.UTC(2026, 10, 20, 13, 0, 0);
/** @param {any} v @returns {string[]} */
const resolve = (v) => (Array.isArray(v) ? v : [v]);

test("partsIn reads the wall clock in a time zone", () => {
  assert.deepEqual(partsIn(moment, "Asia/Kolkata"), { year: 2026, month: 11, day: 20, hour: 18, minute: 30, second: 0, weekday: 5 });
  assert.equal(partsIn(moment, "America/New_York").hour, 8);
  assert.equal(partsIn(moment, "Pacific/Auckland").weekday, 6, "already Saturday there");
});

test("instantIn turns a wall-clock time back into a moment", () => {
  assert.equal(instantIn({ year: 2026, month: 11, day: 20, hour: 18, minute: 30 }, "Asia/Kolkata"), moment);
  assert.equal(instantIn({ year: 2026, month: 11, day: 20, hour: 8 }, "America/New_York"), moment);
  assert.equal(instantIn({ year: 2026, month: 11, day: 31, hour: 0 }, "Europe/London"), Date.UTC(2026, 11, 1), "day 31 of November overflows");
});

test("instantIn moves a time in a daylight-saving gap forward, as clocks do", () => {
  // London skipped 01:00 to 02:00 on 29 March 2026; 01:30 never happened.
  const t = instantIn({ year: 2026, month: 3, day: 29, hour: 1, minute: 30 }, "Europe/London");
  assert.equal(t, Date.UTC(2026, 2, 29, 1, 30));
  assert.equal(partsIn(t, "Europe/London").hour, 2);
});

test("time conditions are checked on Home Assistant's clock, not the browser's", () => {
  const window = { condition: "time", after: "17:00:00", before: "21:30:00" };
  const ev = (/** @type {string} */ timeZone, /** @type {any} */ c = window) => evalConditions(c, { states: {}, now: new Date(moment), resolve, timeZone });
  assert.equal(ev("Asia/Kolkata"), true);
  assert.equal(ev("America/New_York"), false);
  assert.equal(ev("Pacific/Auckland", { condition: "time", weekday: ["sat"] }), true);
  assert.equal(ev("Asia/Kolkata", { condition: "time", weekday: ["sat"] }), false);
});

test("schedules are worked out on Home Assistant's clock", () => {
  const now = new Date(moment);
  assert.equal(nextAt({ type: "time", at: "21:30:00" }, now, {}, "Asia/Kolkata")?.getTime(), Date.UTC(2026, 10, 20, 16, 0));
  assert.equal(nextAt({ type: "time", at: "06:30:00" }, now, {}, "America/New_York")?.getTime(), Date.UTC(2026, 10, 21, 11, 30), "tomorrow, since 06:30 has passed there");
  assert.equal(nextAt({ type: "pattern", minutes: "/45" }, now, {}, "Asia/Kolkata")?.getTime(), Date.UTC(2026, 10, 20, 13, 15), "18:45 there, the next /45 mark after 18:30");
  assert.equal(nextAt({ type: "pattern", hours: "/2" }, now, {}, "Asia/Kolkata")?.getTime(), Date.UTC(2026, 10, 20, 14, 30), "20:00 there");
});
