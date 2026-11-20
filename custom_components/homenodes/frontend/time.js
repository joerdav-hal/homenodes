// Wall-clock time in a given time zone, so conditions and schedules follow Home Assistant's clock
// rather than the browser's. Without a time zone, everything falls back to the browser's.

/**
 * @typedef {object} Parts
 * @property {number} year
 * @property {number} month 1 to 12.
 * @property {number} day
 * @property {number} hour 0 to 23.
 * @property {number} minute
 * @property {number} second
 * @property {number} weekday 0 is Sunday.
 */

/** @type {Map<string, Intl.DateTimeFormat>} */
const formatters = new Map();
/** @param {string} timeZone */
const formatter = (timeZone) => {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
    formatters.set(timeZone, f);
  }
  return f;
};
/** @type {Record<string, number>} */
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * The wall-clock time a moment shows in a time zone.
 * @param {Date | number} t
 * @param {string} [timeZone] An IANA name such as "Europe/London"; the browser's when omitted.
 * @returns {Parts}
 */
export function partsIn(t, timeZone) {
  const d = new Date(t);
  if (!timeZone) return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(), weekday: d.getDay() };
  /** @type {Record<string, string>} */
  const p = {};
  for (const { type, value } of formatter(timeZone).formatToParts(d)) p[type] = value;
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second, weekday: WEEKDAY[p.weekday] };
}

/**
 * The moment a wall-clock time happens in a time zone. Fields may overflow: day 32 is next month.
 * In a daylight-saving gap the time is moved forward, as clocks are.
 * @param {{ year: number, month: number, day: number, hour?: number, minute?: number, second?: number }} wall
 * @param {string} [timeZone]
 * @returns {number} Epoch milliseconds.
 */
export function instantIn({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  if (!timeZone) return new Date(year, month - 1, day, hour, minute, second).getTime();
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  /** How far the zone's clock is ahead of UTC at a moment. @param {number} t */
  const offset = (t) => {
    const p = partsIn(t, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  };
  let t = target - offset(target);
  const again = target - offset(t);
  if (again !== t) t = again;
  return t;
}
