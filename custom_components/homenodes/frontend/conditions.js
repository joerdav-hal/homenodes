// Conditions evaluated in the browser from live states, so the map can say what blocks what.

import { ago } from "./format.js";
import { asList, isTemplate } from "./util.js";

/** @typedef {import("../../../types/ha").HassEntities} HassEntities */
/** @typedef {boolean | null} Tri */
/**
 * What an atomic condition saw and wanted, so a reason can say what is wrong.
 * @typedef {{ actual?: string, wanted?: string, template?: boolean, text?: string }} Why
 */
/** @typedef {(id: string, ok: Tri, why?: Why) => void} Report */
/** @typedef {{ result: unknown, entities?: string[] }} TemplateResult */
/**
 * @typedef {object} EvalOptions
 * @property {HassEntities} states
 * @property {Date} [now]
 * @property {Map<string, TemplateResult>} [tpl] Live render_template results by template text.
 * @property {(v: any) => string[]} resolve Turns entity_id-like values into entity ids.
 * @property {Report} [report] Called for every entity (or "time:…") an atomic condition looked at.
 * @property {(template: string) => boolean} [skipTpl] Templates that cannot be known ahead.
 */

/** @param {Tri[]} rs @returns {Tri} */
const and3 = (rs) => (rs.includes(false) ? false : rs.includes(null) ? null : true);
/** @param {Tri[]} rs @returns {Tri} */
const or3 = (rs) => (rs.includes(true) ? true : rs.includes(null) ? null : false);

/**
 * A duration in seconds: "01:30:00", "-00:30:00", 90, or { minutes: 1 }. Null for a template.
 * @param {any} d
 * @returns {number | null}
 */
export const durSecs = (d) => {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  if (typeof d === "string") {
    if (isTemplate(d)) return null;
    const neg = d.trim().startsWith("-");
    const p = d.replace("-", "").split(":").map(Number);
    const v = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 3600 + p[1] * 60 : p[0];
    return neg ? -v : v;
  }
  return (d.days || 0) * 86400 + (d.hours || 0) * 3600 + (d.minutes || 0) * 60 + (d.seconds || 0);
};

/** Seconds since midnight for "HH:MM[:SS]" or an input_datetime's state. @param {any} s @param {HassEntities} states */
const timeOfDay = (s, states) => {
  if (typeof s !== "string") return null;
  if (s.includes(".")) {
    const m = (states[s]?.state || "").match(/(\d\d):(\d\d)(?::(\d\d))?$/);
    return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] || 0) : null;
  }
  const p = s.split(":").map(Number);
  return p[0] * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
};

/**
 * Three-valued: true, false, or null when it cannot be known from here (trigger ids, odd templates).
 * @param {any} conds
 * @param {EvalOptions} options
 * @returns {Tri}
 */
