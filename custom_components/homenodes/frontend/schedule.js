// When a clock-like trigger next fires.

import { durSecs } from "./conditions.js";

/** @typedef {import("./graph.js").Schedule} Schedule */
/** @typedef {import("../../../types/ha").HassEntities} HassEntities */

/**
 * @param {Schedule | null | undefined} sch
 * @param {Date} now
 * @param {HassEntities} states
 * @returns {Date | null}
 */
export function nextAt(sch, now, states) {
  if (!sch) return null;
  const d = new Date(now);
  d.setMilliseconds(0);
  if (sch.type === "time") {
    const [hh, mm, ss] = sch.at.split(":").map(Number);
    d.setHours(hh, mm, ss || 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  if (sch.type === "sun") {
    const base = states["sun.sun"]?.attributes?.[sch.event === "sunset" ? "next_setting" : "next_rising"];
    if (!base) return null;
    let t = new Date(base).getTime() + (durSecs(sch.offset) || 0) * 1000;
    if (t <= now.getTime()) t += 86400e3;
    return new Date(t);
  }
  if (sch.type === "pattern") {
    /** @param {any} v */
    const step = (v) => (typeof v === "string" && v.startsWith("/") ? Number(v.slice(1)) : null);
    const [hs, ms, ss] = [step(sch.hours), step(sch.minutes), step(sch.seconds)];
    if (ss) { d.setSeconds(Math.floor(d.getSeconds() / ss) * ss + ss); return d; }
    d.setSeconds(0);
    if (ms) { d.setMinutes(Math.floor(d.getMinutes() / ms) * ms + ms); return d; }
    if (hs) { d.setMinutes(0); d.setHours(Math.floor(d.getHours() / hs) * hs + hs); return d; }
    if (sch.minutes != null && !isNaN(Number(sch.minutes))) {
      d.setMinutes(Number(sch.minutes));
      if (d <= now) d.setHours(d.getHours() + 1);
      return d;
    }
  }
  return null;
}
