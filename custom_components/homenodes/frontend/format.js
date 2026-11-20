// Turning times, states and configs into text.

import { tr } from "./strings.js";

/** @typedef {import("../../../types/ha").HassEntity} HassEntity */

/**
 * How long ago, without the "ago": "just now", "5m", "3h", "2d" or "never".
 * @param {string | number | Date | null | undefined} iso
 * @param {number} [ref] The moment to measure from, epoch milliseconds.
 */
export const duration = (iso, ref = Date.now()) => {
  if (!iso) return tr("never");
  const s = (ref - new Date(iso).getTime()) / 1000;
  if (s < 45) return tr("just now");
  if (s < 3600) return tr("{n}m", { n: Math.round(s / 60) });
  if (s < 86400) return tr("{n}h", { n: Math.round(s / 3600) });
  return tr("{n}d", { n: Math.round(s / 86400) });
};

/**
 * "just now", "5m ago", "3h ago", "2d ago" or "never".
 * @param {string | number | Date | null | undefined} iso
 * @param {number} [ref]
 */
export const ago = (iso, ref = Date.now()) => {
  if (!iso) return tr("never");
  if ((ref - new Date(iso).getTime()) / 1000 < 45) return tr("just now");
  return tr("{time} ago", { time: duration(iso, ref) });
};

/** "now", "in 5m", "in 2h 14m" or "in 3d". @param {number} ms */
export const inFmt = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 1) return tr("now");
  if (m < 60) return tr("in {n}m", { n: m });
  const hh = Math.floor(m / 60);
  return hh < 24 ? tr("in {h}h {m}m", { h: hh, m: m % 60 }) : tr("in {n}d", { n: Math.round(hh / 24) });
};

/** @typedef {{ language?: string, hour12?: boolean, timeZone?: string }} TimeFormat */
/** @type {TimeFormat} */
let timeFormat = {};
/**
 * How clock times are written: the user's language, 12 or 24 hours, and the time zone to show.
 * The panel sets this from Home Assistant's profile settings.
 * @param {TimeFormat} format
 */
export const setTimeFormat = (format) => { timeFormat = { ...format }; };
/** @param {Intl.DateTimeFormatOptions} options */
const withFormat = (options) => ({ ...options, hour12: timeFormat.hour12, timeZone: timeFormat.timeZone });

/** @param {string | number | Date} t */
export const clock = (t) => new Date(t).toLocaleTimeString(timeFormat.language ?? [], withFormat({ hour: "2-digit", minute: "2-digit", second: "2-digit" }));
/** @param {string | number | Date} t */
export const hhmm = (t) => new Date(t).toLocaleTimeString(timeFormat.language ?? [], withFormat({ hour: "2-digit", minute: "2-digit" }));
/** A weekday and time, for the history scrubber. @param {string | number | Date} t */
export const dayTime = (t) => new Date(t).toLocaleString(timeFormat.language ?? [], withFormat({ weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }));

/**
 * An entity's state as a person would read it: units, rounding, and times as "ago".
 * @param {HassEntity | undefined | null} st
 * @param {number} [ref]
 */
export const fmtState = (st, ref) => {
  if (!st) return tr("missing");
  if (st.state === "unavailable") return tr("unavailable");
  const u = st.attributes?.unit_of_measurement;
  let v = st.state;
  if (/^\d{4}-\d\d-\d\dT/.test(v)) v = ago(v, ref);
  else if (u && !isNaN(Number(v))) v = `${Math.round(Number(v) * 10) / 10} ${u}`;
  return v;
};

/**
 * A config as YAML, for reading in the inspector.
 * @param {unknown} v
 * @param {string} [ind]
 * @returns {string}
 */
export const yaml = (v, ind = "") => {
  if (Array.isArray(v)) return v.length ? v.map((x) => `${ind}- ${yaml(x, `${ind}  `).trimStart()}`).join("\n") : "[]";
  if (v && typeof v === "object") {
    const o = /** @type {Record<string, unknown>} */ (v);
    const ks = Object.keys(o);
    if (!ks.length) return "{}";
    return ks.map((k) => {
      const x = o[k];
      const nested = x && typeof x === "object" && (Array.isArray(x) ? x.length : Object.keys(x).length);
      return nested ? `${ind}${k}:\n${yaml(x, `${ind}  `)}` : `${ind}${k}: ${yaml(x)}`;
    }).join("\n");
  }
  if (typeof v === "string") return v.includes("\n") ? `|\n${v.trimEnd().split("\n").map((l) => `${ind}  ${l}`).join("\n")}` : /^$|^\s|\s$|[:#{}[\],&*?|<>=!%@`'"]/.test(v) ? JSON.stringify(v) : v;
  return String(v);
};