export function evalConditions(conds, { states, now = new Date(), tpl = new Map(), resolve, report = () => {}, skipTpl = () => false }) {
  let rep = report;
  /** @param {string} str @returns {Tri} */
  const tplResult = (str) => {
    if (skipTpl(str)) return null;
    const r = tpl.get(str);
    if (!r || r.result == null) return null;
    const ok = r.result === true || r.result === "True" || r.result === "true" || r.result === "on" || (typeof r.result === "number" && r.result !== 0);
    for (const e of r.entities || []) rep(e, ok, { template: true });
    return ok;
  };
  /** @param {any} v */
  const ids = (v) => resolve(v).filter((e) => e !== "all" && e !== "none");
  /** @param {any} c @returns {Tri} */
  const ev = (c) => {
    if (c == null) return true;
    if (Array.isArray(c)) return and3(c.map(ev));
    if (typeof c === "string") return isTemplate(c) ? tplResult(c) : null;
    if (c.enabled === false) return true;
    switch (c.condition) {
      case "and": return and3(asList(c.conditions).map(ev));
      case "or": return or3(asList(c.conditions).map(ev));
      case "not": {
        // What a "not" looked at counts the other way round.
        const outer = rep;
        rep = (id, ok, why) => outer(id, ok == null ? null : !ok, why && { ...why, wanted: `not ${why.wanted}` });
        const r = or3(asList(c.conditions).map(ev));
        rep = outer;
        return r == null ? null : !r;
      }
      case "state": {
        const es = ids(c.entity_id);
        const wanted = asList(c.state).map(String);
        if (!es.length || wanted.some(isTemplate)) return null;
        const need = durSecs(c.for);
        const rs = es.map((e) => {
          const st = states[e];
          const v = st && (c.attribute ? st.attributes?.[c.attribute] : st.state);
          /** @type {Tri} */
          let ok = !!st && wanted.some((w) => w === String(v) || (w.includes(".") && states[w]?.state === String(v)));
          let actual = st ? String(v) : "missing";
          if (ok && need === null) ok = null;
          else if (ok && need) { ok = (now.getTime() - new Date(st.last_changed).getTime()) / 1000 >= need; if (!ok) actual = `${v} for only ${ago(st.last_changed, now.getTime()).replace(" ago", "")}`; }
          rep(e, ok, { actual, wanted: `${wanted.join(" or ")}${need ? ` for ${typeof c.for === "string" ? c.for : JSON.stringify(c.for)}` : ""}` });
          return ok;
        });
        return c.match === "any" ? or3(rs) : and3(rs);
      }
      case "numeric_state": {
        const es = ids(c.entity_id);
        if (!es.length || c.value_template) return null;
        /** @param {any} v @returns {number | null} */
        const lim = (v) => (v == null ? null : typeof v === "number" ? v : isTemplate(v) ? NaN : isNaN(Number(v)) ? Number(states[v]?.state) : Number(v));
        const above = lim(c.above), below = lim(c.below);
        if (Number.isNaN(above) || Number.isNaN(below)) return null;
        const rs = es.map((e) => {
          const st = states[e];
          const n = Number(c.attribute ? st?.attributes?.[c.attribute] : st?.state);
          const ok = !!st && !isNaN(n) && (above == null || n > above) && (below == null || n < below);
          rep(e, ok, { actual: st ? String(c.attribute ? st.attributes?.[c.attribute] : st.state) : "missing", wanted: [above != null ? `above ${above}` : "", below != null ? `below ${below}` : ""].filter(Boolean).join(" and ") });
          return ok;
        });
        return and3(rs);
      }
      case "time": {
        const t = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const a = c.after != null ? timeOfDay(c.after, states) : null;
        const b = c.before != null ? timeOfDay(c.before, states) : null;
        if ((c.after != null && a == null) || (c.before != null && b == null)) return null;
        let ok = a != null && b != null ? (a <= b ? t >= a && t < b : t >= a || t < b) : a != null ? t >= a : b != null ? t < b : true;
        if (c.weekday) ok = ok && asList(c.weekday).includes(["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()]);
        /** @param {any} x */
        const hm = (x) => (typeof x === "string" && !x.includes(".") ? x.replace(/^(\d\d?:\d\d):00$/, "$1") : x);
        const span = c.after != null && c.before != null ? `${hm(c.after)}–${hm(c.before)}` : c.after != null ? `after ${hm(c.after)}` : c.before != null ? `before ${hm(c.before)}` : "";
        const days = c.weekday ? asList(c.weekday).join(", ") : "";
        rep(`time:${span}|${days}`, ok, { text: span ? `outside ${span}${days ? ` on ${days}` : ""}` : `only runs on ${days}` });
        for (const x of [c.after, c.before]) if (typeof x === "string" && x.includes(".")) rep(x, ok);
        return ok;
      }
      case "template": return tplResult(c.value_template);
      case "zone": {
        const es = ids(c.entity_id), zs = ids(c.zone);
        if (!es.length || !zs.length) return null;
        const rs = es.map((e) => {
          const s = states[e]?.state;
          const ok = zs.some((z) => (z === "zone.home" ? s === "home" : s === states[z]?.attributes?.friendly_name));
          rep(e, ok, { actual: s ?? "missing", wanted: zs.map((z) => (z === "zone.home" ? "home" : states[z]?.attributes?.friendly_name || z)).join(" or ") });
          return ok;
        });
        zs.forEach((z) => rep(z, and3(rs)));
        return and3(rs);
      }
      case "sun": {
        const sun = states["sun.sun"];
        if (!sun || c.after_offset || c.before_offset) return null;
        const up = sun.state === "above_horizon", pm = now.getHours() >= 12;
        const k = `${c.after || ""}|${c.before || ""}`;
        /** @type {Record<string, boolean>} */
        const table = { "sunset|": !up && pm, "|sunrise": !up && !pm, "sunrise|sunset": up, "sunset|sunrise": !up, "sunrise|": up || pm, "|sunset": up || !pm };
        const ok = table[k];
        if (ok == null) return null;
        rep("sun.sun", ok, { actual: sun.state.replace("_", " "), wanted: [c.after && `after ${c.after}`, c.before && `before ${c.before}`].filter(Boolean).join(", ") });
        return ok;
      }
      case "device": {
        const es = ids(c.entity_id);
        if (!es.length || !["is_on", "is_off"].includes(c.type)) return null;
        const want = c.type === "is_on" ? "on" : "off";
        return and3(es.map((e) => { const ok = states[e]?.state === want; rep(e, ok, { actual: states[e]?.state ?? "missing", wanted: want }); return ok; }));
      }
      default: return null;
    }
  };
  return ev(conds);
}

/**
 * Every condition block inside an action sequence: choose options, if, repeat, condition steps.
 * @param {any} steps
 * @param {any[]} [out]
 * @returns {any[]}
 */
export function branchConditions(steps, out = []) {
  for (const s of asList(steps)) {
    if (!s || typeof s !== "object" || s.enabled === false) continue;
    if (s.choose) { asList(s.choose).forEach((o) => { out.push(o.conditions); branchConditions(o.sequence, out); }); branchConditions(s.default, out); }
    else if (s.if) { out.push(s.if); branchConditions(s.then, out); branchConditions(s.else, out); }
    else if (s.repeat) { out.push(s.repeat.until, s.repeat.while); branchConditions(s.repeat.sequence, out); }
    else if (s.parallel) asList(s.parallel).forEach((p) => branchConditions(p?.sequence ?? p, out));
    else if (s.sequence) branchConditions(s.sequence, out);
    else if (s.condition) out.push(s);
  }
  return out.filter((c) => c != null);
}
