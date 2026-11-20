import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSaved, SAVED_VERSION, serializeSaved } from "../../custom_components/homenodes/frontend/saved.js";

const plain = (/** @type {unknown} */ x) => JSON.parse(JSON.stringify(x));

test("nothing usable is null", () => {
  for (const raw of [null, undefined, 3, "x", [], true]) assert.equal(parseSaved(raw), null);
});

test("a current layout round-trips", () => {
  /** @type {Parameters<typeof serializeSaved>[0]} */
  const layout = {
    posBy: { area: { "light.a": [10, 20] }, label: { "light.a": [-5, 0.5] } },
    collapsedBy: { area: ["Kitchen"] },
    view: { x: 1, y: 2, k: 0.8 },
    opts: { conditions: false, heat: true, grouping: "label" },
  };
  const stored = serializeSaved(layout);
  assert.equal(stored.v, SAVED_VERSION);
  assert.deepEqual(plain(parseSaved(plain(stored))), layout);
});

test("layouts from before version 3 keep the [Tag] grouping", () => {
  const s = parseSaved({ v: 2, pos: { "light.a": [1, 2] }, collapsed: ["Garden"], opts: { heat: true, focus: "x" } });
  assert.deepEqual(plain(s), { opts: { grouping: "tag", heat: true }, view: null, posBy: { tag: { "light.a": [1, 2] } }, collapsedBy: { tag: ["Garden"] } });
  assert.equal(parseSaved({ posBy: {} }, { legacy: true })?.opts.grouping, "tag");
});

test("with no saved grouping, the integration's default applies", () => {
  assert.equal(parseSaved({ v: 3 }, { grouping: "category" })?.opts.grouping, "category");
});

test("a bad value costs that value, not the layout", () => {
  const s = parseSaved({
    v: 3,
    opts: { grouping: "__proto__", conditions: "yes", heat: 1, extra: true },
    view: { x: 0, y: 0, k: 1e9 },
    posBy: {
      area: { ok: [1, 2], str: ["1", 2], nan: [NaN, 0], inf: [Infinity, 0], far: [1e12, 0], short: [1], obj: { x: 1 }, [`${"x".repeat(600)}`]: [0, 0] },
      evil: { a: [0, 0] },
      __proto__: { polluted: [0, 0] },
    },
    collapsedBy: { area: ["Kitchen", 3, null, "Kitchen", "x".repeat(600)], tag: "Kitchen" },
  });
  assert.ok(s);
  assert.deepEqual(plain(s.opts), { grouping: "area" });
  assert.equal(s.view, null);
  assert.deepEqual(Object.keys(s.posBy), ["area"]);
  assert.deepEqual(plain(s.posBy.area), { ok: [1, 2] });
  assert.deepEqual(s.collapsedBy.area, ["Kitchen"]);
  assert.deepEqual(s.collapsedBy.tag, []);
  assert.equal(/** @type {any} */ ({}).polluted, undefined);
});

test("a node id that names an Object method finds nothing it wasn't given", () => {
  const s = parseSaved({ v: 3, posBy: { area: {} } });
  assert.equal(s?.posBy.area.constructor, undefined);
  assert.equal(s?.posBy.area.toString, undefined);
});

test("huge layouts are cut to a bound", () => {
  const area = Object.fromEntries(Array.from({ length: 25000 }, (_, i) => [`light.l${i}`, [i, i]]));
  const s = parseSaved({ v: 3, posBy: { area }, collapsedBy: { area: Array.from({ length: 5000 }, (_, i) => `z${i}`) } });
  assert.equal(Object.keys(s?.posBy.area || {}).length, 20000);
  assert.equal(s?.collapsedBy.area.length, 2000);
});

test("a layout from a newer version is read for what it shares", () => {
  const s = parseSaved({ v: 9, posBy: { area: { a: [1, 1] } }, future: { anything: true } });
  assert.deepEqual(plain(s?.posBy), { area: { a: [1, 1] } });
});
