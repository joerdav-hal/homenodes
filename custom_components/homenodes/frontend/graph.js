// Reading automation and script configs into a graph of nodes and wires.

import { ROLE_RANK } from "./constants.js";
import { tr } from "./strings.js";
import { asList, isRegId, isTemplate } from "./util.js";

/** @typedef {import("../../../types/ha").Config} Config */
/** @typedef {import("../../../types/ha").HassEntity} HassEntity */
/** @typedef {import("../../../types/ha").EntityRegistryEntry} EntityRegistryEntry */
/** @typedef {import("../../../types/ha").DeviceRegistryEntry} DeviceRegistryEntry */
/** @typedef {import("../../../types/ha").AreaRegistryEntry} AreaRegistryEntry */
/** @typedef {import("../../../types/ha").LabelRegistryEntry} LabelRegistryEntry */
/** @typedef {import("../../../types/ha").CategoryRegistryEntry} CategoryRegistryEntry */
/** @typedef {import("./blueprints.js").BlueprintUse} BlueprintUse */
/**
 * How automations and scripts are gathered into zones.
 * @typedef {"area" | "label" | "category" | "tag"} Grouping
 */

/** @typedef {"automation" | "script" | "entity" | "service" | "virtual" | "device" | "time" | "group"} NodeKind */
/** @typedef {"trigger" | "condition" | "action"} Role */
/**
 * @typedef {{ type: "time", at: string }
 *   | { type: "sun", event: string, offset: any }
 *   | { type: "pattern", hours?: any, minutes?: any, seconds?: any }} Schedule
 */

/**
 * A thing on the map. The graph fills in what it is; the layout and the panel add the rest.
 * @typedef {object} GraphNode
 * @property {string} id
 * @property {NodeKind} kind
 * @property {string} label
 * @property {string} [alias]
 * @property {string | null} [tag]
 * @property {string[]} [tags]
 * @property {string} [cfgId]
 * @property {string | null} [area]
 * @property {boolean} [missing]
 * @property {boolean} [snapshot]
 * @property {string} [broken]
 * @property {string} [summary]
 * @property {Config} [config] What it runs: for a blueprint automation, the expanded config.
 * @property {BlueprintUse} [blueprint]
 * @property {Schedule | null} [schedule]
 * @property {string[]} [dtTriggers]
 * @property {string} [cluster]
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {boolean} [pinned]
 * @property {number} [hx]
 * @property {number} [hy]
 * @property {GraphEdge[]} [wires]
 * @property {GraphEdge[]} [rwires]
 * @property {Map<string, boolean | null>} [condRes]
 * @property {string[] | null} [blocked]
 * @property {SVGGElement} [el]
 * @property {SVGTextElement} [agoEl]
 * @property {SVGTextElement} [sumEl]
 * @property {SVGTextElement} [stateEl]
 * @property {SVGTextElement} [subEl]
 * @property {SVGRectElement} [heatEl]
 * @property {ReturnType<typeof setTimeout>} [flashT]
 */

/**
 * A wire from one node to another.
 * @typedef {object} GraphEdge
 * @property {string} id
 * @property {string} src
 * @property {string} dst
 * @property {Role} role
 * @property {boolean} [learned]
 * @property {GraphNode} [a]
 * @property {GraphNode} [b]
 * @property {any} [ra]
 * @property {any} [rb]
 * @property {SVGPathElement} [el]
 * @property {ReturnType<typeof setTimeout>} [hotT]
 */

/**
 * @typedef {object} Graph
 * @property {GraphNode[]} nodes
 * @property {GraphEdge[]} edges
 * @property {(obj: any, kind: "trigger" | "action" | "condition") => string[]} refsOf
 *   Ids a piece of config refers to, by the same rules as the wires.
 * @property {(v: any) => string[]} resolve Entity ids an entity_id-like value names.
 */

