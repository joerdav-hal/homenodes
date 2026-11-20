// Building DOM and SVG without HTML strings: every bit of text is set as text, never parsed.

import { tr } from "./strings.js";

export const NS = "http://www.w3.org/2000/svg";

/**
 * An HTML element. Props starting "on" become listeners; null and false are skipped.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [props]
 * @param {...any} kids Nodes or strings; strings become text nodes.
 * @returns {HTMLElementTagNameMap[K]}
 */
export const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k);
  return el;
};

/**
 * An SVG element, appended to parent if given.
 * @template {keyof SVGElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [attrs]
 * @param {Element} [parent]
 * @returns {SVGElementTagNameMap[K]}
 */
export const s = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
};

// One stroke icon set, drawn for this panel on a 24-unit grid.
/** @type {Record<string, string>} */
export const ICONS = {
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1.2.9 2V16h5.4v-.2c0-.8.3-1.5.9-2A6 6 0 0 0 12 3z",
  toggle: "M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7zM8 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5",
  sensor: "M12 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3M8.5 8.5a5 5 0 0 0 0 7M15.5 15.5a5 5 0 0 0 0-7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 18.4a9 9 0 0 0 0-12.8",
  gauge: "M4 18a8 8 0 1 1 16 0M12 18l4-6",
  person: "M12 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7M5 20a7 7 0 0 1 14 0",
  pin: "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 8a2 2 0 1 0 0 4a2 2 0 1 0 0-4",
  play: "M8 5.5v13l10.5-6.5z",
  pause: "M8.5 5v14M15.5 5v14",
  thermo: "M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z",
  form: "M4 7h16M4 12h11M4 17h7",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7.5V12l3 2",
  sun: "M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4",
  repeat: "M17 3l3 3-3 3M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4",
  power: "M12 3v8M6.4 6.4a8 8 0 1 0 11.2 0",
  send: "M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z",
  chip: "M7 7h10v10H7zM10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5",
  layers: "M12 3 3 7.5l9 4.5 9-4.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 10.5a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
  scene: "M4 5h16v14H4zM4 15l5-5 4 4 2-2 5 5",
  timer: "M10 2.5h4M12 6a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15M12 10v3.5",
  calendar: "M4 6h16v14H4zM4 10h16M8 3.5V7M16 3.5V7",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4",
  remote: "M9 3h6v18H9zM12 7v.01M12 11v.01",
  button: "M5 8h14v8H5zM9 12h6",
  tag: "M3.5 12V4h8l9 9-8 8zM7.5 7.5h.01",
  dot: "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
  search: "M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M15.5 15.5 20 20",
  close: "M6 6l12 12M18 6 6 18",
  more: "M4.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M16.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
  chevron: "M6 9l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7",
  menu: "M4 7h16M4 12h16M4 17h16",
  history: "M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4M12 8v4l3 2",
  pulse: "M3 12h4l2.5-6 5 12 2.5-6h4",
  eye: "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5",
};
/** @type {Record<string, string>} */
export const DOMAIN_ICON = {
  light: "bulb", switch: "toggle", input_boolean: "toggle", fan: "toggle", binary_sensor: "sensor", sensor: "gauge", person: "person",
  device_tracker: "person", zone: "pin", media_player: "play", climate: "thermo", water_heater: "thermo", input_select: "form", select: "form",
  input_text: "form", input_number: "form", number: "form", input_datetime: "clock", schedule: "clock", timer: "timer", scene: "scene",
  script: "list", automation: "bolt", camera: "camera", notify: "send", button: "button", input_button: "button", sun: "sun", calendar: "calendar",
  remote: "remote", siren: "bell", tag: "tag", image: "camera", event: "bolt",
};
/** What a domain's entities are called, for the inspector. @param {string} domain @returns {string | null} */
export const domainName = (domain) => {
  switch (domain) {
    case "light": return tr("Light");
    case "switch": return tr("Switch");
    case "input_boolean": return tr("Toggle helper");
    case "fan": return tr("Fan");
    case "binary_sensor": case "sensor": return tr("Sensor");
    case "person": return tr("Person");
    case "device_tracker": return tr("Tracker");
    case "zone": return tr("Zone");
    case "media_player": return tr("Media player");
    case "climate": return tr("Thermostat");
    case "input_select": return tr("Dropdown helper");
    case "select": return tr("Select");
    case "input_text": return tr("Text helper");
    case "input_number": return tr("Number helper");
    case "number": return tr("Number");
    case "input_datetime": return tr("Date and time helper");
    case "schedule": return tr("Schedule");
    case "timer": return tr("Timer");
    case "scene": return tr("Scene");
    case "camera": return tr("Camera");
    case "button": return tr("Button");
    case "sun": return tr("Sun");
    case "calendar": return tr("Calendar");
    case "remote": return tr("Remote");
    case "siren": return tr("Siren");
    default: return null;
  }
};

/** The icon a node is drawn with. @param {{ kind: string, id: string, schedule?: { type: string } | null }} n */
export const nodeIcon = (n) => {
  if (n.kind === "automation") return "bolt";
  if (n.kind === "script") return "list";
  if (n.kind === "time") return n.schedule?.type === "sun" ? "sun" : n.schedule?.type === "pattern" ? "repeat" : n.schedule ? "clock" : "power";
  if (n.kind === "service") return "send";
  if (n.kind === "device") return "chip";
  if (n.kind === "virtual" || n.kind === "group") return "layers";
  return DOMAIN_ICON[n.id.split(".")[0]] || "dot";
};

/** An inline icon for HTML. @param {string} name @param {number} [size] @param {string} [cls] */
export const icon = (name, size = 16, cls = "") => {
  const el = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, class: `ico ${cls}`.trim(), "aria-hidden": "true" })) el.setAttribute(k, String(v));
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", ICONS[name] || ICONS.dot);
  el.append(p);
  return el;
};

/**
 * The line style a wire's role is drawn in, for lists and the key.
 * @param {string} role "trigger", "condition", "action" or "live"
 * @param {boolean | null} [verdict] For a condition: whether it passes now.
 */
export const glyph = (role, verdict) => {
  const el = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ width: 18, height: 8, viewBox: "0 0 18 8", class: "glyph", "aria-hidden": "true" })) el.setAttribute(k, String(v));
  const colour = role === "trigger" || role === "live" ? "var(--in)" : role === "action" ? "var(--out)" : verdict === true ? "var(--pass)" : verdict === false ? "var(--block)" : "var(--muted)";
  const l = document.createElementNS(NS, "line");
  for (const [k, v] of Object.entries({ x1: 1.5, y1: 4, x2: 16.5, y2: 4, "stroke-width": 2, "stroke-linecap": "round" })) l.setAttribute(k, String(v));
  l.setAttribute("style", `stroke: ${colour}`);
  if (role === "condition") l.setAttribute("stroke-dasharray", "2.5 3");
  if (role === "live") l.setAttribute("stroke-dasharray", "4 3");
  el.append(l);
  return el;
};
