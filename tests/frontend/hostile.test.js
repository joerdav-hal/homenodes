import assert from "node:assert/strict";
import { test } from "node:test";
import { HOSTILE, makeHostile, makeHouse } from "../../dev/fake-house.js";
import { evalConditions, branchConditions } from "../../custom_components/homenodes/frontend/conditions.js";
import { buildGraph } from "../../custom_components/homenodes/frontend/graph.js";
import { layout } from "../../custom_components/homenodes/frontend/layout.js";
import { tr } from "../../custom_components/homenodes/frontend/strings.js";

const house = makeHostile(makeHouse({ now: new Date(2026, 10, 20, 18, 30).getTime() }));

test("every grouping builds and lays out with hostile names", () => {
  for (const grouping of /** @type {const} */ (["area", "label", "category", "tag"])) {
    const g = buildGraph({ ...house, grouping });
    assert.ok(g.nodes.length > 40, grouping);
    layout(g.nodes, g.edges, new Map());
    for (const n of g.nodes) {
      assert.equal(typeof n.label, "string", n.id);
      assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `${grouping}: ${n.id} at ${n.x},${n.y}`);
    }
  }
});

test("zones named like Object's own properties stay ordinary zones", () => {
  const byArea = new Set(buildGraph({ ...house, grouping: "area" }).nodes.map((n) => n.cluster));
  assert.ok(byArea.has("__proto__") && byArea.has("constructor"), [...byArea].join(" | "));
  const byLabel = new Set(buildGraph({ ...house, grouping: "label" }).nodes.map((n) => n.cluster));
  assert.ok(byLabel.has("toString"), [...byLabel].join(" | "));
  assert.equal(/** @type {any} */ ({}).polluted, undefined);
});

test("conditions evaluate over the hostile house", () => {
  const g = buildGraph(house);
  const states = Object.fromEntries(house.states.map((s) => [s.entity_id, s]));
  for (const cfg of Object.values(house.configs)) {
    if (!cfg || cfg.error) continue;
    for (const c of [cfg.conditions ?? cfg.condition, ...branchConditions(cfg.actions ?? cfg.action)]) {
      evalConditions(c, { states, resolve: g.resolve, now: new Date(2026, 10, 20, 18, 30) });
    }
  }
});

test("placeholders are filled once, so a name can't fill in another", () => {
  assert.equal(tr("{a} and {b}", { a: "{b}", b: HOSTILE[0] }), `{b} and ${HOSTILE[0]}`);
});