/**
 * @typedef {object} GraphInput
 * @property {HassEntity[]} states
 * @property {Record<string, Config>} configs Automation configs by entity id; `{ error }` if unreadable.
 * @property {Record<string, Config>} [scriptConfigs]
 * @property {EntityRegistryEntry[]} entities
 * @property {DeviceRegistryEntry[]} devices
 * @property {AreaRegistryEntry[]} areas
 * @property {LabelRegistryEntry[]} [labels]
 * @property {Partial<Record<"automation" | "script", CategoryRegistryEntry[]>>} [categories] Category registries by scope.
 * @property {Record<string, BlueprintUse>} [blueprints] Which entities use a blueprint, from expandBlueprints.
 * @property {Grouping} [grouping] Defaults to "area".
 * @property {Set<string>} [hidden] Automations and scripts to leave out; anything using them sees a plain entity.
 */

const PROBE = "\u0000probe";

/** @param {GraphNode | null | undefined} n */
export const isOwner = (n) => n?.kind === "automation" || n?.kind === "script";
/** A step that calls something, as opposed to one that only controls flow. @param {any} x */
export const isLeaf = (x) => x && typeof x === "object" && (typeof (x.action || x.service) === "string" || (x.type && x.domain));

/**
 * @param {GraphInput} input
 * @returns {Graph}
 */
