import assert from "node:assert/strict";
import { test } from "node:test";
import { hiddenEntities, panelSettings, settingsChanged } from "../../custom_components/homenodes/frontend/settings.js";

/** @type {import("../../custom_components/homenodes/frontend/settings.js").PanelSettings} */
const DEFAULT = { controls: true, grouping: "area", heatDays: 7, hiddenLabels: [] };

test("a panel with no config behaves as before options existed", () => {
  assert.deepEqual(panelSettings(undefined), DEFAULT);
  assert.deepEqual(panelSettings({}), DEFAULT);
  assert.deepEqual(panelSettings({ config: { _panel_custom: { name: "homenodes-panel" } } }), DEFAULT);
});

test("reads the integration's options", () => {
  const config = { controls: false, default_grouping: "label", heat_days: 14, hidden_labels: ["private"], _panel_custom: {} };
  assert.deepEqual(panelSettings({ config }), { controls: false, grouping: "label", heatDays: 14, hiddenLabels: ["private"] });
});

test("replaces anything malformed with its default", () => {
  for (const config of [null, [], "x", 5]) assert.deepEqual(panelSettings({ config }), DEFAULT);
  const s = panelSettings({ config: { controls: "no", default_grouping: "__proto__", heat_days: 7.5, hidden_labels: ["a", 3, null, { x: 1 }] } });
  assert.deepEqual(s, { ...DEFAULT, hiddenLabels: ["a"] });
  assert.equal(panelSettings({ config: { heat_days: 0 } }).heatDays, 7);
  assert.equal(panelSettings({ config: { heat_days: 31 } }).heatDays, 7);
  assert.equal(panelSettings({ config: { heat_days: "14" } }).heatDays, 7);
  assert.equal(panelSettings({ config: { hidden_labels: "private" } }).hiddenLabels.length, 0);
});

test("notices any change", () => {
  assert.equal(settingsChanged(DEFAULT, { ...DEFAULT }), false);
  assert.equal(settingsChanged(DEFAULT, { ...DEFAULT, controls: false }), true);
  assert.equal(settingsChanged(DEFAULT, { ...DEFAULT, heatDays: 3 }), true);
  assert.equal(settingsChanged({ ...DEFAULT, hiddenLabels: ["a"] }, { ...DEFAULT, hiddenLabels: ["b"] }), true);
  assert.equal(settingsChanged({ ...DEFAULT, hiddenLabels: ["a"] }, { ...DEFAULT, hiddenLabels: ["a", "b"] }), true);
});

test("hides entities that carry any hidden label", () => {
  const entities = [
    { entity_id: "automation.a", labels: ["private", "lighting"] },
    { entity_id: "automation.b", labels: ["lighting"] },
    { entity_id: "script.c", labels: ["security"] },
    { entity_id: "script.d" },
  ];
  assert.deepEqual([...hiddenEntities(entities, ["private", "security"])], ["automation.a", "script.c"]);
  assert.equal(hiddenEntities(entities, []).size, 0);
});
