// Blueprint automations and scripts store only "this blueprint, these inputs". Home Assistant's
// blueprint/substitute turns that into the config that actually runs, which is what we draw.

import { tr } from "./strings.js";

/** @typedef {import("../../../types/ha").Config} Config */

/**
 * @typedef {object} BlueprintUse
 * @property {string} path The blueprint file, relative to the blueprints folder.
 * @property {Record<string, any>} input
 * @property {string} [error] Why it could not be expanded.
 */

/** Too many blueprint calls at once would only queue inside Home Assistant anyway. */
const AT_ONCE = 6;

/**
 * Expand every config that uses a blueprint.
 * @param {Record<string, Config>} configs By entity id; unreadable ones are `{ error }` and pass through.
 * @param {"automation" | "script"} domain
 * @param {(message: Record<string, any>) => Promise<any>} send A WebSocket call.
 * @param {Map<string, Promise<Config>>} [cache] Expansions by blueprint and inputs, kept between reloads.
 * @returns {Promise<{ configs: Record<string, Config>, blueprints: Record<string, BlueprintUse> }>}
 *   The configs to draw, and for each blueprint one, what it uses and any error.
 */
export async function expandBlueprints(configs, domain, send, cache = new Map()) {
  /** @type {Record<string, Config>} */
  const out = { ...configs };
  /** @type {Record<string, BlueprintUse>} */
  const blueprints = {};
  const todo = Object.entries(configs).filter(([, c]) => c && !c.error && c.use_blueprint?.path);
  /** @param {string} eid @param {Config} cfg */
  const expand = async (eid, cfg) => {
    const { path, input = {} } = cfg.use_blueprint;
    blueprints[eid] = { path, input };
    const key = JSON.stringify([domain, path, input]);
    if (!cache.has(key)) cache.set(key, send({ type: "blueprint/substitute", domain, path, input }).then((r) => r.substituted_config));
    try {
      const expanded = await /** @type {Promise<Config>} */ (cache.get(key));
      // Keep what identifies the automation; take what it does from the blueprint.
      const { use_blueprint, ...own } = cfg;
      out[eid] = { ...expanded, ...own };
    } catch (e) {
      cache.delete(key);
      const err = /** @type {{ code?: string, message?: string }} */ (e);
      blueprints[eid].error = err?.code === "unknown_command" ? tr("This version of Home Assistant can't expand blueprints") : err?.message || tr("Couldn't read the blueprint");
    }
  };
  for (let i = 0; i < todo.length; i += AT_ONCE) await Promise.all(todo.slice(i, i + AT_ONCE).map(([eid, cfg]) => expand(eid, cfg)));
  return { configs: out, blueprints };
}

/** The blueprint's file name without folders or extension, for display. @param {string} path */
export const blueprintName = (path) => path.split("/").pop()?.replace(/\.ya?ml$/, "").replace(/[_-]+/g, " ") || path;