export function buildGraph({ states, configs, scriptConfigs, entities, devices, areas, labels = [], categories = {}, blueprints = {}, grouping = "area", hidden = new Set() }) {
  const stateOf = new Map(states.map((s) => [s.entity_id, s]));
  const regById = new Map(entities.map((e) => [e.id, e]));
  const regByEid = new Map(entities.map((e) => [e.entity_id, e]));
  const devById = new Map(devices.map((d) => [d.id, d]));
  const areaNames = new Map(areas.map((a) => [a.area_id, a.name]));
  const known = [...new Set([...stateOf.keys(), ...regByEid.keys()])].sort((a, b) => b.length - a.length);
  // Results come out in this order (longest first), as they did when every id was searched for.
  const rank = new Map(known.map((eid, i) => [eid, i]));
  /** @param {EntityRegistryEntry | undefined} r */
  const areaIdOf = (r) => r && (r.area_id || (r.device_id ? devById.get(r.device_id)?.area_id : null));
  const live = entities.filter((e) => !e.disabled_by);

  /** @type {Map<string, GraphNode>} */
  const nodes = new Map();
  /** @type {Map<string, GraphEdge>} */
  const edges = new Map();
  /**
   * @param {string} id
   * @param {NodeKind} kind
   * @param {Partial<GraphNode>} [extra]
   * @returns {GraphNode}
   */
  const node = (id, kind, extra = {}) => {
    if (!nodes.has(id)) nodes.set(id, { id, kind, label: id, x: 0, y: 0, w: 0, h: 0, ...extra });
    return /** @type {GraphNode} */ (nodes.get(id));
  };
  /** @param {string} eid */
  const entityNode = (eid) => {
    const a = areaIdOf(regByEid.get(eid));
    return node(eid, "entity", { label: stateOf.get(eid)?.attributes.friendly_name || eid, area: a ? areaNames.get(a) : null, missing: !stateOf.has(eid) });
  };
  /** @param {string} did */
  const deviceNode = (did) => {
    const d = devById.get(did);
    return node(`device:${did}`, "device", { label: d?.name_by_user || d?.name || tr("Unknown device"), area: d?.area_id ? areaNames.get(d.area_id) : null, missing: !d });
  };
  // While probing (refsOf), links are collected instead of drawn.
  /** @type {Set<string> | null} */
  let sink = null;
  /** @param {string} src @param {string} dst @param {Role} role */
  const link = (src, dst, role) => {
    if (sink) { sink.add(src === PROBE ? dst : src); return; }
    if (src === dst) return;
    const id = `${src}>${dst}`;
    const e = edges.get(id);
    if (!e) edges.set(id, { id, src, dst, role });
    else if (ROLE_RANK[role] > ROLE_RANK[e.role]) e.role = role;
  };

  // Known entity ids mentioned anywhere in a template: each run of dotted words is split into its
  // neighbouring pairs, so states.light.porch.state finds light.porch. One pass, not one per id.
  /** @param {string} str */
  const scanTemplate = (str) => {
    /** @type {Set<string>} */
    const found = new Set();
    for (const run of str.match(/[a-z0-9_]+(?:\.[a-z0-9_]+)+/g) || []) {
      const words = run.split(".");
      for (let i = 0; i + 1 < words.length; i++) {
        const eid = `${words[i]}.${words[i + 1]}`;
        if (rank.has(eid)) found.add(eid);
      }
    }
    return [...found].sort((a, b) => /** @type {number} */ (rank.get(a)) - /** @type {number} */ (rank.get(b)));
  };
  /** @param {any} v @returns {string[]} */
  const resolve = (v) => {
    /** @type {string[]} */
    const out = [];
    for (const x of asList(v)) {
      if (typeof x !== "string") continue;
      if (isTemplate(x)) out.push(...scanTemplate(x));
      else for (const p of x.split(",").map((s) => s.trim())) {
        if (isRegId(p)) { const r = regById.get(p); if (r) out.push(r.entity_id); }
        else if (p === "all" || p === "none" || p.includes(".")) out.push(p);
      }
    }
    return out;
  };

  // Triggers, conditions and anything read: every entity mentioned feeds the owner.
  /** @param {any} obj @param {string} owner @param {Role} role */
  const inputs = (obj, owner, role) => {
    /** @param {any} o @returns {void} */
    const visit = (o) => {
      if (Array.isArray(o)) return o.forEach(visit);
      if (o == null || typeof o !== "object") {
        if (isTemplate(o)) scanTemplate(o).forEach((e) => link(entityNode(e).id, owner, role));
        return;
      }
      if (o.enabled === false) return;
      for (const [k, v] of Object.entries(o)) {
        if (k === "entity_id" || k === "zone" || k === "snapshot_entities") {
          resolve(v).forEach((e) => { if (e !== "all" && e !== "none") link(entityNode(e).id, owner, role); });
        } else if (k === "device_id" && o.entity_id == null) {
          asList(v).forEach((d) => { if (!isTemplate(d)) link(deviceNode(d).id, owner, role); });
        } else if (k === "at") {
          asList(v).forEach((x) => { if (typeof x === "string" && x.includes(".")) link(entityNode(x).id, owner, role); else if (typeof x === "object") visit(x); });
        } else visit(v);
      }
    };
    visit(obj);
  };

  /** @type {Set<string>} */
  const runtimeScenes = new Set();
  /** @param {Config} s @param {string} rawSvc @param {string} owner @returns {void} */
  const callService = (s, rawSvc, owner) => {
    // A templated service name: draw each literal service it can pick, or the domain.
    if (isTemplate(rawSvc)) {
      const picks = (rawSvc.match(/[a-z_]+\.[a-z0-9_]+/g) || []).filter((m) => !/^(trigger|states|this|repeat|wait|now|state_attr|is_state)\./.test(m));
      if (picks.length && !/^[a-z_]+\.[a-z0-9_]*\{/.test(rawSvc)) return picks.forEach((p) => callService(s, p, owner));
    }
    const svc = isTemplate(rawSvc) ? rawSvc.replace(/\{\{.*?\}\}|\{%.*?%\}/g, "…") : rawSvc;
    const [domain, name] = svc.split(".");
    /** @param {string} e */
    const fits = (e) => domain === "homeassistant" || e.startsWith(`${domain}.`);
    const t = s.target || {};
    let hit = false;
    /** @param {string} id */
    const out = (id) => { link(owner, id, "action"); hit = true; };
    /** @param {string} e */
    const toEntity = (e) => {
      if (e === "none") return;
      if (e === "all") out(node(`all:${domain}`, "virtual", { label: tr("All {domain}s", { domain }) }).id);
      else out(entityNode(e).id);
    };
    resolve([t.entity_id, s.entity_id, s.data?.entity_id].flatMap(asList)).forEach(toEntity);
    asList(t.device_id).forEach((d) => {
      if (isTemplate(d)) return;
      const es = live.filter((e) => e.device_id === d && fits(e.entity_id));
      if (es.length) es.forEach((e) => toEntity(e.entity_id)); else out(deviceNode(d).id);
    });
    asList(t.area_id).forEach((a) => {
      if (isTemplate(a)) return;
      const es = live.filter((e) => areaIdOf(e) === a && fits(e.entity_id));
      if (es.length) es.forEach((e) => toEntity(e.entity_id));
      else out(node(`area:${a}`, "virtual", { label: tr("{area} (area)", { area: areaNames.get(a) || a }) }).id);
    });
    asList(s.data?.device_id).forEach((d) => { if (!isTemplate(d)) out(deviceNode(d).id); });
    if (domain === "script" && !["turn_on", "turn_off", "toggle", "reload"].includes(name)) out(entityNode(svc).id);
    if (svc === "scene.create" && s.data?.scene_id) { runtimeScenes.add(`scene.${s.data.scene_id}`); out(entityNode(`scene.${s.data.scene_id}`).id); }
    if (!hit) out(node(`svc:${svc}`, "service", { label: svc }).id);
    const { entity_id, device_id, scene_id, ...rest } = s.data || {};
    inputs([rest, s.data_template], owner, "condition");
  };

  /** @param {any} steps @param {string} owner */
  const outputs = (steps, owner) => {
    for (const s of asList(steps)) {
      if (!s || typeof s !== "object" || s.enabled === false) continue;
      const svc = s.action || s.service;
      if (typeof svc === "string") { callService(s, svc, owner); continue; }
      if (s.type && s.domain && (s.device_id || s.entity_id)) {
        const t = resolve(s.entity_id);
        if (t.length) t.forEach((e) => link(owner, entityNode(e).id, "action"));
        else link(owner, deviceNode(s.device_id).id, "action");
        continue;
      }
      if (s.choose) {
        asList(s.choose).forEach((o) => { inputs(o.conditions, owner, "condition"); outputs(o.sequence, owner); });
        outputs(s.default, owner);
      } else if (s.if) {
        inputs(s.if, owner, "condition"); outputs(s.then, owner); outputs(s.else, owner);
      } else if (s.repeat) {
        inputs([s.repeat.until, s.repeat.while, s.repeat.for_each], owner, "condition"); outputs(s.repeat.sequence, owner);
      } else if (s.parallel) {
        asList(s.parallel).forEach((p) => outputs(p?.sequence ?? p, owner));
      } else if (s.sequence) {
        outputs(s.sequence, owner);
      } else if (s.condition || s.wait_template || s.wait_for_trigger || s.variables) {
        inputs(s, owner, "condition");
      }
    }
  };

  // Clock-like triggers become nodes of their own, so a schedule is visible on the map.
  /** @param {any} t @returns {GraphNode[]} */
  const scheduleNodes = (t) => {
    if (!t || typeof t !== "object" || t.enabled === false) return [];
    switch (t.trigger || t.platform) {
      case "time": return asList(t.at).filter((x) => typeof x === "string" && /^\d\d?:\d\d/.test(x)).map((x) => {
        const at = x.length <= 5 ? `${x}:00` : x;
        return node(`time:${at}`, "time", { label: at.replace(/^(\d\d?:\d\d):00$/, "$1"), schedule: { type: "time", at } });
      });
      case "sun": {
        const off = typeof t.offset === "string" ? t.offset : t.offset ? JSON.stringify(t.offset) : "";
        return [node(`sun:${t.event}${off ? ` ${off}` : ""}`, "time", { label: `${t.event}${off ? ` ${off}` : ""}`, schedule: { type: "sun", event: t.event, offset: t.offset || null } })];
      }
      case "time_pattern": {
        const key = ["hours", "minutes", "seconds"].map((k) => t[k] ?? "").join("/");
        return [node(`pattern:${key}`, "time", { label: /** @type {string} */ (summarize(t)), schedule: { type: "pattern", hours: t.hours, minutes: t.minutes, seconds: t.seconds } })];
      }
      case "homeassistant": return [node(`ha:${t.event}`, "time", { label: t.event === "start" ? tr("HA starts") : tr("HA {event}", { event: t.event }), schedule: null })];
      default: return [];
    }
  };
  /** @param {any} triggers @param {string} owner */
  const triggerInputs = (triggers, owner) => {
    for (const t of asList(triggers)) {
      scheduleNodes(t).forEach((sn) => link(sn.id, owner, "trigger"));
      inputs(t, owner, "trigger");
    }
  };

  for (const s of states) {
    const eid = s.entity_id;
    if (hidden.has(eid)) continue;
    const alias = s.attributes.friendly_name || eid;
    if (eid.startsWith("automation.")) {
      const m = alias.match(/^\s*((?:\[[^\]]+\]\s*)+)(.*)$/);
      const tags = m ? [...m[1].matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]) : [];
      node(eid, "automation", { label: (m && m[2]) || alias, alias, tag: tags[0] || null, tags, cfgId: s.attributes.id });
    } else if (eid.startsWith("script.")) {
      const m = alias.match(/^([^:]{2,24}):\s*(.+)$/);
      node(eid, "script", { label: m ? m[2] : alias, alias, tag: m ? m[1] : null, tags: m ? [m[1]] : [] });
    }
  }
  for (const [eid, cfg] of Object.entries(configs)) {
    const n = nodes.get(eid);
    if (!n) continue;
    if (!cfg || cfg.error) { n.broken = cfg?.error || tr("No config"); continue; }
    const triggers = cfg.triggers ?? cfg.trigger;
    triggerInputs(triggers, eid);
    n.dtTriggers = asList(triggers).filter((t) => (t.trigger || t.platform) === "time").flatMap((t) => asList(t.at)).filter((x) => typeof x === "string" && x.startsWith("input_datetime."));
    inputs(cfg.conditions ?? cfg.condition, eid, "condition");
    outputs(cfg.actions ?? cfg.action, eid);
    n.summary = [...new Set(asList(triggers).map(summarize).filter(Boolean))].join(", ");
    n.config = cfg;
  }
  for (const [eid, cfg] of Object.entries(scriptConfigs || {})) {
    const n = nodes.get(eid);
    if (!n || !cfg || cfg.error) continue;
    outputs(cfg.sequence, eid);
    n.config = cfg;
  }
  for (const [eid, use] of Object.entries(blueprints)) {
    const n = nodes.get(eid);
    if (n) n.blueprint = use;
  }

  // scene.create makes these at run time, so they are only absent until it first runs.
  for (const id of runtimeScenes) {
    const n = nodes.get(id);
    if (n?.missing) { n.missing = false; n.snapshot = true; n.label = tr("{name} (snapshot)", { name: id.slice(6).replace(/_/g, " ") }); }
  }

  // Zones. Automations and scripts by the chosen grouping; entities by the one zone they
  // serve, else their area, else the zone most of their neighbours are in.
  /** @param {string | null | undefined} tag */
  const areaFor = (tag) => {
    const t = (tag || "").toLowerCase();
    return areas.map((a) => a.name).find((a) => t === a.toLowerCase() || t.startsWith(`${a.toLowerCase()} `));
  };
  const list = [...nodes.values()];
  const edgeList = [...edges.values()];
  const labelName = new Map(labels.map((l) => [l.label_id, l.name]));
  /** @type {Map<string, string>} */
  const categoryName = new Map();
  for (const [scope, cats] of Object.entries(categories)) for (const c of cats || []) categoryName.set(`${scope}:${c.category_id}`, c.name);
  // Each node's wires, in drawing order, so zoning looks at a node's own wires and not all of them.
  /** @type {Map<string, GraphEdge[]>} */
  const touching = new Map();
  for (const e of edgeList) for (const id of e.src === e.dst ? [e.src] : [e.src, e.dst]) {
    const list = touching.get(id);
    if (list) list.push(e); else touching.set(id, [e]);
  }
  // The area most of what an owner changes is in, else most of what it listens to.
  /** @param {GraphNode} n */
  const targetArea = (n) => {
    for (const out of [true, false]) {
      // Maps, not objects: an area may be called anything, "__proto__" included.
      /** @type {Map<string, number>} */
      const counts = new Map();
      for (const e of touching.get(n.id) || []) {
        const o = out ? (e.src === n.id ? nodes.get(e.dst) : null) : (e.dst === n.id ? nodes.get(e.src) : null);
        if (o?.area) counts.set(o.area, (counts.get(o.area) || 0) + 1);
      }
      const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      if (top) return top[0];
    }
    return null;
  };
  /** @param {GraphNode} n @returns {string} */
  const ownerZone = (n) => {
    const reg = regByEid.get(n.id);
    switch (grouping) {
      case "tag": return areaFor(n.tag) || n.tag || (n.kind === "script" ? tr("Scripts") : tr("Other"));
      case "label": return (reg?.labels || []).map((l) => labelName.get(l) || l).sort()[0] || tr("No label");
      case "category": {
        const id = reg?.categories?.[n.kind];
        return (id && categoryName.get(`${n.kind}:${id}`)) || tr("No category");
      }
      default: return (reg?.area_id && areaNames.get(reg.area_id)) || areaFor(n.tag) || targetArea(n) || (n.kind === "script" ? tr("Scripts") : tr("No area"));
    }
  };
  for (const n of list) if (n.kind === "automation" || n.kind === "script") n.cluster = ownerZone(n);
  for (const n of list) {
    if (n.cluster) continue;
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const e of touching.get(n.id) || []) {
      const o = e.src === n.id ? nodes.get(e.dst) : e.dst === n.id ? nodes.get(e.src) : null;
      if (o?.cluster) counts.set(o.cluster, (counts.get(o.cluster) || 0) + 1);
    }
    const ranked = [...counts].sort((a, b) => b[1] - a[1]);
    n.cluster = ranked.length === 1 ? ranked[0][0] : n.area || ranked[0]?.[0] || tr("Shared");
  }
  /** @type {Graph["refsOf"]} */
  const refsOf = (obj, kind) => {
    sink = new Set();
    try {
      if (kind === "trigger") triggerInputs(obj, PROBE);
      else if (kind === "action") outputs(obj, PROBE);
      else inputs(obj, PROBE, "condition");
      return [...sink];
    } finally { sink = null; }
  };
  return { nodes: list, edges: edgeList, refsOf, resolve };
}

