// Each user's saved layout, read defensively: it comes back from storage written by any version,
// or edited by hand, and a bad value must cost that value, never the map.

/** @typedef {import("./graph.js").Grouping} Grouping */
/** @typedef {{ x: number, y: number, k: number }} View */
/**
 * @typedef {object} Saved
 * @property {{ conditions?: boolean, heat?: boolean, grouping: Grouping }} opts
 * @property {View | null} view
 * @property {Record<string, Record<string, [number, number]>>} posBy Positions by grouping, then node id.
 * @property {Record<string, string[]>} collapsedBy Collapsed zones by grouping.
 */

/** The format written now. 1 and 2 were the homelab panel's; 3 added a layout per grouping. */
export const SAVED_VERSION = 3;

/** @type {readonly Grouping[]} */
const GROUPINGS = ["area", "label", "category", "tag"];
const MAX_NODES = 20000;
const MAX_ZONES = 2000;
const MAX_ID = 512;
const FAR = 1e7;
export const ZOOM = { min: 0.05, max: 2.5 };

/** @param {unknown} x @returns {x is Record<string, unknown>} */
const isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);
/** @param {unknown} x @returns {x is number} */
const near = (x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < FAR;

/** @param {unknown} raw @returns {Record<string, [number, number]>} */
const positions = (raw) => {
  /** @type {Record<string, [number, number]>} */
  const out = Object.create(null);
  if (!isObject(raw)) return out;
  let n = 0;
  for (const [id, p] of Object.entries(raw)) {
    if (n >= MAX_NODES) break;
    if (id.length > MAX_ID || !Array.isArray(p) || !near(p[0]) || !near(p[1])) continue;
    out[id] = [p[0], p[1]];
    n++;
  }
  return out;
};

/** @param {unknown} raw @returns {string[]} */
const zones = (raw) => (Array.isArray(raw) ? [...new Set(raw.filter((z) => typeof z === "string" && z.length <= MAX_ID))].slice(0, MAX_ZONES) : []);

/**
 * @template T
 * @param {unknown} raw
 * @param {(v: unknown) => T} each
 * @returns {Record<string, T>}
 */
const byGrouping = (raw, each) => {
  /** @type {Record<string, T>} */
  const out = Object.create(null);
  if (isObject(raw)) for (const g of GROUPINGS) if (g in raw) out[g] = each(raw[g]);
  return out;
};

/**
 * A saved layout, from any version, or null if there is nothing usable.
 * @param {unknown} raw What frontend/get_user_data returned.
 * @param {{ legacy?: boolean, grouping?: Grouping }} [how] legacy: read from the old key.
 *   grouping: the default when none was saved.
 * @returns {Saved | null}
 */
export function parseSaved(raw, { legacy = false, grouping = "area" } = {}) {
  if (!isObject(raw)) return null;
  // Before version 3 there was one layout, grouped by [Tag].
  const old = legacy || raw.v === 1 || raw.v === 2 || (raw.v !== SAVED_VERSION && !isObject(raw.posBy) && isObject(raw.pos));
  const o = isObject(raw.opts) ? raw.opts : {};
  /** @type {Saved["opts"]} */
  const opts = { grouping: GROUPINGS.find((g) => g === o.grouping) || (old ? "tag" : grouping) };
  if (typeof o.conditions === "boolean") opts.conditions = o.conditions;
  if (typeof o.heat === "boolean") opts.heat = o.heat;
  const v = raw.view;
  const view = isObject(v) && near(v.x) && near(v.y) && typeof v.k === "number" && v.k >= ZOOM.min && v.k <= ZOOM.max ? { x: v.x, y: v.y, k: v.k } : null;
  return {
    opts,
    view,
    posBy: old ? byGrouping({ tag: raw.pos }, positions) : byGrouping(raw.posBy, positions),
    collapsedBy: old ? byGrouping({ tag: raw.collapsed }, zones) : byGrouping(raw.collapsedBy, zones),
  };
}

/**
 * What to store.
 * @param {{ posBy: Saved["posBy"], collapsedBy: Saved["collapsedBy"], view: View, opts: { conditions: boolean, heat: boolean, grouping: Grouping } }} layout
 */
export const serializeSaved = ({ posBy, collapsedBy, view, opts }) => ({
  v: SAVED_VERSION,
  posBy,
  collapsedBy,
  view,
  opts: { conditions: opts.conditions, heat: opts.heat, grouping: opts.grouping },
});
