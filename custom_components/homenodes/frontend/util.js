// Small helpers shared by every module.

/**
 * @template T
 * @param {T | T[] | null | undefined} v
 * @returns {T[]}
 */
export const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** An entity registry id, which UI device automations use in place of an entity id. @param {unknown} s */
export const isRegId = (s) => typeof s === "string" && /^[0-9a-f]{32}$/.test(s);

/** @param {unknown} s @returns {boolean} */
export const isTemplate = (s) => typeof s === "string" && /\{\{|\{%/.test(s);

/** A stable hue for a string. @param {string | null | undefined} s */
export const hue = (s) => { let h = 7; for (const c of s || "") h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/**
 * @template {string | null | undefined} T
 * @param {T} t
 * @returns {T}
 */
export const capital = (t) => /** @type {T} */ (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