/**
 * Walk a trace path such as "action/0/choose/1/conditions/0" into the config it ran.
 * @param {Config} cfg
 * @param {string} path
 * @returns {{ node: any, entityIndex?: number }}
 */
export function resolvePath(cfg, path) {
  const segs = path.split("/");
  /** @type {Record<string, any>} */
  const root = { trigger: cfg.triggers ?? cfg.trigger, condition: cfg.conditions ?? cfg.condition, action: cfg.actions ?? cfg.action, sequence: cfg.sequence };
  let cur = root[segs[0]];
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i];
    if (cur == null) return { node: null };
    if (s === "entity_id" && typeof cur === "object" && !Array.isArray(cur)) return { node: cur, entityIndex: Number(segs[i + 1]) };
    if (/^\d+$/.test(s)) {
      if (Array.isArray(cur)) cur = cur[Number(s)];
      else if (s !== "0") return { node: cur };
    } else if (typeof cur === "object" && !Array.isArray(cur) && s in cur) cur = cur[s];
    else if (s === "condition" && cur?.conditions) cur = cur.conditions;
    else if (!Array.isArray(cur)) return { node: cur };
  }
  return { node: cur };
}

/**
 * A trigger in a few words, for the line under an automation's name.
 * @param {any} t
 * @returns {string | null}
 */
