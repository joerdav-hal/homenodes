import assert from "node:assert/strict";
import { test } from "node:test";
import { makeHouse } from "../../dev/fake-house.js";
import { buildGraph } from "../../custom_components/homenodes/frontend/graph.js";
import { layout, wirePath } from "../../custom_components/homenodes/frontend/layout.js";
import { nextAt } from "../../custom_components/homenodes/frontend/schedule.js";
import { ago, fmtState, inFmt, yaml } from "../../custom_components/homenodes/frontend/format.js";

/** @typedef {import("../../custom_components/homenodes/frontend/graph.js").GraphNode} GraphNode */

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

/** Zone plates (padding 28, title 40 above) that overlap another zone's. @param {GraphNode[]} nodes */
const zoneOverlaps = (nodes) => {
  /** @type {Map<string | undefined, { x0: number, y0: number, x1: number, y1: number }>} */
  const z = new Map();
  for (const n of nodes) {
    const b = z.get(n.cluster) || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    z.set(n.cluster, { x0: Math.min(b.x0, n.x - 28), y0: Math.min(b.y0, n.y - 68), x1: Math.max(b.x1, n.x + n.w + 28), y1: Math.max(b.y1, n.y + n.h + 28) });
  }
  const list = [...z], hits = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [an, a] = list[i], [bn, b] = list[j];
    if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) hits.push(`${an} × ${bn}`);
  }
  return hits;
};
/** Each zone's members relative to its first member, to show a zone moved only as a whole. @param {GraphNode[]} nodes @param {Set<string>} [skip] */
const shapes = (nodes, skip = new Set()) => {
  /** @type {Map<string | undefined, GraphNode>} */
  const first = new Map();
  /** @type {Record<string, [number, number]>} */
  const out = {};
  for (const n of nodes) {
    if (skip.has(n.id)) continue;
    if (!first.has(n.cluster)) first.set(n.cluster, n);
    const f = /** @type {GraphNode} */ (first.get(n.cluster));
    out[n.id] = [n.x - f.x, n.y - f.y];
  }
  return out;
};
/** A laid-out house, and the same house again with these node ids left unplaced. @param {string[]} unplaced @param {(h: any) => void} [change] */
const relayout = (unplaced, change) => {
  const g = buildGraph(makeHouse({ now: now.getTime() }));
  layout(g.nodes, g.edges);
  const fixed = new Map(g.nodes.filter((n) => !unplaced.includes(n.id)).map((n) => [n.id, /** @type {[number, number]} */ ([n.x, n.y])]));
  const house = makeHouse({ now: now.getTime() });
  change?.(house);
  const again = buildGraph(house);
  layout(again.nodes, again.edges, fixed);
  return { before: g, again, fixed };
};

test("a fresh layout has no overlapping cards or zones", () => {
  const g = buildGraph(makeHouse({ now: now.getTime(), copies: 3 }));
  layout(g.nodes, g.edges);
  assert.equal(overlaps(g.nodes), 0);
  assert.deepEqual(zoneOverlaps(g.nodes), []);
});

test("a new node joins its own zone, and zones keep their shape", () => {
  const { before, again } = relayout(["light.hall", "automation.hall_light"]);
  assert.equal(overlaps(again.nodes), 0);
  assert.deepEqual(zoneOverlaps(again.nodes), []);
  const hall = before.nodes.filter((n) => n.cluster === "Hall" && n.id !== "light.hall" && n.id !== "automation.hall_light");
  const x0 = Math.min(...hall.map((n) => n.x)), x1 = Math.max(...hall.map((n) => n.x + n.w));
  for (const id of ["light.hall", "automation.hall_light"]) {
    const n = /** @type {GraphNode} */ (again.nodes.find((m) => m.id === id));
    assert.ok(n.x >= x0 - 1 && n.x + n.w <= x1 + 1, `${id} at x ${n.x}, outside Hall's ${x0}..${x1}`);
  }
  const skip = new Set(["light.hall", "automation.hall_light"]);
  assert.deepEqual(shapes(again.nodes, skip), shapes(before.nodes, skip));
});

test("a new zone goes below everything, laid out as a block", () => {
  const { before, again } = relayout([], (h) => {
    h.states.push({ entity_id: "automation.shed_light", state: "on", attributes: { friendly_name: "[Shed] Shed light", id: "shed" }, last_changed: "", last_updated: "" });
    h.areas.push({ area_id: "shed", name: "Shed" });
    h.entities.push({ id: "reg_shed", entity_id: "automation.shed_light", area_id: "shed", device_id: null, disabled_by: null, labels: [], categories: {} });
    h.configs["automation.shed_light"] = { id: "shed", alias: "[Shed] Shed light", triggers: [{ trigger: "state", entity_id: "binary_sensor.shed_door" }], actions: [{ action: "light.turn_on", target: { entity_id: "light.shed" } }] };
  });
  assert.equal(overlaps(again.nodes), 0);
  assert.deepEqual(zoneOverlaps(again.nodes), []);
  const bottom = Math.max(...before.nodes.map((n) => n.y + n.h));
  const shed = /** @type {GraphNode} */ (again.nodes.find((n) => n.id === "automation.shed_light"));
  assert.equal(shed.cluster, "Shed");
  assert.ok(shed.y > bottom, `shed at ${shed.y}, above the old bottom ${bottom}`);
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

test("pack places every box without overlap, near the shape asked for", async () => {
  const { pack } = await import("../../custom_components/homenodes/frontend/pack.js");
  /** @type {{ w: number, h: number, x?: number, y?: number }[]} */
  const boxes = Array.from({ length: 40 }, (_, i) => ({ w: 100 + ((i * 37) % 300), h: 60 + ((i * 53) % 400) }));
  const { w, h, fill } = pack(boxes, 1.6);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const { x: ax = 0, y: ay = 0, w: aw, h: ah } = boxes[i], { x: bx = 0, y: by = 0, w: bw, h: bh } = boxes[j];
    const hit = ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
    assert.ok(!hit, `boxes ${i} and ${j} overlap`);
  }
  assert.ok(fill > 0.75, `fill ${fill}`);
  assert.ok(w / h > 1.1 && w / h < 2.4, `aspect ${w / h}`);
});
