// When a clock-like trigger next fires, on Home Assistant's clock.

import { durSecs } from "./conditions.js";
import { instantIn, partsIn } from "./time.js";

/** @typedef {import("./graph.js").Schedule} Schedule */
/** @typedef {import("../../../types/ha").HassEntities} HassEntities */

/**
 * @param {Schedule | null | undefined} sch
 * @param {Date} now
 * @param {HassEntities} states
 * @param {string} [timeZone] Home Assistant's time zone; the browser's if omitted.
 * @returns {Date | null}
 */
export function nextAt(sch, now, states, timeZone) {
  if (!sch) return null;
  const t = now.getTime();
  const z = partsIn(now, timeZone);
  /** @param {Partial<import("./time.js").Parts>} change */
  const at = (change) => instantIn({ ...z, ...change }, timeZone);
  if (sch.type === "time") {
    const [hour, minute, second = 0] = sch.at.split(":").map(Number);
    const today = at({ hour, minute, second });
    return new Date(today > t ? today : at({ day: z.day + 1, hour, minute, second }));
  }
  if (sch.type === "sun") {
    const base = states["sun.sun"]?.attributes?.[sch.event === "sunset" ? "next_setting" : "next_rising"];
    if (!base) return null;
    let next = new Date(base).getTime() + (durSecs(sch.offset) || 0) * 1000;
    if (next <= t) next += 86400e3;
    return new Date(next);
  }
  if (sch.type === "pattern") {
    /** @param {any} v */
    const step = (v) => (typeof v === "string" && v.startsWith("/") ? Number(v.slice(1)) : null);
    const [hs, ms, ss] = [step(sch.hours), step(sch.minutes), step(sch.seconds)];
    if (ss) return new Date(at({ second: Math.floor(z.second / ss) * ss + ss }));
    if (ms) return new Date(at({ minute: Math.floor(z.minute / ms) * ms + ms, second: 0 }));
    if (hs) return new Date(at({ hour: Math.floor(z.hour / hs) * hs + hs, minute: 0, second: 0 }));
    if (sch.minutes != null && !isNaN(Number(sch.minutes))) {
      const minute = Number(sch.minutes);
      const thisHour = at({ minute, second: 0 });
      return new Date(thisHour > t ? thisHour : at({ hour: z.hour + 1, minute, second: 0 }));
    }
  }
  return null;
}