export function summarize(t) {
  if (!t || typeof t !== "object" || t.enabled === false) return null;
  switch (t.trigger || t.platform) {
    case "time": return asList(t.at).filter((x) => typeof x === "string" && !x.includes(".")).map((x) => x.replace(/^(\d\d:\d\d):00$/, "$1")).join(", ") || null;
    case "time_pattern": return ["hours", "minutes", "seconds"].filter((k) => t[k] != null).map((k) => {
      const v = String(t[k]);
      if (!v.startsWith("/")) return tr("{unit} = {value}", { unit: k, value: v });
      const n = v.slice(1);
      return k === "hours" ? tr("every {n}h", { n }) : k === "minutes" ? tr("every {n}m", { n }) : tr("every {n}s", { n });
    }).join(" ");
    case "sun": return `${t.event}${t.offset ? ` ${t.offset}` : ""}`;
    case "homeassistant": return tr("HA {event}", { event: t.event });
    case "event": return tr("event {type}", { type: t.event_type });
    case "tag": return tr("NFC tag");
    case "mqtt": return tr("mqtt {topic}", { topic: t.topic });
    case "webhook": return tr("webhook");
    case "conversation": return tr("voice “{command}”", { command: asList(t.command)[0] });
    case "calendar": return tr("calendar {event}", { event: t.event });
    default: return null;
  }
}
