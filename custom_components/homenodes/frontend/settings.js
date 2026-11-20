// What the integration's options ask of the panel. They arrive from outside, so each is checked.

/** @typedef {import("./graph.js").Grouping} Grouping */
/**
 * @typedef {object} PanelSettings
 * @property {boolean} controls Buttons and dots that change things.
 * @property {Grouping} grouping Used until someone picks one from the View menu.
 * @property {number} heatDays How far back activity heat counts runs.
 * @property {string[]} hiddenLabels Automations and scripts with these labels are left out.
 */

/** @type {readonly Grouping[]} */
const GROUPINGS = ["area", "label", "category", "tag"];

/**
 * Settings from the panel Home Assistant gives the element. With no config, as when the panel is
 * added by hand with panel_custom, everything behaves as it did before there were options.
 * @param {{ config?: unknown } | null | undefined} panel
 * @returns {PanelSettings}
 */
export const panelSettings = (panel) => {
  const raw = panel?.config;
  /** @type {Record<string, unknown>} */
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : {};
  const grouping = GROUPINGS.find((g) => g === c.default_grouping);
  const days = c.heat_days;
  return {
    controls: typeof c.controls === "boolean" ? c.controls : true,
    grouping: grouping || "area",
    heatDays: typeof days === "number" && Number.isInteger(days) && days >= 1 && days <= 30 ? days : 7,
    hiddenLabels: Array.isArray(c.hidden_labels) ? c.hidden_labels.filter((l) => typeof l === "string") : [],
  };
};

/** Whether two settings differ, to know when the map needs reading again. @param {PanelSettings} a @param {PanelSettings} b */
export const settingsChanged = (a, b) =>
  a.controls !== b.controls || a.grouping !== b.grouping || a.heatDays !== b.heatDays ||
  a.hiddenLabels.length !== b.hiddenLabels.length || a.hiddenLabels.some((l, i) => l !== b.hiddenLabels[i]);

/**
 * Entity ids to leave off the map: those carrying any hidden label.
 * @param {{ entity_id: string, labels?: string[] }[]} entities The entity registry.
 * @param {string[]} hiddenLabels
 * @returns {Set<string>}
 */
export const hiddenEntities = (entities, hiddenLabels) => {
  if (!hiddenLabels.length) return new Set();
  const hide = new Set(hiddenLabels);
  return new Set(entities.filter((e) => e.labels?.some((l) => hide.has(l))).map((e) => e.entity_id));
};
