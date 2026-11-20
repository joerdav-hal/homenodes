import assert from "node:assert/strict";
import { test } from "node:test";
import { branchConditions, durSecs, evalConditions } from "../custom_components/homenodes/frontend/conditions.js";

/** @typedef {import("../types/ha").HassEntity} HassEntity */

// Local time, so the tests mean the same thing in any time zone.
const now = new Date(2026, 10, 20, 18, 30, 0); // a Friday
/** @param {string} id @param {string} state @param {Record<string, any>} [attributes] @param {number} [ageMs] @returns {HassEntity} */
const st = (id, state, attributes = {}, ageMs = 3600e3) => ({ entity_id: id, state, attributes, last_changed: new Date(now.getTime() - ageMs).toISOString(), last_updated: new Date(now.getTime() - ageMs).toISOString() });
const states = Object.fromEntries([
  st("light.hall", "on", {}, 5 * 60e3),
  st("input_boolean.guest", "off"),
  st("sensor.temp", "19.5", { unit_of_measurement: "°C" }),
  st("person.alex", "home"),
  st("person.sam", "Work"),
  st("zone.work", "1", { friendly_name: "Work" }),
  st("sun.sun", "below_horizon"),
  st("input_datetime.wake", "07:00:00"),
].map((s) => [s.entity_id, s]));
/** @param {any} v @returns {string[]} */
const resolve = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).flatMap((x) => String(x).split(",").map((p) => p.trim()));
/** @param {any} c @param {Record<string, any>} [extra] */
const ev = (c, extra = {}) => {
  /** @type {[string, boolean | null, any][]} */
  const reports = [];
  const result = evalConditions(c, { states, now, resolve, report: (id, ok, why) => reports.push([id, ok, why]), ...extra });
  return { result, reports };
};

test("state conditions pass, fail, and say what they saw", () => {
  assert.equal(ev({ condition: "state", entity_id: "light.hall", state: "on" }).result, true);
  const { result, reports } = ev({ condition: "state", entity_id: "input_boolean.guest", state: "on" });
  assert.equal(result, false);
  assert.deepEqual(reports[0], ["input_boolean.guest", false, { actual: "off", wanted: "on" }]);
});

test("a state condition's for: counts how long the state has held", () => {
  assert.equal(ev({ condition: "state", entity_id: "light.hall", state: "on", for: { minutes: 2 } }).result, true);
  const { result, reports } = ev({ condition: "state", entity_id: "light.hall", state: "on", for: "00:10:00" });
  assert.equal(result, false);
  assert.equal(reports[0][2].actual, "on for only 5m");
});

test("numeric_state compares above and below", () => {
  assert.equal(ev({ condition: "numeric_state", entity_id: "sensor.temp", above: 18, below: 21 }).result, true);
  const { result, reports } = ev({ condition: "numeric_state", entity_id: "sensor.temp", above: 20 });
  assert.equal(result, false);
  assert.deepEqual(reports[0][2], { actual: "19.5", wanted: "above 20" });
});

test("time windows, including across midnight, and weekdays", () => {
  assert.equal(ev({ condition: "time", after: "17:00:00", before: "21:30:00" }).result, true);
  assert.equal(ev({ condition: "time", after: "22:00", before: "06:00" }).result, false);
  assert.equal(ev({ condition: "time", after: "18:00", before: "02:00" }).result, true);
  assert.equal(ev({ condition: "time", weekday: ["sat", "sun"] }).result, false);
  assert.equal(ev({ condition: "time", after: "input_datetime.wake" }).result, true);
  assert.equal(ev({ condition: "time", after: "22:00:00", before: "23:00:00" }).reports[0][2].text, "outside 22:00–23:00");
});

test("and, or and not combine three ways", () => {
  const on = { condition: "state", entity_id: "light.hall", state: "on" };
  const off = { condition: "state", entity_id: "light.hall", state: "off" };
  const unknown = { condition: "trigger", id: "x" };
  assert.equal(ev({ condition: "and", conditions: [on, unknown] }).result, null);
  assert.equal(ev({ condition: "and", conditions: [off, unknown] }).result, false);
  assert.equal(ev({ condition: "or", conditions: [off, on] }).result, true);
  assert.equal(ev({ condition: "or", conditions: [off, unknown] }).result, null);
  assert.equal(ev([on, on]).result, true);
  const not = ev({ condition: "not", conditions: [on] });
  assert.equal(not.result, false);
  assert.deepEqual(not.reports[0], ["light.hall", false, { actual: "on", wanted: "not on" }]);
});

test("zone and sun conditions", () => {
  assert.equal(ev({ condition: "zone", entity_id: "person.alex", zone: "zone.home" }).result, true);
  assert.equal(ev({ condition: "zone", entity_id: "person.sam", zone: "zone.work" }).result, true);
  assert.equal(ev({ condition: "sun", after: "sunset" }).result, true);
  assert.equal(ev({ condition: "sun", after: "sunrise", before: "sunset" }).result, false);
  assert.equal(ev({ condition: "sun", after: "sunset", after_offset: "-01:00:00" }).result, null);
});

test("templates use live results, and unknowable ones stay unknown", () => {
  const tpl = new Map([["{{ x }}", { result: false, entities: ["light.hall"] }]]);
  const r = ev({ condition: "template", value_template: "{{ x }}" }, { tpl });
  assert.equal(r.result, false);
  assert.deepEqual(r.reports[0], ["light.hall", false, { template: true }]);
  assert.equal(ev("{{ x }}", { tpl }).result, false);
  assert.equal(ev("{{ x }}", { tpl, skipTpl: () => true }).result, null);
  assert.equal(ev({ condition: "template", value_template: "{{ y }}" }, { tpl }).result, null);
});

test("disabled conditions pass and unknown kinds are unknown", () => {
  assert.equal(ev({ condition: "state", entity_id: "light.hall", state: "off", enabled: false }).result, true);
  assert.equal(ev({ condition: "device", entity_id: "light.hall", type: "is_on" }).result, true);
  assert.equal(ev({ condition: "something_new" }).result, null);
  assert.equal(ev(null).result, true);
});

test("branchConditions finds every condition block inside actions", () => {
  const steps = [
    { choose: [{ conditions: [{ condition: "trigger", id: "a" }], sequence: [{ if: [{ condition: "state" }], then: [] }] }], default: [{ condition: "time" }] },
    { repeat: { until: [{ condition: "template" }], sequence: [] } },
    { action: "light.turn_on", enabled: false, choose: [] },
  ];
  assert.equal(branchConditions(steps).length, 4);
});

test("durSecs reads every way HA writes a duration", () => {
  assert.equal(durSecs("01:30:00"), 5400);
  assert.equal(durSecs("00:05"), 300);
  assert.equal(durSecs("-00:15:00"), -900);
  assert.equal(durSecs({ minutes: 2, seconds: 5 }), 125);
  assert.equal(durSecs(90), 90);
  assert.equal(durSecs(null), 0);
  assert.equal(durSecs("{{ x }}"), null);
});
