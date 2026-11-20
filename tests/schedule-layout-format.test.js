import assert from "node:assert/strict";
import { test } from "node:test";
import { makeHouse } from "../dev/fake-house.js";
import { buildGraph } from "../custom_components/homenodes/frontend/graph.js";
import { layout, wirePath } from "../custom_components/homenodes/frontend/layout.js";
import { nextAt } from "../custom_components/homenodes/frontend/schedule.js";
import { ago, fmtState, inFmt, yaml } from "../custom_components/homenodes/frontend/format.js";

/** @typedef {import("../custom_components/homenodes/frontend/graph.js").GraphNode} GraphNode */

const now = new Date(2026, 10, 20, 18, 30, 0);
const local = (/** @type {number[]} */ ...p) => new Date(2026, 10, p[0], p[1], p[2] ?? 0, 0).getTime();

test("nextAt: times today or tomorrow", () => {
  assert.equal(nextAt({ type: "time", at: "21:30:00" }, now, {})?.getTime(), local(20, 21, 30));
  assert.equal(nextAt({ type: "time", at: "06:30:00" }, now, {})?.getTime(), local(21, 6, 30));
});

test("nextAt: sun events with offsets", () => {
  const set = new Date(local(21, 16, 8)).toISOString();
  /** @type {any} */
  const states = { "sun.sun": { attributes: { next_setting: set } } };
  assert.equal(nextAt({ type: "sun", event: "sunset", offset: "-00:15:00" }, now, states)?.getTime(), local(21, 15, 53));
  assert.equal(nextAt({ type: "sun", event: "sunrise", offset: null }, now, {}), null);
});

test("nextAt: time patterns", () => {
  assert.equal(nextAt({ type: "pattern", minutes: "/30" }, new Date(local(20, 18, 41)), {})?.getTime(), local(20, 19, 0));
  assert.equal(nextAt({ type: "pattern", hours: "/2" }, now, {})?.getTime(), local(20, 20, 0));
  assert.equal(nextAt({ type: "pattern", minutes: "5" }, now, {})?.getTime(), local(20, 19, 5));
  assert.equal(nextAt(null, now, {}), null);
});

/** @param {GraphNode[]} nodes */
const overlaps = (nodes) => {
  let n = 0;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) n++;
  }
  return n;
};

test("layout places every node without overlaps", () => {
  for (const copies of [1, 4]) {
    const g = buildGraph(makeHouse({ now: now.getTime(), copies }));
    layout(g.nodes, g.edges);
    assert.equal(overlaps(g.nodes), 0, `copies=${copies}`);
    for (const n of g.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y) && n.w > 0 && n.h > 0, n.id);
  }
});

test("layout keeps fixed positions and fits new nodes in beside them", () => {
  const g = buildGraph(makeHouse({ now: now.getTime() }));
  layout(g.nodes, g.edges);
  /** @type {Map<string, [number, number]>} */
  const fixed = new Map(g.nodes.filter((n) => n.id !== "light.hall").map((n) => [n.id, [n.x, n.y]]));
  const again = buildGraph(makeHouse({ now: now.getTime() }));
  layout(again.nodes, again.edges, fixed);
  for (const n of again.nodes) if (n.id !== "light.hall") assert.deepEqual([n.x, n.y], fixed.get(n.id), n.id);
  assert.equal(overlaps(again.nodes), 0);
});

test("wirePath runs from the right edge of one box to the left edge of the next", () => {
  assert.equal(wirePath({ x: 0, y: 0, w: 100, h: 40 }, { x: 300, y: 100, w: 100, h: 40 }), "M100,20 C190,20 210,120 300,120");
});

test("ago and inFmt read like a person would say them", () => {
  const t = now.getTime();
  assert.equal(ago(null), "never");
  assert.equal(ago(t - 20e3, t), "just now");
  assert.equal(ago(t - 5 * 60e3, t), "5m ago");
  assert.equal(ago(t - 3 * 3600e3, t), "3h ago");
  assert.equal(ago(t - 2 * 86400e3, t), "2d ago");
  assert.equal(inFmt(20e3), "now");
  assert.equal(inFmt(14 * 60e3), "in 14m");
  assert.equal(inFmt(134 * 60e3), "in 2h 14m");
});

test("fmtState rounds numbers and adds units", () => {
  const base = { entity_id: "sensor.t", last_changed: "", last_updated: "" };
  assert.equal(fmtState({ ...base, state: "19.46", attributes: { unit_of_measurement: "°C" } }), "19.5 °C");
  assert.equal(fmtState({ ...base, state: "unavailable", attributes: {} }), "unavailable");
  assert.equal(fmtState(undefined), "missing");
});

test("yaml quotes only what needs quoting", () => {
  assert.equal(yaml({ a: "plain", b: "has: colon", c: [1, { d: true }], e: {}, f: "" }), 'a: plain\nb: "has: colon"\nc:\n  - 1\n  - d: true\ne: {}\nf: ""');
  assert.equal(yaml({ t: "{{ x }}" }), 't: "{{ x }}"');
  assert.equal(yaml("two\nlines"), "|\n  two\n  lines");
});
