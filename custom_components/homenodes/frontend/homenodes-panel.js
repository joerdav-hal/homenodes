// HomeNodes: every automation and script as a node graph, with live state flowing along the wires.
// The sidebar panel's custom element. Pure logic lives in the sibling modules.

import { STORE_KEY, LEGACY_STORE_KEY, ACTIVE, ROLE_RANK, SIZE, TOGGLEABLE, outcome } from "./constants.js";
import { hiddenEntities, panelSettings, settingsChanged } from "./settings.js";
import { parseSaved, serializeSaved } from "./saved.js";
import { Latest, TimeoutError, reason, within } from "./query.js";
import { tr, setLanguage } from "./strings.js";
import { asList, isTemplate, capital } from "./util.js";
import { buildGraph, resolvePath, isOwner, isLeaf } from "./graph.js";
import { evalConditions, runTimeTemplate, branchConditions } from "./conditions.js";
import { nextAt } from "./schedule.js";
import { layout, wirePath } from "./layout.js";
import { ago, inFmt, clock, hhmm, dayTime, fmtState, yaml, setTimeFormat } from "./format.js";
import { expandBlueprints, blueprintName } from "./blueprints.js";
import { instantIn, partsIn } from "./time.js";
import { h, s, ICONS, domainName, nodeIcon, icon, glyph } from "./dom.js";
import { CSS } from "./styles.js";

// Live template conditions, each a subscription Home Assistant re-renders on every change it uses.
const MAX_TEMPLATES = 50;
// How long to wait for a reply: history and logbook scans can be slow on a big recorder.
const SLOW = 60e3, QUICK = 15e3;

/** @typedef {import("./graph.js").GraphNode} GraphNode */
/** @typedef {import("./graph.js").GraphEdge} GraphEdge */

class HomeNodesPanel extends HTMLElement {
  constructor() {
    super();
    /** @type {CanvasRenderingContext2D | null} */
    this._ctx = null;
    this.attachShadow({ mode: "open" });
    this._view = { x: 0, y: 0, k: 1 };
    this._nodes = new Map();
    this._edges = [];
    this._groups = new Map();
    this._runs = new Map();
    this._sparks = [];
    this._painted = new Map();
    this._collapsed = new Set();
    /** @type {{ conditions: boolean, heat: boolean, grouping: import("./graph.js").Grouping }} */
    this._opts = { conditions: true, heat: false, grouping: "area" };
    /** The integration's options. @type {import("./settings.js").PanelSettings} */
    this._settings = panelSettings(null);
    /** Blueprint expansions, kept between reloads. @type {Map<string, Promise<any>>} */
    this._blueprintCache = new Map();
    /** Where each automation is defined, asked once. @type {Map<string, Promise<string>>} */
    this._defined = new Map();
    // Saved positions and collapsed areas, one set per grouping.
    this._posBy = {};
    this._collapsedBy = {};
    this._tpl = new Map();
    this._tplSubs = new Map();
    this._mode = "live";
    this._narrow = false;
    this._latest = new Latest();
    /** Fitted label text by width, size, weight and text. @type {Map<string, string>} */
    this._fitted = new Map();
    // In a background tab nobody is watching: drop every subscription, and catch up on return.
    this._onVisibility = () => {
      if (!this._ready) return;
      if (document.hidden) this._unsubscribe();
      else { this._subscribe(); this._evalAll(); }
    };
  }

  set hass(hass) {
    this._hass = hass;
    this.toggleAttribute("dark", !!hass?.themes?.darkMode);
    this._applyLocale(hass);
    if (!this._started && this.isConnected) this._start();
    else if (this._ready && this._mode === "live") { this._syncSoon(); this._evalSoon(); }
  }
  get hass() { return this._hass; }
  set narrow(v) { this._narrow = v; if (this._menuBtn) this._menuBtn.hidden = !v; }
  // Changing the integration's options re-registers the panel, which hands over a new config.
  set panel(panel) {
    const next = panelSettings(panel);
    if (!settingsChanged(this._settings, next)) return;
    this._settings = next;
    if (this._ready) this._reload();
  }
  set route(_) {}

  connectedCallback() {
    // Properties set before this class was defined shadow the setters; re-apply them.
    for (const p of ["panel", "hass", "narrow"]) {
      if (Object.prototype.hasOwnProperty.call(this, p)) { const v = this[p]; delete this[p]; this[p] = v; }
    }
    if (this._hass && !this._started) this._start();
    if (this._ready) { this._subscribe(); this._evalAll(); }
    this._clock = setInterval(() => this._tickClock(), 30000);
    document.addEventListener("visibilitychange", this._onVisibility);
  }
  disconnectedCallback() {
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._latest.cancelAll();
    clearInterval(this._clock);
    this._unsubscribe();
    this._histPause();
  }

  async _start() {
    this._started = true;
    this._renderShell();
    try {
      await this._load();
      this._ready = true;
      await this._subscribe();
      // Options that changed while the first load was under way.
      if (this._loadedWith !== this._settings) await this._reload();
    } catch (e) {
      console.error("automap:", e);
      this._loading.hidden = false;
      this._loading.textContent = tr("Couldn't read automations from Home Assistant: {error}", { error: e.message || e.code || e });
      this._started = false;
    }
  }

  _ws(msg) { return this._hass.connection.sendMessagePromise(msg); }
  _states() { return this._mode === "history" && this._histStates ? this._histStates : this._hass.states; }
  _ref() { return this._mode === "history" && this._hist ? this._hist.T : Date.now(); }
  _byId(id) { return this._nodes.get(id) || [...this._groups.values()].find((g) => g.id === id); }

  async _fetchGraph() {
    const states = Object.values(this._hass.states);
    const grab = (type, eid) => this._ws({ type, entity_id: eid }).then((r) => r.config, (e) => ({ error: e.message || e.code || "error" }));
    // Labels and categories are newer registries; without them, those groupings just come up empty.
    const optional = (msg) => this._ws(msg).catch(() => []);
    const [entities, devices, areas, labels, autoCats, scriptCats] = await Promise.all([
      this._ws({ type: "config/entity_registry/list" }),
      this._ws({ type: "config/device_registry/list" }),
      this._ws({ type: "config/area_registry/list" }),
      optional({ type: "config/label_registry/list" }),
      optional({ type: "config/category_registry/list", scope: "automation" }),
      optional({ type: "config/category_registry/list", scope: "script" }),
    ]);
    this._loadedWith = this._settings;
    // Hidden ones aren't even read, so their configs never reach the browser.
    const hidden = hiddenEntities(entities, this._settings.hiddenLabels);
    const ids = (d) => states.map((st) => st.entity_id).filter((eid) => eid.startsWith(`${d}.`) && !hidden.has(eid));
    const [autoCfgs, scriptCfgs] = await Promise.all([
      Promise.all(ids("automation").map((eid) => grab("automation/config", eid).then((c) => [eid, c]))),
      Promise.all(ids("script").map((eid) => grab("script/config", eid).then((c) => [eid, c]))),
    ]);
    const send = (msg) => this._ws(msg);
    const [autos, scripts] = await Promise.all([
      expandBlueprints(Object.fromEntries(autoCfgs), "automation", send, this._blueprintCache),
      expandBlueprints(Object.fromEntries(scriptCfgs), "script", send, this._blueprintCache),
    ]);
    this._areaNames = new Set(areas.map((a) => a.name));
    // What the user wrote, as opposed to what a blueprint expands to, for the inspector.
    this._written = Object.fromEntries([...autoCfgs, ...scriptCfgs]);
    return buildGraph({
      states, entities, devices, areas, labels, categories: { automation: autoCats, script: scriptCats },
      configs: autos.configs, scriptConfigs: scripts.configs, blueprints: { ...autos.blueprints, ...scripts.blueprints },
      grouping: this._opts.grouping, hidden,
    });
  }
  // keepView keeps the current pan and zoom; refit fits the map afresh.
  async _load({ keepView = false, refit = false } = {}) {
    const saved = keepView ? null : await this._loadSaved();
    if (saved) {
      Object.assign(this._opts, saved.opts);
      this._posBy = saved.posBy;
      this._collapsedBy = saved.collapsedBy;
    } else if (!keepView) {
      this._opts.grouping = this._settings.grouping;
    }
    this._collapsed = new Set(this._collapsedBy[this._opts.grouping] || []);
    const graph = await this._fetchGraph();
    const savedPos = this._posBy[this._opts.grouping] || {};
    const fixed = new Map();
    for (const n of graph.nodes) {
      const old = this._nodes.get(n.id);
      if (old) fixed.set(n.id, [old.hx ?? old.x, old.hy ?? old.y]);
      else if (Array.isArray(savedPos[n.id])) fixed.set(n.id, savedPos[n.id]);
    }
    layout(graph.nodes, graph.edges, fixed);
    this._graph = graph;
    this._nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    this._edges = graph.edges;
    this._wireOf = new Map(graph.edges.map((e) => [e.id, e]));
    for (const n of graph.nodes) n.wires = [];
    for (const e of graph.edges) {
      e.a = this._nodes.get(e.src); e.b = this._nodes.get(e.dst);
      e.a.wires.push(e); e.b.wires.push(e);
    }
    this._drawGraph();
    this._loading.hidden = true;
    const c = { automation: 0, script: 0, other: 0 };
    for (const n of graph.nodes) c[n.kind in c ? n.kind : "other"]++;
    this._count.textContent = tr("{automations} automations, {scripts} scripts", { automations: c.automation, scripts: c.script });
    if (refit) this._fit();
    else if (keepView) this._applyView();
    // A view saved at the minimum zoom came from a panel with no size; fit afresh instead.
    else if (saved?.view && saved.view.k > 0.05) { this._view = saved.view; this._applyView(); }
    else this._fit();
    if (graph.nodes.some((n) => !savedPos[n.id])) this._save();
    this._evalAll();
    this._refreshHealth();
    this._syncOptButtons();
    if (this._opts.heat) this._loadHeat();
  }
  // A saved layout, or the one saved under the name this project had before, so it carries over.
  async _loadSaved() {
    const get = (key) => this._ws({ type: "frontend/get_user_data", key }).then((r) => r?.value ?? null, () => null);
    let v = await get(STORE_KEY), legacy = false;
    if (!v) { v = await get(LEGACY_STORE_KEY); legacy = !!v; }
    return parseSaved(v, { legacy, grouping: this._settings.grouping });
  }
  // ------------------------------------------------------------ shell

  _renderShell() {
    const root = this.shadowRoot;
    root.replaceChildren();
    this._reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.append(h("style", {}, CSS));
    this._menuBtn = h("button", { class: "btn icon menu", title: tr("Menu"), "aria-label": tr("Menu"), onclick: () => this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true })) }, icon("menu"));
    this._menuBtn.hidden = !this._narrow;
    this._search = h("input", { type: "search", placeholder: tr("Search automations and entities"), "aria-label": tr("Search"), oninput: () => { if (this._focusing) this._select(null); this._applyFocus(); }, onkeydown: (e) => {
      if (e.key === "Enter") { const m = this._matches()[0]; if (m) this._selectNode(m.id, true); }
      if (e.key === "Escape") { this._search.value = ""; this._applyFocus(); }
    } });
    this._count = h("span", { class: "count" });
    this._healthBadge = h("span", { class: "pill" });
    const tool = (ic, label, title, onclick, extra) => h("button", { class: "btn", title, onclick }, icon(ic), h("span", { class: "lbl" }, label), extra);
    this._upBtn = tool("clock", tr("Up next"), tr("What runs in the next 12 hours"), () => this._showUpNext());
    this._upBtn.classList.add("wide");
    this._healthBtn = tool("pulse", tr("Health"), tr("Broken references, duplicates and fights"), () => this._showHealth(), this._healthBadge);
    this._histBtn = tool("history", tr("History"), tr("Replay the recent past"), () => (this._mode === "history" ? this._exitHistory() : this._enterHistory()));
    this._histBtn.classList.add("wide");
    this._viewBtn = tool("eye", tr("View"), tr("What the map shows"), (e) => this._showViewMenu(e.currentTarget));
    root.append(h("div", { class: "bar" },
      this._menuBtn, h("h1", {}, "HomeNodes"), this._count, h("span", { class: "grow" }),
      h("label", { class: "search" }, icon("search"), this._search),
      this._upBtn, this._healthBtn, this._histBtn, h("span", { class: "sep" }), this._viewBtn,
      h("button", { class: "btn icon", title: tr("More"), "aria-label": tr("More"), onclick: (e) => this._showMoreMenu(e.currentTarget) }, icon("more"))));

    this._svg = s("svg", { class: "map" });
    const defs = s("defs", {}, this._svg);
    const pat = s("pattern", { id: "grid", width: 24, height: 24, patternUnits: "userSpaceOnUse" }, defs);
    s("circle", { cx: 1, cy: 1, r: 0.9, style: "fill: var(--grid)" }, pat);
    for (const [name, d] of Object.entries(ICONS)) {
      const sym = s("symbol", { id: `i-${name}`, viewBox: "0 0 24 24" }, defs);
      s("path", { d, fill: "none", stroke: "currentColor", "stroke-width": 1.75, "stroke-linecap": "round", "stroke-linejoin": "round" }, sym);
    }
    this._gridRect = s("rect", { width: "100%", height: "100%", fill: "url(#grid)" }, this._svg);
    this._vp = s("g", {}, this._svg);
    this._clLayer = s("g", {}, this._vp);
    this._wireLayer = s("g", {}, this._vp);
    this._sparkLayer = s("g", {}, this._vp);
    this._nodeLayer = s("g", {}, this._vp);
    this._drawer = h("aside", { class: "drawer", hidden: true, "aria-label": tr("Details") });
    this._feed = h("div", { class: "activity empty", "aria-live": "polite" });
    this._loading = h("div", { class: "loading" }, tr("Reading automations…"));
    this._pop = h("div", { class: "pop", hidden: true });
    this._stage = h("div", { class: "stage" }, this._svg, this._feed, this._drawer, this._loading);
    root.append(this._stage, this._pop);
    root.addEventListener("pointerdown", (e) => { if (!this._pop.hidden && !e.composedPath().includes(this._pop)) this._pop.hidden = true; }, true);
    this._bindPointer();
    new ResizeObserver(() => {
      const r = this._stage.getBoundingClientRect();
      if (this._needFit && r.width >= 50 && r.height >= 50) { this._needFit = false; this._fit(); }
      if (this._mode === "history" && this._hist) this._drawStrip();
    }).observe(this._stage);
  }
  _showPop(anchor, items) {
    this._pop.replaceChildren(...items);
    this._pop.hidden = false;
    const r = anchor.getBoundingClientRect(), host = this.getBoundingClientRect();
    this._pop.style.right = `${Math.max(8, host.right - r.right)}px`;
  }
  _popItem(label, note, on, act) {
    return h("button", { class: "item", onclick: () => { act(); this._pop.hidden = true; } },
      on ? icon("check", 16, "tick") : h("span", { class: "tick" }), h("span", {}, label, note ? h("small", {}, note) : null));
  }
  _showViewMenu(anchor) {
    const key = (role, verdict, text) => [glyph(role, verdict), h("span", {}, text)];
    this._showPop(anchor, [
      this._popItem(tr("Condition status"), tr("Colour each condition by whether it would pass right now"), this._opts.conditions, () => this._setOpt("conditions", !this._opts.conditions)),
      this._popItem(tr("Activity heat"), this._heatNote(), this._opts.heat, () => this._setOpt("heat", !this._opts.heat)),
      h("hr"),
      h("div", { class: "key" }, h("b", {}, tr("Group by"))),
      ...[
        ["area", tr("Area"), tr("The automation's area, or where the things it controls are")],
        ["label", tr("Label"), tr("Its first label")],
        ["category", tr("Category"), tr("Its category")],
        ["tag", tr("Name tag"), tr("A [Tag] at the start of its name")],
      ].map(([g, label, note]) => this._popItem(label, note, this._opts.grouping === g, () => this._setGrouping(g))),
      h("hr"),
      h("div", { class: "key" }, h("b", {}, tr("Key")),
        key("trigger", null, tr("Trigger, what starts it")),
        key("condition", null, tr("Condition, what it checks")),
        key("condition", true, tr("A condition that passes now")),
        key("condition", false, tr("A condition that blocks now")),
        key("action", null, tr("Action, what it changes")),
        key("live", null, tr("Current from something that is on"))),
    ]);
  }
  _showMoreMenu(anchor) {
    const clusters = [...new Set([...this._nodes.values()].map((n) => n.cluster))];
    // On phones, Up next and History live here to leave the toolbar to search.
    const narrow = matchMedia("(max-width: 560px)").matches ? [
      this._popItem(tr("Up next"), tr("What runs in the next 12 hours"), null, () => this._showUpNext()),
      this._popItem(this._mode === "history" ? tr("Back to live") : tr("History"), tr("Replay the recent past"), null, () => (this._mode === "history" ? this._exitHistory() : this._enterHistory())),
      h("hr"),
    ] : [];
    this._showPop(anchor, [
      ...narrow,
      this._popItem(tr("Fit to screen"), tr("Or press F"), null, () => this._fit()),
      this._popItem(tr("Collapse every area"), null, null, () => { this._collapsed = new Set(clusters); this._applyCollapse(); }),
      this._popItem(tr("Expand every area"), null, null, () => { this._collapsed.clear(); this._applyCollapse(); }),
      this._popItem(tr("Tidy the layout"), tr("Lay everything out again"), null, () => this._tidy()),
      this._popItem(tr("Reload automations"), null, null, () => this._reload()),
    ]);
  }
  _heatNote() {
    const days = this._settings.heatDays;
    if (days === 7) return tr("Mark how often each automation ran over the last week");
    if (days === 1) return tr("Mark how often each automation ran over the last day");
    return tr("Mark how often each automation ran over the last {days} days", { days });
  }
  _setOpt(k, v) {
    this._opts[k] = v;
    if (k === "conditions") { this._applyCondClasses(); this._repaintOwners(); }
    if (k === "heat") { if (v) this._loadHeat(); else this._repaintOwners(); }
    this._save();
  }
  // Conditions and schedules run on Home Assistant's clock; times are shown the way the user's
  // profile asks: their language, 12 or 24 hours, and server or browser time.
  _applyLocale(hass) {
    const loc = hass?.locale || {};
    const key = JSON.stringify([loc, hass?.config?.time_zone, hass?.language]);
    if (key === this._localeKey) return;
    this._localeKey = key;
    this._tz = hass?.config?.time_zone || undefined;
    setLanguage(loc.language || hass?.language);
    setTimeFormat({
      language: loc.time_format === "system" ? undefined : loc.language || hass?.language,
      hour12: loc.time_format === "am_pm" ? true : loc.time_format === "24" ? false : undefined,
      timeZone: loc.time_zone === "server" ? this._tz : undefined,
    });
    if (this._ready) { this._syncStates(true); this._evalAll(); }
  }
  _syncOptButtons() { this._viewBtn.setAttribute("aria-pressed", String(this._opts.heat)); }

  // ------------------------------------------------------------ drawing

  _drawGraph() {
    this._font = null;
    this._fitted.clear();
    this._wireLayer.replaceChildren();
    this._nodeLayer.replaceChildren();
    this._clLayer.replaceChildren();
    this._groups = new Map();
    this._painted.clear();
    for (const e of this._edges) {
      e.el = s("path", { class: `wire ${e.role}${e.learned ? " learned" : ""}`, d: wirePath(e.a, e.b) }, this._wireLayer);
    }
    for (const n of this._nodes.values()) this._drawNode(n);
    // Each area is a zone: a plate behind its components, titled above.
    this._clusterEls = new Map();
    const clusters = new Set([...this._nodes.values()].map((n) => n.cluster));
    for (const c of clusters) {
      const z = /** @type {any} */ (s("g", { class: "zone" }, this._clLayer));
      z.rect = s("rect", { class: "plate", rx: 14 }, z);
      const t = s("g", { class: "cl" }, z);
      t.dataset.cluster = c;
      s("title", {}, t).textContent = tr("Collapse this area");
      z.hit = s("rect", { class: "zhit" }, t);
      z.chev = this._icon(t, "chevron", 0, 0, 16);
      z.title = s("text", { class: "zt" }, t);
      z.title.textContent = c;
      z.label = c;
      this._clusterEls.set(c, z);
    }
    for (const c of [...this._collapsed]) if (!clusters.has(c)) this._collapsed.delete(c);
    this._route();
    this._syncStates(true);
  }
  // Reading the font costs a style recalculation, so it is read once per drawing, not per label.
  _measure(text, px, weight = 400) {
    this._ctx ||= document.createElement("canvas").getContext("2d");
    this._font ||= getComputedStyle(this).fontFamily || "sans-serif";
    const font = `${weight} ${px}px ${this._font}`;
    if (this._ctx.font !== font) this._ctx.font = font;
    return this._ctx.measureText(text).width;
  }
  _fitText(text, max, px, weight) {
    text = String(text ?? "");
    const key = `${max}|${px}|${weight}|${text}`;
    const hit = this._fitted.get(key);
    if (hit !== undefined) return hit;
    let out = text;
    if (this._measure(text, px, weight) > max) {
      let lo = 0, hi = text.length;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this._measure(`${text.slice(0, mid)}…`, px, weight) <= max) lo = mid; else hi = mid - 1; }
      out = `${text.slice(0, lo)}…`;
    }
    if (this._fitted.size > 50000) this._fitted.clear();
    this._fitted.set(key, out);
    return out;
  }
  _text(parent, cls, x, y, str, max, px, weight) {
    const t = s("text", { class: cls, x, y }, parent);
    t.textContent = this._fitText(str, max, px, weight);
    /** @type {any} */ (t)._raw = str;
    t.dataset.max = max; t.dataset.px = px; t.dataset.w = weight || 400;
    return t;
  }
  _setText(t, str) {
    if (!t || t._raw === str) return;
    t._raw = str;
    t.textContent = this._fitText(str, Number(t.dataset.max), Number(t.dataset.px), Number(t.dataset.w));
  }

  _drawNode(n) {
    const g = s("g", { class: `node ${n.kind}`, transform: `translate(${n.x},${n.y})` }, this._nodeLayer);
    g.dataset.id = n.id;
    n.el = g;
    const hasIn = n.wires.some((e) => e.b === n), hasOut = n.wires.some((e) => e.a === n);
    s("rect", { class: "body", width: n.w, height: n.h, rx: 6 }, g);
    if (isOwner(n)) {
      this._icon(g, nodeIcon(n), 12, 11, 16);
      this._text(g, "t1", 36, 23.5, n.label, n.w - 48, 13, 600);
      n.sumEl = this._text(g, "t2 sum", 36, 41.5, "", n.w - 36 - 70, 11);
      n.agoEl = this._text(g, "t2 meta", n.w - 12, 41.5, "", 64, 11);
      n.agoEl.setAttribute("text-anchor", "end");
      n.heatEl = s("rect", { class: "heat", x: 6, y: n.h - 3.5, height: 2, rx: 1, width: 0 }, g);
    } else {
      const tog = this._settings.controls && n.kind === "entity" && TOGGLEABLE.has(n.id.split(".")[0]) && !n.missing;
      if (tog) { g.classList.add("tog"); s("circle", { class: "hit", cx: 20, cy: n.h / 2, r: 14 }, g); }
      this._icon(g, nodeIcon(n), 12, (n.h - 16) / 2, 16);
      const time = n.kind === "time";
      this._text(g, "t1", 36, 17.5, n.label, n.w - 46, time ? 13 : 12.5, time ? 600 : 500);
      const sub = { service: tr("Service call"), device: tr("Device"), virtual: tr("Group") }[n.kind] || (time && !n.schedule ? tr("On startup") : "");
      n.stateEl = this._text(g, "t2 state", 36, 31, sub, n.w - 46, 11);
      if (time) n.subEl = n.stateEl;
    }
    if (hasIn) s("circle", { class: "port", cx: 0, cy: n.h / 2, r: 3 }, g);
    if (hasOut) s("circle", { class: "port", cx: n.w, cy: n.h / 2, r: 3 }, g);
    if (n.missing) g.classList.add("missing");
    if (n.broken) g.classList.add("broken");
  }
  // ------------------------------------------------------------ collapsed areas

  _group(c) {
    let g = this._groups.get(c);
    if (!g) {
      const members = [...this._nodes.values()].filter((n) => n.cluster === c);
      const [w, hh] = SIZE.group;
      g = { id: `group:${c}`, kind: "group", cluster: c, label: c, members, w, h: hh, x: 0, y: 0, rwires: [] };
      const el = s("g", { class: "node group" }, this._nodeLayer);
      el.dataset.id = g.id;
      g.el = el;
      s("title", {}, el).textContent = tr("Double-click to expand");
      s("rect", { class: "body", width: w, height: hh, rx: 10 }, el);
      this._icon(el, "layers", 14, 13, 18);
      this._text(el, "t1", 42, 28, c, w - 56, 15, 600);
      g.subEl = this._text(el, "t2", 42, 47, "", w - 56, 11.5);
      s("circle", { class: "port", cx: 0, cy: hh / 2, r: 3 }, el);
      s("circle", { class: "port", cx: w, cy: hh / 2, r: 3 }, el);
      this._groups.set(c, g);
    }
    return g;
  }
  _folded(c) { return this._collapsed.has(c) && !this._focusing; }
  _rep(n) { return n.kind !== "group" && this._folded(n.cluster) ? this._group(n.cluster) : n; }

  _toggleCluster(c) {
    if (this._collapsed.has(c)) this._collapsed.delete(c);
    else this._collapsed.add(c);
    this._applyCollapse();
  }
  _applyCollapse() {
    const sel = this._selected && this._byId(this._selected);
    if (sel && (sel.kind === "group" ? !this._collapsed.has(sel.cluster) : this._collapsed.has(sel.cluster))) this._select(null);
    this._route();
    this._applyFocus();
    this._syncStates(true);
    this._save();
  }
  // Where every wire is drawn, given which areas are collapsed.
  _route() {
    for (const c of this._collapsed) {
      const g = this._group(c);
      g.x = Math.min(...g.members.map((n) => n.x));
      g.y = Math.min(...g.members.map((n) => n.y));
      g.el.setAttribute("transform", `translate(${g.x},${g.y})`);
    }
    for (const n of this._nodes.values()) { n.el.classList.toggle("folded", this._folded(n.cluster)); n.rwires = []; }
    for (const [c, g] of this._groups) { g.el.classList.toggle("folded", !this._folded(c)); g.rwires = []; }
    for (const e of this._edges) {
      e.ra = this._rep(e.a); e.rb = this._rep(e.b);
      const inside = e.ra === e.rb;
      e.el.classList.toggle("folded", inside);
      if (inside) continue;
      e.el.setAttribute("d", wirePath(e.ra, e.rb));
      e.ra.rwires.push(e); e.rb.rwires.push(e);
    }
    for (const [c, el] of this._clusterEls) el.classList.toggle("folded", this._folded(c));
    this._placeClusterLabels();
  }
  _visible() { return [...this._nodes.values(), ...this._groups.values()].filter((n) => !n.el.classList.contains("folded") && !n.el.classList.contains("gone")); }

  // ------------------------------------------------------------ painting

  _syncStates(all = false) {
    const states = this._states();
    for (const n of this._nodes.values()) {
      const st = states[n.id];
      if (!all && this._painted.get(n.id) === st) continue;
      this._painted.set(n.id, st);
      this._paint(n, st);
    }
    for (const c of this._collapsed) this._paintGroup(this._group(c), states);
  }
  // Home Assistant can hand over new states many times a frame; paint once per frame, and not at
  // all in a background tab, which gets no frames.
  _syncSoon() {
    if (this._syncRaf) return;
    this._syncRaf = requestAnimationFrame(() => { this._syncRaf = null; if (this._mode === "live") this._syncStates(); });
  }
  _repaintOwners() { for (const n of this._nodes.values()) if (isOwner(n)) this._paint(n, this._states()[n.id]); }

  _paint(n, st) {
    const g = n.el;
    if (!g) return;
    if (n.culled) { n.stale = true; if (n.kind === "entity") this._paintWires(n, st); return; }
    const ref = this._ref();
    if (isOwner(n)) {
      const off = st?.state === "off" && n.kind === "automation";
      g.classList.toggle("disabled", off);
      g.classList.toggle("unavail", !st || st.state === "unavailable");
      g.classList.toggle("active", n.kind === "script" && st?.state === "on");
      const last = st?.attributes?.last_triggered;
      const since = last ? ref - new Date(last).getTime() : Infinity;
      g.classList.toggle("recent", since >= 0 && since < 120000);
      const heat = this._opts.heat && this._heat?.counts;
      if (heat) {
        const per = (heat[n.id] || 0) / this._heat.days;
        const k = Math.min(1, Math.log10(1 + per) / Math.log10(301));
        this._setText(n.agoEl, tr("{n} a day", { n: `${this._heat.approx ? "≈" : ""}${per >= 10 ? Math.round(per) : Math.round(per * 10) / 10}` }));
        n.heatEl.setAttribute("width", Math.max(heat[n.id] ? 4 : 0, (n.w - 12) * k));
        g.classList.toggle("cold", !heat[n.id]);
      } else {
        this._setText(n.agoEl, off ? tr("Off") : last ? ago(last, ref) : tr("Never run"));
        n.heatEl.setAttribute("width", 0);
        g.classList.remove("cold");
      }
      const blocked = n.kind === "automation" && this._opts.conditions && n.blocked?.length && !off;
      g.classList.toggle("blocked", !!blocked);
      this._setText(n.sumEl, n.broken ? tr("Can't read its config")
        : n.blueprint?.error ? tr("Can't read its blueprint")
        : blocked ? tr("Blocked: {reason}", { reason: `${n.blocked[0]}${n.blocked.length > 1 ? `, +${n.blocked.length - 1}` : ""}` })
        : n.kind === "script" ? (st?.state === "on" ? tr("Running") : tr("Idle"))
        : capital(n.summary || n.config?.mode || ""));
    } else if (n.kind === "entity") {
      const active = !!st && ACTIVE.has(st.state);
      g.classList.toggle("active", active);
      g.classList.toggle("unavail", (!st && !n.snapshot) || st?.state === "unavailable");
      this._setText(n.stateEl, n.missing ? tr("Doesn't exist") : !st && n.snapshot ? tr("Made when it runs") : capital(fmtState(st, ref)));
      this._paintWires(n, st);
    } else if (n.kind === "time" && n.schedule) {
      const next = this._mode === "live" ? nextAt(n.schedule, new Date(), this._hass.states, this._tz) : null;
      this._setText(n.subEl, !next ? "" : n.schedule.type === "time" ? capital(inFmt(next.getTime() - Date.now())) : `${hhmm(next)}, ${inFmt(next.getTime() - Date.now())}`);
    }
  }
  // Wires from something that's on carry current; a wire can show while its source is off screen.
  _paintWires(n, st) {
    const active = !!st && ACTIVE.has(st.state);
    for (const e of n.wires) if (e.a === n) e.el?.classList.toggle("live", active && this._states()[e.dst]?.state !== "off");
  }
  _paintGroup(g, states) {
    if (g.culled) { g.stale = true; return; }
    let on = 0, autos = 0, ran = 0;
    const ref = this._ref();
    for (const m of g.members) {
      const st = states[m.id];
      if (isOwner(m)) { autos++; const l = st?.attributes?.last_triggered; if (l && ref - new Date(l).getTime() < 3600e3) ran++; }
      else if (st && ACTIVE.has(st.state)) on++;
    }
    this._setText(g.subEl, [tr("{n} automations", { n: autos }), on ? tr("{n} on", { n: on }) : null, ran ? tr("{n} ran this hour", { n: ran }) : null].filter(Boolean).join(", "));
    g.el.classList.toggle("active", on > 0);
  }
  _tickClock() {
    if (!this._ready) return;
    for (const n of this._nodes.values()) if (isOwner(n) || n.kind === "time") this._paint(n, this._states()[n.id]);
    const cut = Date.now() - 600000;
    for (const [k, r] of this._runs) if (r.t < cut) this._runs.delete(k);
    this._evalAll();
    if (this._drawerView === "upnext") this._showUpNext();
  }

  _placeClusterLabels() {
    if (!this._clusterEls) return;
    const box = new Map();
    for (const n of this._nodes.values()) {
      const b = box.get(n.cluster) || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      b.x0 = Math.min(b.x0, n.x); b.y0 = Math.min(b.y0, n.y);
      b.x1 = Math.max(b.x1, n.x + n.w); b.y1 = Math.max(b.y1, n.y + n.h);
      box.set(n.cluster, b);
    }
    for (const [c, z] of this._clusterEls) {
      const b = box.get(c);
      if (!b) continue;
      const pad = 28;
      z.box = { x: b.x0 - pad, y: b.y0 - pad, w: b.x1 - b.x0 + 2 * pad, h: b.y1 - b.y0 + 2 * pad };
      for (const [k, v] of Object.entries({ x: z.box.x, y: z.box.y, width: z.box.w, height: z.box.h })) z.rect.setAttribute(k, v);
    }
    this._scaleZoneTitles();
  }
  // ------------------------------------------------------------ live conditions

  _evalSoon() { clearTimeout(this._evalT); this._evalT = setTimeout(() => this._evalAll(), 400); }

  _evalAll() {
    if (!this._graph) return;
    const wanted = new Set();
    this._tplOverflow = new Set();
    const live = this._mode === "live";
    const states = this._states();
    const now = new Date(this._ref());
    const resolve = this._graph.resolve;
    for (const n of this._nodes.values()) {
      if (n.kind !== "automation" || !n.config) continue;
      const cfg = n.config;
      const vars = Object.keys({ ...(cfg.variables || {}), ...(cfg.trigger_variables || {}) });
      const runTime = runTimeTemplate(vars);
      const skipTpl = (t) => !live || runTime(t);
      const res = new Map();
      const rep = (id, ok) => {
        const prev = res.get(id);
        res.set(id, prev === false || ok === false ? false : ok == null ? (prev ?? null) : true);
      };
      const fails = new Map();
      const top = cfg.conditions ?? cfg.condition;
      const ctx = { states, now, tpl: this._tpl, resolve, skipTpl, timeZone: this._tz };
      const verdict = evalConditions(top, { ...ctx, report: (id, ok, why) => { rep(id, ok); if (ok === false && !fails.has(id)) fails.set(id, why); } });
      for (const c of branchConditions(cfg.actions ?? cfg.action)) evalConditions(c, { ...ctx, report: rep });
      if (live) this._watchTemplates(n, [top, ...branchConditions(cfg.actions ?? cfg.action)], skipTpl, wanted);
      n.condRes = res;
      const why = [...new Set([...fails].map(([id, w]) => this._reason(id, w)))];
      n.blocked = verdict === false ? (why.length ? why : [tr("its conditions")]) : null;
    }
    if (live) this._dropTemplates(wanted);
    this._applyCondClasses();
    this._repaintOwners();
  }

  // "Holiday mode is off, needs on": what was seen and what the condition wanted.
  _reason(id, why) {
    if (why?.text) return why.text;
    const name = this._nodes.get(id)?.label || id;
    if (!why) return name;
    if (why.template) return tr("{name} (a template on it is false)", { name });
    return tr("{name} is {actual}, needs {wanted}", { name, actual: why.actual, wanted: why.wanted });
  }

  _applyCondClasses() {
    for (const e of this._edges) {
      if (e.role !== "condition") continue;
      const r = this._opts.conditions ? e.b.condRes?.get(e.a.id) : undefined;
      e.el.classList.toggle("pass", r === true);
      e.el.classList.toggle("fail", r === false);
    }
  }

  // Each one is rendered by Home Assistant on every change it depends on, so they are capped, and
  // a slow one is cut off by the server rather than left to run.
  _watchTemplates(owner, conds, skip, wanted) {
    const c = this._hass.connection;
    if (!c?.subscribeMessage) return;
    const found = [];
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (typeof o === "string") { if (isTemplate(o)) found.push(o); return; }
      if (!o || typeof o !== "object") return;
      if (o.condition === "template" && isTemplate(o.value_template)) found.push(o.value_template);
      walk(o.conditions);
    };
    walk(conds);
    for (const t of found) {
      if (skip(t)) continue;
      if (!this._tplSubs.has(t) && this._tplSubs.size >= MAX_TEMPLATES) { this._tplOverflow.add(owner.id); continue; }
      wanted.add(t);
      if (this._tplSubs.has(t)) continue;
      this._tplSubs.set(t, c.subscribeMessage((msg) => {
        this._tpl.set(t, msg.error ? { result: null } : { result: msg.result, entities: msg.listeners?.entities || [] });
        this._evalSoon();
      }, { type: "render_template", template: t, report_errors: false, timeout: 3 }).catch(() => null));
    }
  }
  _dropTemplates(wanted) {
    for (const [t, p] of this._tplSubs) {
      if (wanted.has(t)) continue;
      p?.then?.((u) => u && u());
      this._tplSubs.delete(t);
      this._tpl.delete(t);
    }
  }

  // ------------------------------------------------------------ live events

  async _subscribe() {
    this._unsubscribe();
    const c = this._hass?.connection;
    if (!c?.subscribeEvents) return;
    const subs = [
      ["state_changed", (e) => this._onState(e)],
      ["automation_triggered", (e) => this._onRun(e, "automation")],
      ["script_started", (e) => this._onRun(e, "script")],
      ["call_service", (e) => this._onCall(e)],
      ["automation_reloaded", () => this._reloadSoon()],
      ["entity_registry_updated", () => this._reloadSoon()],
    ];
    this._unsubs = (await Promise.all(subs.map(([type, cb]) => c.subscribeEvents(cb, type).catch(() => null)))).filter(Boolean);
  }
  _unsubscribe() {
    for (const u of this._unsubs || []) { try { u(); } catch (_) { /* gone */ } }
    this._unsubs = [];
    for (const p of this._tplSubs.values()) p?.then?.((u) => u && u());
    this._tplSubs.clear();
  }
  _reloadSoon() { clearTimeout(this._reloadT); this._reloadT = setTimeout(() => this._reload(), 2500); }

  // Which run caused something: HA passes the run's context to every call it makes.
  _ownerFor(ctx, targetId) {
    const owners = [this._runs.get(ctx?.id), this._runs.get(ctx?.parent_id)].filter(Boolean).flatMap((r) => r.owners);
    if (!owners.length) return null;
    return owners.slice().reverse().find((o) => this._wire(o, targetId)) || owners[owners.length - 1];
  }

  _onRun(ev, kind) {
    const id = ev.data?.entity_id;
    const ctx = ev.context || {};
    const run = this._runs.get(ctx.id) || { owners: [], t: Date.now() };
    run.owners.push(id); run.t = Date.now();
    this._runs.set(ctx.id, run);
    const n = this._nodes.get(id);
    if (!n || this._mode !== "live") return;
    if (kind === "script") {
      this._flash(n);
      const owner = this._ownerFor({ parent_id: ctx.parent_id }, id) || run.owners.find((o) => o !== id);
      const e = owner && this._wire(owner, id);
      if (e) this._pulse(e, "action");
    } else this._runVisual(n, ev.data.source, Date.now(), true);
  }

  // An automation ran: flash it, spark the trigger that fired it, list it in the feed.
  _runVisual(n, source, when, animate) {
    this._flash(n);
    if (animate) {
      const src = (source || "").match(/[a-z_]+\.[a-z0-9_]+/)?.[0];
      const prefix = /time pattern/.test(source || "") ? "pattern:" : /^time/.test(source || "") ? "time:" : /^sun/.test(source || "") ? "sun:" : /start/.test(source || "") ? "ha:" : null;
      for (const e of n.wires) {
        if (e.b !== n || e.role !== "trigger") continue;
        if ((src && e.src === src) || (!src && prefix && e.src.startsWith(prefix))) this._pulse(e, "trigger");
      }
    }
    this._feedAdd(n, source, when);
  }

  _onState(ev) {
    if (this._mode !== "live") return;
    const id = ev.data?.entity_id;
    const ns = ev.data?.new_state, os = ev.data?.old_state;
    const n = this._nodes.get(id);
    if (!n || !ns) return;
    this._changeVisual(n, !os || os.state !== ns.state, this._ownerFor(ns.context, id));
  }

  // Something changed: spark what it feeds, and the wire from whatever changed it.
  _changeVisual(n, stateChanged, owner) {
    if (stateChanged) for (const e of n.wires) if (e.a === n && e.role !== "action") this._pulse(e, e.role === "trigger" ? "trigger" : "condition");
    if (!owner || owner === n.id) return;
    let e = this._wire(owner, n.id);
    if (!e && this._nodes.has(owner)) e = this._learn(owner, n.id);
    if (e) this._pulse(e, "action");
  }

  _onCall(ev) {
    if (this._mode !== "live") return;
    const target = `svc:${ev.data?.domain}.${ev.data?.service}`;
    if (!this._nodes.has(target)) return;
    const owner = this._ownerFor(ev.context, target);
    const e = owner && this._wire(owner, target);
    if (e) this._pulse(e, "action");
  }

  /** The wire from src to dst, if drawn; ids are "src>dst", as graph.js makes them. */
  _wire(src, dst) { return this._wireOf?.get(`${src}>${dst}`); }
  // A templated target only shows itself at run time; draw it once seen.
  _learn(src, dst) {
    const a = this._nodes.get(src), b = this._nodes.get(dst);
    const e = /** @type {any} */ ({ id: `${src}>${dst}`, src, dst, role: "action", learned: true, a, b });
    e.el = s("path", { class: "wire action learned" }, this._wireLayer);
    a.wires.push(e); b.wires.push(e);
    this._edges.push(e);
    this._wireOf.set(e.id, e);
    this._route();
    this._applyFocus();
    return e;
  }

  _flash(n) {
    const r = this._rep(n);
    r.el.classList.remove("flash");
    void r.el.getBBox();
    r.el.classList.add("flash");
    clearTimeout(r.flashT);
    r.flashT = setTimeout(() => r.el.classList.remove("flash"), 1200);
  }

  _pulse(e, kind) {
    if (!e.el || e.culled || e.el.classList.contains("folded") || document.hidden) return;
    // Reduced motion: the wire lights up, nothing travels.
    if (this._reduced) { e.el.classList.add("hot"); clearTimeout(e.hotT); e.hotT = setTimeout(() => e.el.classList.remove("hot"), 1500); return; }
    const len = e.el.getTotalLength();
    const dot = s("circle", { class: `spark ${kind}`, r: kind === "condition" ? 3 : 5 }, this._sparkLayer);
    this._sparks.push({ dot, e, len, t0: performance.now(), dur: Math.min(1400, 450 + len * 0.6), kind });
    e.el.classList.add("hot");
    clearTimeout(e.hotT);
    e.hotT = setTimeout(() => e.el.classList.remove("hot"), 1500);
    if (!this._raf) this._raf = requestAnimationFrame((t) => this._animate(t));
  }

  _animate(now) {
    this._sparks = this._sparks.filter((sp) => {
      const p = (now - sp.t0) / sp.dur;
      if (p >= 1 || !sp.e.el.isConnected) {
        sp.dot.remove();
        if (p >= 1 && sp.kind === "action" && sp.e.b.el) this._flash(sp.e.b);
        return false;
      }
      const ease = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      const pt = sp.e.el.getPointAtLength(ease * sp.len);
      sp.dot.setAttribute("cx", pt.x);
      sp.dot.setAttribute("cy", pt.y);
      return true;
    });
    this._raf = this._sparks.length ? requestAnimationFrame((t) => this._animate(t)) : null;
  }

  _feedAdd(n, source, when = Date.now()) {
    if (!this._feed.firstChild) this._feed.append(h("h4", {}, tr("Activity")));
    const row = h("div", { class: "row", tabindex: "0", title: tr("Show this run"), onclick: () => this._selectNode(n.id, true, when) },
      h("time", {}, clock(when)), h("b", {}, n.label), h("small", {}, this._cause(source)));
    this._feed.firstChild.after(row);
    this._feed.classList.remove("empty");
    while (this._feed.querySelectorAll(".row").length > 5) this._feed.lastChild.remove();
    setTimeout(() => { row.remove(); if (!this._feed.querySelector(".row")) this._clearFeed(); }, 90000);
  }
  // ------------------------------------------------------------ pan, zoom, drag

  _applyView() {
    const { x, y, k } = this._view;
    this._vp.setAttribute("transform", `translate(${x},${y}) scale(${k})`);
    this._gridRect.setAttribute("transform", `translate(${x % (24 * k)},${y % (24 * k)}) scale(${k})`);
    this._gridRect.setAttribute("width", `${100 / k + 100}%`);
    this._gridRect.setAttribute("height", `${100 / k + 100}%`);
    // Semantic zoom: far out, components become blocks and only state shows.
    this._svg.classList.toggle("far", k < 0.42);
    // Further out still, idle wires are a hairball nobody can follow; only current and runs show.
    this._svg.classList.toggle("tiny", k < 0.2);
    this._scaleZoneTitles();
    this._cullSoon();
  }

  // Off-screen nodes and wires get display: none, so the browser neither styles nor paints them;
  // their labels catch up when they come back. While focused only the flow is drawn, so only it is
  // shown; the rest keep the state they had for the view that leaving focus goes back to.
  _cullSoon() {
    if (this._cullRaf) return;
    this._cullRaf = requestAnimationFrame(() => { this._cullRaf = null; this._cull(); });
  }
  _cull() {
    if (this._tweenRaf && !this._focusing) return;
    const r = this._svg?.getBoundingClientRect();
    const keep = this._focusing ? this._focusSet : null;
    const all = !r || r.width < 50 || r.height < 50;
    const { x, y, k } = this._view;
    const pad = 240 / k;
    const x0 = -x / k - pad, y0 = -y / k - pad, x1 = (r ? r.width - x : 0) / k + pad, y1 = (r ? r.height - y : 0) / k + pad;
    const sees = (ax, ay, bx, by) => all || (bx >= x0 && ax <= x1 && by >= y0 && ay <= y1);
    const states = this._states();
    for (const n of [...this._nodes.values(), ...this._groups.values()]) {
      if (keep && !keep.has(n.id)) continue;
      const out = !keep && !sees(n.x, n.y, n.x + n.w, n.y + n.h);
      if (out === !!n.culled) continue;
      n.culled = out;
      n.el.classList.toggle("cull", out);
      if (!out && n.stale) { n.stale = false; if (n.kind === "group") this._paintGroup(n, states); else this._paint(n, states[n.id]); }
    }
    for (const e of this._edges) {
      if (keep && !(keep.has(e.src) && keep.has(e.dst))) continue;
      const a = e.ra || e.a, b = e.rb || e.b;
      const out = !keep && !sees(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x + a.w, b.x + b.w), Math.max(a.y + a.h, b.y + b.h));
      if (out === !!e.culled) continue;
      e.culled = out;
      e.el.classList.toggle("cull", out);
    }
  }
  // The view that shows these boxes, beside the drawer and above the history bar; null if no size yet.
  _fitView(boxes, top = 100, maxK = 1.2) {
    const r = this._svg.getBoundingClientRect();
    if (!boxes.length || r.width < 50 || r.height < 50) return null;
    const x0 = Math.min(...boxes.map((n) => n.x)), y0 = Math.min(...boxes.map((n) => n.y)) - top;
    const x1 = Math.max(...boxes.map((n) => n.x + n.w)), y1 = Math.max(...boxes.map((n) => n.y + n.h));
    const open = !this._drawer.hidden, narrow = r.width < 800;
    const drawer = open && !narrow ? 400 : 0;
    const bar = this._mode === "history" ? 120 : 0;
    const sheet = open && narrow ? this._drawer.getBoundingClientRect().height + 8 : 0;
    const h = r.height - bar - sheet;
    const k = Math.min(maxK, Math.max(0.05, Math.min((r.width - drawer - 40) / (x1 - x0 || 1), (h - 40) / (y1 - y0 || 1))));
    return { k, x: (r.width - drawer - (x1 - x0) * k) / 2 - x0 * k, y: (h - (y1 - y0) * k) / 2 - y0 * k };
  }
  _fit(nodes = this._visible()) {
    if (!nodes.length) return;
    // Not laid out yet (hidden, or no height): fit once the resize observer sees a real size.
    const v = this._fitView(nodes, this._focusing ? 40 : 100);
    if (!v) { this._needFit = true; return; }
    this._view = v;
    this._applyView();
    this._save();
  }

  _toWorld(cx, cy) {
    const r = this._svg.getBoundingClientRect();
    return [(cx - r.left - this._view.x) / this._view.k, (cy - r.top - this._view.y) / this._view.k];
  }

  _zoomAt(cx, cy, factor) {
    const r = this._svg.getBoundingClientRect();
    const k = Math.min(2.5, Math.max(0.05, this._view.k * factor));
    const px = cx - r.left, py = cy - r.top;
    this._view.x = px - ((px - this._view.x) * k) / this._view.k;
    this._view.y = py - ((py - this._view.y) * k) / this._view.k;
    this._view.k = k;
    this._applyView();
    this._save();
  }

  _bindPointer() {
    const svg = this._svg;
    const pts = new Map();
    let drag = null, pinch = null, lastTap = { id: null, t: 0 };
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.ctrlKey || Math.abs(e.deltaY) > 40 || e.deltaMode) this._zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
      else { this._view.x -= e.deltaX; this._view.y -= e.deltaY; this._applyView(); this._save(); }
    }, { passive: false });
    svg.addEventListener("pointerdown", (e) => {
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
        drag = null;
        return;
      }
      const target = /** @type {Element} */ (e.target);
      const label = /** @type {SVGElement | null} */ (target.closest?.(".cl"));
      const g = /** @type {SVGElement | null} */ (target.closest?.(".node"));
      const n = g && this._byId(g.dataset.id);
      const [wx, wy] = this._toWorld(e.clientX, e.clientY);
      const base = { sx: e.clientX, sy: e.clientY, moved: false };
      if (label) drag = { ...base, cluster: label.dataset.cluster };
      else if (n) drag = { ...base, n, ox: wx - n.x, oy: wy - n.y, hit: !!target.closest(".hit") };
      else { drag = { ...base, pan: true, vx: this._view.x, vy: this._view.y }; svg.classList.add("panning"); }
    });
    svg.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        this._zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d);
        pinch.d = d;
        return;
      }
      if (!drag) return;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (!drag.moved || drag.cluster) return;
      if (drag.pan) {
        this._view.x = drag.vx + e.clientX - drag.sx;
        this._view.y = drag.vy + e.clientY - drag.sy;
        this._applyView();
      } else {
        const [wx, wy] = this._toWorld(e.clientX, e.clientY);
        this._move(drag.n, Math.round(wx - drag.ox), Math.round(wy - drag.oy));
      }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      svg.classList.remove("panning");
      if (pts.size < 2) pinch = null;
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.moved) { if (d.n) this._placeClusterLabels(); this._save(); return; }
      if (d.cluster) return this._toggleCluster(d.cluster);
      if (!d.n) return this._select(null);
      if (d.hit && this._mode === "live") return this._toggleEntity(d.n.id);
      const now = performance.now();
      if (d.n.kind === "group" && lastTap.id === d.n.id && now - lastTap.t < 400) { lastTap = { id: null, t: 0 }; return this._toggleCluster(d.n.cluster); }
      lastTap = { id: d.n.id, t: now };
      this._select(d.n.id);
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    window.addEventListener("keydown", (e) => {
      if (!this.isConnected || e.target !== document.body) return;
      if (e.key === "f") this._fit();
      if (e.key === "Escape") this._select(null);
    });
  }

  _move(n, x, y) {
    if (n.kind === "group") {
      const dx = x - n.x, dy = y - n.y;
      for (const m of n.members) { m.x += dx; m.y += dy; m.el.setAttribute("transform", `translate(${m.x},${m.y})`); }
    }
    n.x = x; n.y = y;
    n.el.setAttribute("transform", `translate(${x},${y})`);
    for (const e of n.rwires || []) e.el.setAttribute("d", wirePath(e.ra, e.rb));
    if (!this._focusing) this._platesSoon();
  }

  _save() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => {
      this._remember();
      const value = serializeSaved({ posBy: this._posBy, collapsedBy: this._collapsedBy, view: this._focusing ? this._homeView : this._view, opts: this._opts });
      this._ws({ type: "frontend/set_user_data", key: STORE_KEY, value }).catch((e) => console.warn("homenodes: could not save layout", e));
    }, 800);
  }

  // Note the current grouping's positions and collapsed areas, before anything changes them.
  _remember() {
    const pos = Object.create(null);
    for (const n of this._nodes.values()) pos[n.id] = [n.hx ?? n.x, n.hy ?? n.y];
    const g = this._opts.grouping;
    this._posBy = { ...this._posBy, [g]: pos };
    this._collapsedBy = { ...this._collapsedBy, [g]: [...this._collapsed] };
  }

  // Each grouping keeps its own layout, so switching back finds the map as you left it.
  async _setGrouping(grouping) {
    if (this._opts.grouping === grouping || !this._ready) return;
    this._select(null, false, null, true);
    this._remember();
    this._opts.grouping = grouping;
    this._nodes = new Map();
    await this._load({ keepView: true, refit: true });
    this._save();
  }
  async _tidy() {
    if (!confirm(tr("Lay out the whole map again? Positions you dragged will be lost."))) return;
    this._select(null, false, null, true);
    const nodes = [...this._nodes.values()];
    layout(nodes, this._edges, new Map());
    for (const n of nodes) n.el.setAttribute("transform", `translate(${n.x},${n.y})`);
    this._route();
    this._fit();
  }

  async _reload() {
    if (!this._ready) return;
    const sel = this._selected;
    this._select(null, false, null, true);
    await this._load({ keepView: true });
    if (sel && this._byId(sel)) this._select(sel); else this._select(null);
  }

  // ------------------------------------------------------------ control

  _call(domain, service, data) {
    return this._hass.callService(domain, service, data).catch((e) => console.warn("automap:", e));
  }
  _toggleEntity(id) { return this._call("homeassistant", "toggle", { entity_id: id }); }
  // Ask in place of a row of buttons. Cancel takes the focus, so a stray Enter does nothing.
  _confirmIn(row, question, label, act) {
    const kids = [...row.childNodes];
    const back = () => { row.replaceChildren(...kids); row.onkeydown = null; };
    const cancel = h("button", { class: "btn outline", onclick: back }, tr("Cancel"));
    row.replaceChildren(h("span", { class: "ask", role: "alert" }, question), h("button", { class: "btn danger", onclick: () => { back(); act(); } }, label), cancel);
    row.onkeydown = (e) => { if (e.key === "Escape") { e.stopPropagation(); back(); } };
    cancel.focus();
  }

  // ------------------------------------------------------------ focus, search

  _matches() {
    const q = this._search.value.trim().toLowerCase();
    if (!q) return [];
    return [...this._nodes.values()].filter((n) => `${n.alias || n.label} ${n.id} ${(n.tags || []).join(" ")}`.toLowerCase().includes(q));
  }

  // Search dims what doesn't match; a focused flow hides everything outside it.
  _applyFocus() {
    const keep = this._focusing ? this._focusSet : null;
    const matches = keep ? [] : this._matches();
    const on = new Set(matches.map((n) => this._rep(n)));
    const wires = new Set([...on].flatMap((n) => n.rwires || []));
    this._svg.classList.toggle("dim", on.size > 0);
    for (const n of [...this._nodes.values(), ...this._groups.values()]) {
      n.el.classList.toggle("on", on.has(n));
      n.el.classList.toggle("sel", n.id === this._selected);
      n.el.classList.toggle("gone", !!keep && !keep.has(n.id));
    }
    for (const e of this._edges) {
      e.el.classList.toggle("on", wires.has(e));
      e.el.classList.toggle("gone", !!keep && !(keep.has(e.src) && keep.has(e.dst)));
    }
    for (const el of this._clusterEls?.values() || []) el.classList.toggle("gone", !!keep);
  }

  _selectNode(id, centre = false, runAt = null) { this._select(id, centre, runAt); }

  _select(id, centre = false, runAt = null, instant = false) {
    this._stopReplay();
    const n = id && this._byId(id);
    this._selected = n ? n.id : null;
    if (!n) { this._drawer.hidden = true; this._drawerView = null; this._exitFocus(instant); return; }
    this._showDetails(n, runAt);
    if (n.kind === "group") this._exitFocus(instant);
    else this._focusOn(n, instant);
  }

  // What flows into and out of a node, up to two steps each way, as columns either side of it.
  _focusTargets(sel) {
    const reach = (dir) => {
      const dist = new Map([[sel.id, 0]]);
      let frontier = [sel.id];
      for (let d = 1; d <= 2; d++) {
        const next = [];
        for (const id of frontier) for (const e of this._nodes.get(id).wires) {
          const o = dir > 0 ? (e.src === id ? e.dst : null) : (e.dst === id ? e.src : null);
          if (o && !dist.has(o)) { dist.set(o, d); next.push(o); }
        }
        frontier = next;
      }
      return dist;
    };
    const fwd = reach(1), back = reach(-1);
    const cols = new Map();
    for (const id of new Set([...fwd.keys(), ...back.keys()])) {
      const c = id === sel.id ? 0 : (fwd.get(id) ?? Infinity) <= (back.get(id) ?? Infinity) ? fwd.get(id) : -back.get(id);
      if (!cols.has(c)) cols.set(c, []);
      cols.get(c).push(this._nodes.get(id));
    }
    // Order each column by its neighbours, triggers before conditions next to the selection.
    const roleOf = (n) => n.wires.find((e) => (e.a === n && e.b === sel) || (e.b === n && e.a === sel))?.role;
    const rank = { trigger: 0, condition: 1, action: 2 };
    const keys = [...cols.keys()].sort((x, y) => x - y);
    for (const k of keys) cols.get(k).sort((x, y) => (rank[roleOf(x)] ?? 3) - (rank[roleOf(y)] ?? 3) || (x.alias || x.label).localeCompare(y.alias || y.label));
    const pos = new Map();
    const index = (c) => c.forEach((n, i) => pos.set(n.id, (i + 0.5) / c.length));
    keys.forEach((k) => index(cols.get(k)));
    const kept = new Set(pos.keys());
    for (let sweep = 0; sweep < 8; sweep++) {
      for (const k of sweep % 2 ? [...keys].reverse() : keys) {
        if (k === 0) continue;
        const c = cols.get(k);
        const bc = new Map(c.map((n) => {
          const ps = n.wires.map((e) => (e.a === n ? e.dst : e.src)).filter((o) => kept.has(o)).map((o) => pos.get(o));
          return [n.id, ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : pos.get(n.id)];
        }));
        c.sort((x, y) => bc.get(x.id) - bc.get(y.id));
        index(c);
      }
    }
    // Anchored on the selection where it already is, so the eye stays on it.
    const cx = sel.x, cy = sel.y + sel.h / 2;
    const targets = /** @type {Map<string, [number, number]> & { cols: Map<string, number> }} */ (new Map());
    targets.cols = new Map();
    for (const k of keys) {
      const c = cols.get(k);
      const colH = c.reduce((sum, n) => sum + n.h + 18, -18);
      let y = cy - colH / 2;
      for (const n of c) { targets.set(n.id, [Math.round(cx + k * 320), Math.round(y)]); targets.cols.set(n.id, k); y += n.h + 18; }
    }
    return targets;
  }

  _focusOn(n, instant = false) {
    if (!this._focusing) {
      this._homeView = { ...this._view };
      for (const m of this._nodes.values()) { m.hx = m.x; m.hy = m.y; }
      this._focusing = true;
      this._route();
    }
    const targets = this._focusTargets(n);
    // Refocusing: nodes joining the flow fan out from the new selection.
    if (this._focusSet) for (const id of targets.keys()) {
      if (this._focusSet.has(id)) continue;
      const m = this._nodes.get(id);
      this._move(m, n.x, n.y);
    }
    this._focusSet = new Set(targets.keys());
    this._applyFocus();
    this._cull();
    const box = (ids) => ids.map((id) => { const [x, y] = targets.get(id), m = this._nodes.get(id); return { x, y, w: m.w, h: m.h }; });
    let view = this._fitView(box([...targets.keys()]), 40, 1.1);
    if (view && view.k < 0.85) view = this._fitView(box([...targets.keys()].filter((id) => Math.abs(targets.cols.get(id)) <= 1)), 40, 1.1);
    if (view && view.k < 0.75) {
      // Still too small to read: centre the selection at a readable zoom and leave the rest to panning.
      const [sx, sy] = targets.get(n.id), focus = this._fitView([{ x: sx, y: sy, w: n.w, h: n.h }], 0, 0.85);
      if (focus) view = focus;
    }
    this._tween(targets, view, instant ? 0 : 420);
  }

  _exitFocus(instant = false) {
    if (!this._focusing) { this._applyFocus(); return; }
    const targets = new Map();
    for (const m of this._nodes.values()) {
      // Members of collapsed areas go straight home; nobody sees them move.
      if (this._collapsed.has(m.cluster)) this._move(m, m.hx, m.hy);
      else targets.set(m.id, [m.hx, m.hy]);
      delete m.hx; delete m.hy;
    }
    const view = this._homeView;
    this._focusing = false;
    this._focusSet = null;
    this._route();
    this._applyFocus();
    this._tween(targets, view, instant ? 0 : 420);
  }

  // Glide nodes (and the view) to new places, redrawing their wires on the way.
  _tween(targets, view, dur = 420) {
    cancelAnimationFrame(this._tweenRaf);
    const from = new Map([...targets.keys()].map((id) => { const n = this._nodes.get(id); return [id, [n.x, n.y]]; }));
    const v0 = { ...this._view };
    const wires = this._edges.filter((e) => targets.has(e.src) || targets.has(e.dst));
    const frame = (p) => {
      const t = 1 - (1 - p) ** 3;
      for (const [id, [tx, ty]] of targets) {
        const n = this._nodes.get(id), [fx, fy] = from.get(id);
        n.x = p === 1 ? tx : fx + (tx - fx) * t;
        n.y = p === 1 ? ty : fy + (ty - fy) * t;
        n.el.setAttribute("transform", `translate(${n.x},${n.y})`);
      }
      for (const e of wires) if (e.ra && e.rb && e.ra !== e.rb) e.el.setAttribute("d", wirePath(e.ra, e.rb));
      if (view) { this._view = { k: v0.k + (view.k - v0.k) * t, x: v0.x + (view.x - v0.x) * t, y: v0.y + (view.y - v0.y) * t }; this._applyView(); }
    };
    // Hidden pages get no animation frames, so they jump straight there.
    if (!dur || document.hidden || this._reduced) { frame(1); if (!this._focusing) this._placeClusterLabels(); this._cullSoon(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      frame(p);
      if (p < 1) this._tweenRaf = requestAnimationFrame(step);
      else { this._tweenRaf = null; if (!this._focusing) this._placeClusterLabels(); this._cullSoon(); }
    };
    this._tweenRaf = requestAnimationFrame(step);
  }

  _icon(parent, name, x, y, size = 16) { return s("use", { href: `#i-${name}`, x, y, width: size, height: size, class: "ico" }, parent); }

  // Zone titles keep a readable size on screen at any zoom, growing in map units as you zoom out.
  _scaleZoneTitles() {
    if (!this._clusterEls) return;
    const size = Math.max(14, Math.min(64, 13.5 / this._view.k));
    for (const z of this._clusterEls.values()) {
      if (!z.box) continue;
      const base = z.box.y - size * 0.55;
      z.title.setAttribute("font-size", size);
      z.title.setAttribute("x", z.box.x + size * 1.15);
      z.title.setAttribute("y", base);
      for (const [k, v] of Object.entries({ x: z.box.x, y: base - size * 0.8, width: size * 0.9, height: size * 0.9 })) z.chev.setAttribute(k, v);
      const w = this._measure(z.label, size, 600) + size * 1.4;
      for (const [k, v] of Object.entries({ x: z.box.x - 4, y: base - size * 1.15, width: w + 8, height: size * 1.55 })) z.hit.setAttribute(k, v);
    }
  }

  _platesSoon() {
    if (this._plateRaf) return;
    this._plateRaf = requestAnimationFrame(() => { this._plateRaf = null; if (!this._focusing) this._placeClusterLabels(); });
  }

  // A run's cause in words: "Kitchen presence changed", not "state of binary_sensor.kitchen_presence".
  _cause(source) {
    const s = source || "";
    const id = s.match(/[a-z_]+\.[a-z0-9_]+/)?.[0];
    if (id) return tr("{name} changed", { name: this._nodes.get(id)?.label || id });
    if (/^time pattern/.test(s)) return tr("Repeating schedule");
    if (/^time/.test(s)) return tr("Scheduled time");
    if (/^sun/.test(s)) return tr("Sunrise or sunset");
    if (/start/i.test(s)) return tr("Home Assistant started");
    if (/^event /.test(s)) return tr("Event {type}", { type: s.slice(6) });
    if (!s || /manual|action|service/.test(s)) return tr("Run by hand");
    return capital(s);
  }

  _clearFeed() { this._feed.replaceChildren(); this._feed.classList.add("empty"); }

  _closeBtn() { return h("button", { class: "btn icon close", title: tr("Close"), "aria-label": tr("Close"), onclick: () => this._select(null) }, icon("close")); }

  _kind(n) {
    const what = { automation: tr("Automation"), script: tr("Script"), time: tr("Schedule"), service: tr("Service call"), device: tr("Device"), virtual: tr("Group") }[n.kind]
      || domainName(n.id.split(".")[0]) || capital(n.id.split(".")[0].replace(/_/g, " "));
    const place = isOwner(n) ? n.cluster : n.area;
    if (!place || [tr("Other"), tr("Scripts"), tr("Shared")].includes(place)) return what;
    return this._areaNames?.has(place) ? tr("{what} in {place}", { what, place }) : tr("{place} {what}", { place, what: what.toLowerCase() });
  }

  _section(title, items) { return [h("h3", {}, title, h("span", { class: "n" }, String(items.length))), h("ul", {}, items)]; }

  _setPlayLabel(playing) { this._histPlayBtn?.replaceChildren(icon(playing ? "pause" : "play", 16), h("span", {}, playing ? tr("Pause") : tr("Play"))); }

  _navigate(path) {
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }
  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  // ------------------------------------------------------------ drawer views

  _openDrawer(view) {
    this._stopReplay();
    const d = this._drawer;
    d.replaceChildren(this._closeBtn());
    d.hidden = false;
    d.scrollTop = 0;
    this._drawerView = view;
    return d;
  }
  _row(other, role, right, verdict) {
    return h("li", { tabindex: "0", onclick: () => this._selectNode(other.id, true), title: role ? capital(role) : "" },
      role ? glyph(role, verdict) : icon(nodeIcon(other), 16),
      h("span", { class: "name" }, other.label),
      h("span", { class: "val" }, right ?? ""));
  }
  _stateText(o) {
    const st = this._states()[o.id];
    if (o.kind === "entity") return o.missing ? tr("Doesn't exist") : !st && o.snapshot ? tr("Snapshot") : capital(fmtState(st, this._ref()));
    if (o.kind === "automation") return st?.state === "off" ? tr("Off") : capital(ago(st?.attributes?.last_triggered, this._ref()));
    if (o.kind === "script") return st?.state === "on" ? tr("Running") : tr("Idle");
    if (o.kind === "time") return o.subEl?.textContent || "";
    return "";
  }
  _showDetails(n, runAt) {
    const d = this._openDrawer("node");
    if (n.kind === "group") return this._showGroup(d, n);
    const st = this._states()[n.id];
    const live = this._mode === "live";
    const ins = n.wires.filter((e) => e.b === n), outs = n.wires.filter((e) => e.a === n);
    const order = (list) => list.sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role]);
    const btn = (label, kind, onclick, extra = {}) => h("button", { class: `btn ${kind}`, onclick, disabled: extra.live && !live, title: extra.title }, label);
    const facts = (pairs) => h("dl", { class: "facts" }, pairs.filter(Boolean).flatMap(([k, v, cls]) => [h("dt", {}, k), h("dd", cls ? { class: cls } : {}, v)]));
    d.append(h("div", { class: "kicker" }, icon(nodeIcon(n), 16), this._kind(n)), h("h2", {}, n.label));
    if (!/^(svc|all|area|time|sun|pattern|ha):/.test(n.id)) d.append(h("div", { class: "id" }, n.id.replace(/^device:/, "")));
    if (isOwner(n)) {
      const cfg = n.config || {};
      if (cfg.description) d.append(h("p", { class: "desc" }, cfg.description));
      const off = st?.state === "off", cid = n.cfgId || cfg.id;
      const acts = h("div", { class: "acts" });
      const controls = this._settings.controls;
      if (n.kind === "automation") {
        if (controls) acts.append(btn(tr("Run"), "primary", () => this._call("automation", "trigger", { entity_id: n.id, skip_condition: false }), { live: true, title: tr("Run as if triggered; its conditions still apply") }),
          btn(tr("Run actions"), "outline", () => this._confirmIn(acts, tr("Skip the conditions and run its actions now?"), tr("Run actions"), () => this._call("automation", "trigger", { entity_id: n.id, skip_condition: true })), { live: true, title: tr("Run the actions and skip the conditions") }),
          btn(off ? tr("Enable") : tr("Disable"), "outline", () => this._call("automation", off ? "turn_on" : "turn_off", { entity_id: n.id }), { live: true }));
        if (cid) acts.append(btn(tr("Open editor"), controls ? "outline" : "primary", () => this._navigate(`/config/automation/edit/${cid}`)));
      } else {
        if (controls) acts.append(btn(tr("Run"), "primary", () => this._call("script", "turn_on", { entity_id: n.id }), { live: true }));
        acts.append(btn(tr("Open editor"), controls ? "outline" : "primary", () => this._navigate(`/config/script/edit/${n.id.slice(7)}`)));
      }
      const last = st?.attributes?.last_triggered;
      const definedIn = h("span", { class: "muted" }, "…");
      this._definedIn(n).then((where) => { definedIn.textContent = where; definedIn.className = ""; });
      d.append(acts, facts([
        [tr("Status"), n.kind === "script" ? (st?.state === "on" ? tr("Running") : tr("Idle")) : st?.state === "unavailable" ? tr("Unavailable") : off ? tr("Disabled") : tr("Enabled")],
        [tr("Last ran"), last ? tr("{ago}, at {time}", { ago: capital(ago(last, this._ref())), time: hhmm(last) }) : tr("Never")],
        n.summary ? [tr("Starts on"), capital(n.summary)] : null,
        [tr("Mode"), capital(cfg.mode || "single")],
        [tr("Defined in"), definedIn],
        n.blueprint ? [tr("Blueprint"), capital(blueprintName(n.blueprint.path)), n.blueprint.error ? "no" : null] : null,
        n.blueprint?.error ? [tr("Problem"), n.blueprint.error, "no"] : null,
        n.blocked?.length && this._opts.conditions && !off ? [tr("Blocked now"), n.blocked.join("; "), "no"] : null,
        n.broken ? [tr("Problem"), tr("Can't read its config: {error}", { error: n.broken }), "no"] : null,
      ]));
      const runs = h("ul", {}, h("li", { class: "static" }, tr("Loading…")));
      d.append(h("h3", {}, tr("Recent runs")), runs);
      this._loadRuns(n, runs, runAt);
      if (ins.length) d.append(...this._section(tr("Listens to"), order(ins).map((e) => {
        const r = e.role === "condition" && this._opts.conditions ? n.condRes?.get(e.a.id) : undefined;
        return this._row(e.a, e.role, h("span", {}, this._stateText(e.a), r != null ? h("span", { class: r ? "ok" : "no" }, r ? tr(", passes") : tr(", blocks")) : null), r);
      })));
      if (outs.length) d.append(...this._section(tr("Acts on"), order(outs).map((e) => this._row(e.b, e.role, this._stateText(e.b)))));
      const written = this._written?.[n.id] || n.config;
      if (written) d.append(h("details", {}, h("summary", {}, icon("chevron", 14), tr("Configuration")), h("pre", {}, yaml(written))));
      if (n.blueprint && !n.blueprint.error && n.config) d.append(h("details", {}, h("summary", {}, icon("chevron", 14), tr("Expanded from the blueprint")), h("pre", {}, yaml(n.config))));
      return;
    }
    if (n.kind === "entity") {
      const acts = h("div", { class: "acts" });
      if (this._settings.controls && TOGGLEABLE.has(n.id.split(".")[0]) && !n.missing) acts.append(btn(st?.state === "on" ? tr("Turn off") : tr("Turn on"), "primary", () => this._toggleEntity(n.id), { live: true }));
      acts.append(btn(tr("More info"), "outline", () => this._moreInfo(n.id)), btn(tr("History"), "outline", () => this._navigate(`/history?entity_id=${n.id}`)));
      d.append(acts, facts([
        [tr("State"), this._stateText(n), n.missing ? "no" : null],
        st ? [tr("Changed"), capital(ago(st.last_changed, this._ref()))] : null,
        n.area ? [tr("Area"), n.area] : null,
      ]));
      if (n.missing) d.append(h("p", { class: "note no" }, tr("This entity doesn't exist, so the automations that use it are broken.")));
    } else if (n.kind === "time" && n.schedule) {
      d.append(facts([[tr("Next"), this._stateText(n)]]));
    }
    if (outs.length) d.append(...this._section(tr("Feeds"), order(outs).map((e) => {
      const r = e.role === "condition" && this._opts.conditions ? e.b.condRes?.get(n.id) : undefined;
      return this._row(e.b, e.role, r != null ? h("span", { class: r ? "ok" : "no" }, r ? tr("Lets it run") : tr("Blocks it")) : this._stateText(e.b), r);
    })));
    if (ins.length) d.append(...this._section(tr("Changed by"), order(ins).map((e) => this._row(e.a, e.role, this._stateText(e.a)))));
  }
  _condMark(owner, e) {
    if (e.role !== "condition" || !this._opts.conditions) return null;
    const r = owner.condRes?.get(e.a.id);
    return r === true ? "passes" : r === false ? "blocks" : null;
  }

  _showGroup(d, g) {
    d.append(h("div", { class: "kicker" }, icon("layers", 16), tr("Collapsed area")), h("h2", {}, g.label));
    d.append(h("div", { class: "acts" }, h("button", { class: "btn primary", onclick: () => this._toggleCluster(g.cluster) }, tr("Expand"))));
    const autos = g.members.filter(isOwner);
    d.append(...this._section(tr("Automations"), autos.map((m) => this._row(m, null, this._stateText(m)))));
    const on = g.members.filter((m) => m.kind === "entity" && ACTIVE.has(this._states()[m.id]?.state));
    if (on.length) d.append(...this._section(tr("On now"), on.map((m) => this._row(m, null, this._stateText(m)))));
  }
  // ------------------------------------------------------------ trace replay

  _traceKey(n) { return n.kind === "automation" ? { domain: "automation", item_id: n.cfgId } : { domain: "script", item_id: n.id.slice(7) }; }

  async _loadRuns(n, ul, runAt) {
    const key = this._traceKey(n);
    let list = [];
    try { if (key.item_id) list = await within(this._ws({ type: "trace/list", ...key }), QUICK); } catch (_) { /* no traces */ }
    if (!ul.isConnected) return;
    list.sort((a, b) => Date.parse(b.timestamp.start) - Date.parse(a.timestamp.start));
    if (!list.length) { ul.replaceChildren(h("li", { class: "static" }, tr("No stored runs yet. Home Assistant keeps the last five."))); return; }
    ul.replaceChildren(...list.map((t) => {
      const [txt, cls] = outcome(t.script_execution) || [capital(t.state), ""];
      const li = h("li", { tabindex: "0", onclick: () => this._replay(n, t, li), title: tr("Replay this run on the map") },
        h("span", { class: "when" }, hhmm(t.timestamp.start)),
        h("span", { class: "name" }, this._cause(t.trigger), h("span", { class: "sub" }, capital(ago(t.timestamp.start)))),
        h("span", { class: `val ${cls}` }, txt));
      return li;
    }));
    // From the activity log: replay the run that matches the click.
    if (runAt) {
      const i = list.findIndex((t) => Math.abs(Date.parse(t.timestamp.start) - runAt) < 5000);
      if (i >= 0) ul.children[i].click();
    }
  }
  async _replay(n, summary, li) {
    this._stopReplay();
    const current = this._latest.take("replay");
    let t;
    try { t = await within(this._ws({ type: "trace/get", ...this._traceKey(n), run_id: summary.run_id }), QUICK); } catch (e) { console.warn("homenodes: couldn't load the run", e); return; }
    if (!current() || !li.isConnected) return;
    const cfg = t.config || n.config || {};
    const steps = [];
    for (const [path, arr] of Object.entries(t.trace || {})) for (const st of arr) steps.push({ path, ts: Date.parse(st.timestamp), result: st.result, error: st.error });
    steps.sort((a, b) => a.ts - b.ts || a.path.length - b.path.length);
    // A condition's per-entity results say the same thing more precisely; keep only those.
    for (let i = steps.length - 1; i >= 0; i--) if (steps.some((o) => o.path.startsWith(`${steps[i].path}/entity_id/`))) steps.splice(i, 1);
    const list = h("ul", {});
    const rows = steps.map((st) => {
      const { node: sub, entityIndex } = resolvePath(cfg, st.path);
      const one = entityIndex != null ? this._graph.resolve(sub?.entity_id)[entityIndex] : null;
      const kind = st.path.startsWith("trigger") ? "trigger"
        : /(^condition|\/conditions?(\/|$)|\/if(\/|$)|\/until|\/while)/.test(st.path) || (sub && !Array.isArray(sub) && sub.condition && !isLeaf(sub)) ? "condition"
        : isLeaf(sub) ? "action" : "flow";
      const ok = st.result?.result;
      const option = sub && !Array.isArray(sub) && sub.sequence && "conditions" in sub;
      const what = kind === "trigger" ? this._cause(t.trigger)
        : option ? (ok == null ? tr("option {n}", { n: Number(st.path.split("/").pop()) + 1 }) : ok ? tr("option {n}: taken", { n: Number(st.path.split("/").pop()) + 1 }) : tr("option {n}: not taken", { n: Number(st.path.split("/").pop()) + 1 }))
        : kind === "condition" ? `${this._condLabel(sub, one)}${st.result?.state != null && st.result?.wanted_state != null ? tr("; it was {state}", { state: st.result.state }) : ""}`
        : kind === "action" ? sub.action || sub.service || `${sub.domain} ${sub.type}`
        : sub?.choose ? (st.result?.choice != null ? tr("choose: option {n}", { n: st.result.choice + 1 }) : tr("choose: default")) : sub?.if ? tr("if") : sub?.delay ? tr("delay") : sub?.wait_template || sub?.wait_for_trigger ? tr("wait") : sub?.variables ? tr("variables") : sub?.stop ? tr("stop") : st.path;
      const mark = st.error ? h("span", { class: "val no" }, tr("Error")) : kind === "condition" && ok != null ? h("span", { class: `val ${ok ? "ok" : "no"}` }, ok ? tr("Passed") : tr("Failed")) : h("span", { class: "val" }, tr("+{n} s", { n: ((st.ts - steps[0].ts) / 1000).toFixed(2) }));
      const row = h("li", { class: "static", title: st.path }, glyph(kind === "flow" ? "condition" : kind, kind === "condition" ? ok : undefined), h("span", { class: "name" }, capital(what), st.error ? h("span", { class: "sub no" }, st.error) : null), mark);
      list.append(row);
      return { st, sub, one, kind, ok, row };
    });
    const box = h("div", {}, h("h3", {}, tr("Replay of the {time} run", { time: hhmm(summary.timestamp.start) }), h("span", { class: "n" }, (outcome(t.script_execution) || [t.script_execution])[0])), list);
    li?.closest("ul")?.after(box);
    this._replaying = { box, timers: [], marked: new Set() };
    rows.forEach((r, i) => this._replaying.timers.push(setTimeout(() => this._replayStep(n, r, rows), i * 650)));
    this._replaying.timers.push(setTimeout(() => this._clearMarks(), rows.length * 650 + 20000));
  }

  _condLabel(c, one) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return typeof c === "string" ? tr("template") : tr("conditions");
    const name = (id) => this._nodes.get(id)?.label || id;
    const ents = one ? [one] : this._graph.resolve(c.entity_id || []);
    const who = ents.map(name).join(", ");
    switch (c.condition) {
      case "trigger": return tr("trigger should be “{ids}”", { ids: asList(c.id).join(`” ${tr("or")} “`) });
      case "state": {
        const should = tr("{who} should be {state}", { who, state: asList(c.state).join(` ${tr("or")} `) });
        return c.for ? tr("{condition} for {duration}", { condition: should, duration: typeof c.for === "string" ? c.for : JSON.stringify(c.for) }) : should;
      }
      case "numeric_state": return tr("{who} should be {range}", { who, range: [c.above != null ? tr("above {n}", { n: c.above }) : null, c.below != null ? tr("below {n}", { n: c.below }) : null].filter(Boolean).join(" ") });
      case "time": return tr("time should be {span}", { span: [c.after, c.before].map((x) => (x || "").replace(/:00$/, "")).join("–") });
      case "template": return tr("template");
      case "and": case "or": case "not": return c.condition;
      default: return `${c.condition || tr("condition")} ${who}`.trim();
    }
  }

  _replayStep(n, r, rows) {
    rows.forEach((x) => x.row.classList.toggle("cur", x === r));
    const g = this._graph;
    if (r.kind === "trigger") {
      const ids = g.refsOf(r.sub, "trigger");
      for (const e of n.wires) if (e.b === n && ids.includes(e.src)) this._pulse(e, "trigger");
      this._flash(n);
    } else if (r.kind === "condition") {
      const ids = r.one ? [r.one] : g.refsOf(r.sub, "condition");
      for (const e of n.wires) {
        if (e.b !== n || !ids.includes(e.src)) continue;
        if (r.ok != null) { e.el.classList.add(r.ok ? "tpass" : "tfail"); e.el.classList.remove(r.ok ? "tfail" : "tpass"); this._replaying.marked.add(e); }
        this._pulse(e, "condition");
      }
    } else if (r.kind === "action") {
      const ids = g.refsOf(r.sub, "action");
      for (const e of n.wires) if (e.a === n && ids.includes(e.dst)) this._pulse(e, "action");
    }
  }
  _clearMarks() { for (const e of this._replaying?.marked || []) e.el.classList.remove("tpass", "tfail"); }
  _stopReplay() {
    if (!this._replaying) return;
    this._replaying.timers.forEach(clearTimeout);
    this._clearMarks();
    this._replaying.box.remove();
    this._replaying = null;
  }

  // ------------------------------------------------------------ up next

  _showUpNext() {
    const keepOpen = this._drawerView === "upnext";
    const d = keepOpen ? this._drawer : this._openDrawer("upnext");
    if (keepOpen) d.replaceChildren(this._closeBtn());
    if (!keepOpen) { this._selected = null; this._exitFocus(); }
    const now = new Date(), horizon = now.getTime() + 12 * 3600e3, states = this._hass.states;
    const items = [], repeating = [];
    for (const n of this._nodes.values()) {
      if (n.kind !== "time" || !n.schedule) continue;
      const owners = n.wires.filter((e) => e.a === n).map((e) => e.b);
      const next = nextAt(n.schedule, now, states, this._tz);
      if (n.schedule.type === "pattern") { repeating.push({ n, owners, next }); continue; }
      if (next && next.getTime() <= horizon) for (const o of owners) items.push({ at: next, o, why: n.schedule.type === "time" ? null : capital(n.label) });
    }
    for (const o of this._nodes.values()) {
      for (const dt of o.dtTriggers || []) {
        const m = (states[dt]?.state || "").match(/(\d\d):(\d\d)(?::(\d\d))?$/);
        if (!m) continue;
        const z = partsIn(now, this._tz), wall = { hour: +m[1], minute: +m[2], second: +(m[3] || 0) };
        let t = instantIn({ ...z, ...wall }, this._tz);
        if (t <= now.getTime()) t = instantIn({ ...z, ...wall, day: z.day + 1 }, this._tz);
        const at = new Date(t);
        if (at.getTime() <= horizon) items.push({ at, o, why: tr("Set by {name}", { name: this._nodes.get(dt)?.label || dt }) });
      }
    }
    items.sort((a, b) => a.at.getTime() - b.at.getTime());
    d.append(h("div", { class: "kicker" }, icon("clock", 16), tr("The next 12 hours")), h("h2", {}, tr("Up next")));
    const note = (o) => {
      if (states[o.id]?.state === "off") return h("span", { class: "sub" }, tr("Disabled, so it won't run"));
      if (o.blocked?.length) return h("span", { class: "sub no" }, tr("Blocked now: {reasons}", { reasons: o.blocked.join("; ") }));
      return null;
    };
    d.append(h("ul", {}, items.length ? items.map(({ at, o, why }) => h("li", { tabindex: "0", onclick: () => this._selectNode(o.id, true) },
      h("span", { class: "big" }, hhmm(at)), h("span", { class: "name" }, o.label, why ? h("span", { class: "sub" }, why) : null, note(o)), h("span", { class: "val" }, capital(inFmt(at.getTime() - now.getTime())))))
      : h("li", { class: "static" }, tr("Nothing is scheduled in the next 12 hours."))));
    if (repeating.length) {
      const rows = repeating.flatMap(({ n, owners, next }) => owners.map((o) => h("li", { tabindex: "0", onclick: () => this._selectNode(o.id, true) },
        icon("repeat", 16), h("span", { class: "name" }, o.label, h("span", { class: "sub" }, capital(n.label)), note(o)), h("span", { class: "val" }, next ? capital(inFmt(next.getTime() - now.getTime())) : ""))));
      d.append(...this._section(tr("Repeating"), rows));
    }
  }
  // ------------------------------------------------------------ heat

  async _loadHeat() {
    const ids = [...this._nodes.values()].filter(isOwner).map((n) => n.id);
    const days = this._settings.heatDays;
    const current = this._latest.take("heat");
    const end = new Date(), start = new Date(end.getTime() - days * 86400e3);
    const span = { start_time: start.toISOString(), end_time: end.toISOString(), entity_ids: ids };
    let counts = {}, approx = false;
    try {
      const lb = await within(this._ws({ type: "logbook/get_events", ...span }), SLOW);
      for (const e of lb) if (/^(triggered|started)/.test(e.message || "")) counts[e.entity_id] = (counts[e.entity_id] || 0) + 1;
    } catch (first) {
      // No logbook: each run writes a row or two to the recorder, which is near enough.
      approx = true;
      try {
        if (first instanceof TimeoutError) throw first;
        const hist = await within(this._ws({ type: "history/history_during_period", ...span, minimal_response: false, no_attributes: true, significant_changes_only: false }), SLOW);
        for (const [id, rows] of Object.entries(hist || {})) counts[id] = Math.round(Math.max(0, rows.length - 1) / 2);
      } catch (e) {
        console.warn("homenodes: couldn't count runs for activity heat:", reason(e));
        if (current()) { this._heat = null; this._repaintOwners(); }
        return;
      }
    }
    if (!current()) return;
    this._heat = { counts, approx, days };
    this._repaintOwners();
  }

  // ------------------------------------------------------------ health

  // Where an automation or script lives: Home Assistant's editor API only knows the ones it can
  // edit, so a 404 means it is defined in YAML (a package, an include, or configuration.yaml).
  async _definedIn(n) {
    if (!this._defined.has(n.id)) {
      const id = n.kind === "automation" ? n.cfgId : n.id.slice(7);
      const ask = async () => {
        if (!id) return tr("YAML");
        if (!this._hass.callApi) return tr("Unknown");
        try { await this._hass.callApi("GET", `config/${n.kind}/config/${encodeURIComponent(id)}`); return tr("The UI"); }
        catch (e) {
          const status = e?.status_code ?? e?.status;
          return status === 404 || /not ?found/i.test(String(e?.body?.message ?? e?.error ?? e?.message ?? "")) ? tr("YAML") : tr("Unknown");
        }
      };
      this._defined.set(n.id, ask());
    }
    return this._defined.get(n.id);
  }

  _issues() {
    const out = [];
    const states = this._hass.states;
    const label = (n) => n.label;
    const users = (n) => [...new Set(n.wires.map((e) => (e.a === n ? e.b : e.a)).filter(isOwner).map(label))].join(", ");
    for (const n of this._nodes.values()) {
      if (n.missing) out.push({ sev: "error", kind: tr("Broken references"), id: [...n.wires.map((e) => (e.a === n ? e.b : e.a)).filter(isOwner)][0]?.id || n.id, text: tr("{name} doesn't exist", { name: n.label }), note: tr("used by {names}", { names: users(n) }) });
      if (isOwner(n) && (n.broken || states[n.id]?.state === "unavailable")) out.push({ sev: "error", kind: tr("Automations that can't load"), id: n.id, text: label(n), note: n.broken || "unavailable" });
      if (this._tplOverflow?.has(n.id)) out.push({ sev: "info", kind: tr("Template conditions not checked live"), id: n.id, text: label(n), note: tr("more than {n} templates are in use", { n: MAX_TEMPLATES }) });
      if (isOwner(n) && n.blueprint?.error) out.push({ sev: "warn", kind: tr("Blueprints that can't be read"), id: n.id, text: label(n), note: `${n.blueprint.path}: ${n.blueprint.error}` });
    }
    // Listed once per entity, with everything that waits on it.
    for (const n of this._nodes.values()) {
      if (n.kind !== "entity" || n.missing || n.snapshot) continue;
      const st = states[n.id];
      if (!st || !["unavailable", "unknown"].includes(st.state)) continue;
      const watchers = n.wires.filter((e) => e.a === n && e.role !== "action").map((e) => e.b).filter(isOwner);
      if (watchers.length) out.push({ sev: "warn", kind: tr("Waiting on something unavailable"), id: n.id, text: tr("{name} is {state}", { name: n.label, state: st.state }), note: watchers.length === 1 ? tr("waited on by {names}", { names: watchers.map(label).join(", ") }) : tr("{n} automations wait on it: {names}", { n: watchers.length, names: watchers.map(label).join(", ") }) });
    }
    const autos = [...this._nodes.values()].filter((n) => n.kind === "automation");
    const sets = new Map(autos.map((n) => [n, {
      // Only clock triggers: an on/off pair sharing a sensor is normal, two jobs at 21:30 are not.
      t: new Set(n.wires.filter((e) => e.b === n && e.role === "trigger" && e.a.kind === "time").map((e) => e.src)),
      a: new Set(n.wires.filter((e) => e.a === n && e.role === "action").map((e) => e.dst)),
    }]));
    for (let i = 0; i < autos.length; i++) for (let j = i + 1; j < autos.length; j++) {
      const A = sets.get(autos[i]), B = sets.get(autos[j]);
      const trig = [...A.t].filter((x) => B.t.has(x)), act = [...A.a].filter((x) => B.a.has(x));
      if (trig.length && act.length && states[autos[i].id]?.state !== "off" && states[autos[j].id]?.state !== "off") {
        const nm = (id) => this._nodes.get(id)?.label || id;
        out.push({ sev: "warn", kind: tr("Possible duplicates"), id: autos[i].id, text: tr("{a} and {b}", { a: label(autos[i]), b: label(autos[j]) }), note: tr("both act on {targets} on {triggers}", { targets: act.map(nm).join(", "), triggers: trig.map(nm).join(", ") }) });
      }
    }
    for (const n of autos) {
      const st = states[n.id];
      if (!st || st.state === "unavailable") continue;
      if (st.state === "off") { out.push({ sev: "info", kind: tr("Disabled"), id: n.id, text: label(n) }); continue; }
      const last = st.attributes?.last_triggered;
      if (!last || Date.now() - Date.parse(last) > 30 * 86400e3) out.push({ sev: "info", kind: tr("Not run in 30 days"), id: n.id, text: label(n), note: last ? tr("last ran {ago}", { ago: ago(last) }) : tr("has never run") });
    }
    return out.concat(this._fights || []);
  }

  _refreshHealth() {
    const n = this._issues().filter((i) => i.sev !== "info").length;
    this._healthBadge.textContent = n ? String(n) : "";
  }

  // Two automations flipping the same thing within a minute, from the last day's logbook.
  async _loadFights() {
    const targets = [...new Set(this._edges.filter((e) => e.role === "action" && e.b.kind === "entity" && !e.b.missing).map((e) => e.dst))];
    const end = new Date(), start = new Date(end.getTime() - 86400e3);
    const lb = await within(this._ws({ type: "logbook/get_events", start_time: start.toISOString(), end_time: end.toISOString(), entity_ids: targets }), SLOW);
    const by = new Map();
    for (const e of lb) if (e.context_entity_id?.startsWith("automation.") && e.state != null) {
      if (!by.has(e.entity_id)) by.set(e.entity_id, []);
      by.get(e.entity_id).push({ t: typeof e.when === "number" ? e.when * 1000 : Date.parse(e.when), who: e.context_entity_id, state: e.state });
    }
    const found = new Map();
    for (const [id, list] of by) {
      list.sort((a, b) => a.t - b.t);
      for (let i = 1; i < list.length; i++) {
        const p = list[i - 1], c = list[i];
        if (p.who !== c.who && p.state !== c.state && c.t - p.t < 60000) {
          const k = `${id}|${[p.who, c.who].sort().join("|")}`;
          found.set(k, { id, a: p.who, b: c.who, n: (found.get(k)?.n || 0) + 1 });
        }
      }
    }
    const nm = (id) => this._nodes.get(id)?.label || id;
    this._fights = [...found.values()].map((f) => ({ sev: "warn", kind: tr("Fighting in the last day"), id: f.a, text: tr("{a} vs {b}", { a: nm(f.a), b: nm(f.b) }), note: f.n > 1 ? tr("flipped {name} within a minute of each other {n} times", { name: nm(f.id), n: f.n }) : tr("flipped {name} within a minute of each other {n} time", { name: nm(f.id), n: f.n }) }));
  }

  /** "3 problems to look at, and 1 note." @param {number} problems @param {number} notes */
  _healthSummary(problems, notes) {
    const p = problems === 1 ? tr("1 problem to look at") : tr("{n} problems to look at", { n: problems });
    if (!notes) return tr("{problems}.", { problems: p });
    return tr("{problems}, and {notes}.", { problems: p, notes: notes === 1 ? tr("1 note") : tr("{n} notes", { n: notes }) });
  }

  async _showHealth() {
    const d = this._openDrawer("health");
    this._selected = null;
    this._exitFocus();
    const render = (pending) => {
      d.replaceChildren(this._closeBtn(), h("div", { class: "kicker" }, icon("pulse", 16), tr("Checks across every automation")), h("h2", {}, tr("Health")));
      const issues = this._issues();
      const problems = issues.filter((i) => i.sev !== "info").length, notes = issues.length - problems;
      d.append(h("p", { class: "desc" }, problems ? this._healthSummary(problems, notes) : tr("Nothing needs attention.")));
      for (const k of [...new Set(issues.map((i) => i.kind))]) {
        const list = issues.filter((i) => i.kind === k);
        d.append(...this._section(k, list.map((i) => h("li", { tabindex: "0", onclick: () => this._selectNode(i.id, true), title: { error: tr("Problem"), warn: tr("Warning"), info: tr("Note") }[i.sev] },
          h("span", { class: `sev ${i.sev}` }), h("span", { class: "name" }, i.text, i.note ? h("span", { class: "sub" }, capital(i.note)) : null)))));
      }
      if (pending) d.append(h("p", { class: "note" }, pending));
      this._refreshHealth();
    };
    render(tr("Checking the last 24 hours for automations fighting each other…"));
    try { await this._loadFights(); render(null); } catch (e) {
      this._fights = [];
      render(e instanceof TimeoutError ? tr("Checking for fights gave up: the logbook took too long to answer.") : tr("Checking for fights needs Home Assistant's logbook, which isn't enabled."));
    }
  }
  // ------------------------------------------------------------ history

  async _enterHistory() {
    this._mode = "history";
    this._select(null);
    this._stage.classList.add("hist");
    this._histBtn.setAttribute("aria-pressed", "true");
    if (!this._histBar) this._buildHistBar();
    this._histBar.hidden = false;
    this._clearFeed();
    await this._loadHistory(Number(this._histRange.value));
  }

  _buildHistBar() {
    this._histRange = h("select", { title: tr("How far back"), "aria-label": tr("How far back"), onchange: () => this._loadHistory(Number(this._histRange.value)) },
      [[1, tr("Last hour")], [6, tr("Last 6 hours")], [24, tr("Last 24 hours")], [72, tr("Last 3 days")]].map(([v, l]) => h("option", { value: v, selected: v === 24 }, l)));
    this._histSpeed = h("select", { title: tr("Playback speed"), "aria-label": tr("Playback speed") },
      [[60, tr("1 minute a second")], [300, tr("5 minutes a second")], [1800, tr("30 minutes a second")], [7200, tr("2 hours a second")]].map(([v, l]) => h("option", { value: v, selected: v === 300 }, l)));
    this._histPlayBtn = h("button", { class: "btn primary", onclick: () => (this._histTimer ? this._histPause() : this._histPlay()) });
    this._setPlayLabel(false);
    this._histTime = h("span", { class: "htime" });
    this._histNote = h("span", { class: "hnote" });
    this._histSlider = h("input", { type: "range", min: 0, max: 1, value: 1, step: 1, "aria-label": tr("Time"), oninput: () => { this._histPause(); this._histSeek(this._hist.start + Number(this._histSlider.value) * 1000); } });
    this._histStrip = h("canvas", { height: 28 });
    this._histBar = h("div", { class: "histbar" },
      h("div", { class: "row" }, this._histPlayBtn, this._histTime, this._histSpeed, this._histRange, h("span", { class: "grow" }), this._histNote,
        h("button", { class: "btn outline", onclick: () => this._exitHistory() }, tr("Back to live"))),
      h("div", { class: "scrub", title: tr("Each mark is an automation run") }, this._histStrip, this._histSlider));
    this._stage.append(this._histBar);
  }
  async _loadHistory(hours) {
    this._histPause();
    const current = this._latest.take("history");
    this._histNote.textContent = tr("Loading…");
    try { await this._fetchHistory(hours, current); } catch (e) {
      if (current()) this._histNote.textContent = tr("Couldn't load history: {error}", { error: reason(e) });
    }
  }
  async _fetchHistory(hours, current) {
    const end = Date.now(), start = end - hours * 3600e3;
    const iso = (t) => new Date(t).toISOString();
    const ids = [...this._nodes.values()].filter((n) => this._hass.states[n.id]).map((n) => n.id);
    const span = { start_time: iso(start), end_time: iso(end), entity_ids: ids };
    const [hist, lb] = await Promise.all([
      within(this._ws({ type: "history/history_during_period", ...span, minimal_response: true, no_attributes: true, significant_changes_only: false }), SLOW),
      within(this._ws({ type: "logbook/get_events", ...span }), SLOW).catch(() => null),
    ]);
    if (!current() || this._mode !== "history") return;
    const ms = (v) => (typeof v === "number" ? v * 1000 : Date.parse(v));
    const series = new Map(), events = [];
    for (const [id, rows] of Object.entries(hist || {})) {
      const t = rows.map((r) => ms(r.lu ?? r.last_updated)), v = rows.map((r) => r.s ?? r.state);
      series.set(id, { t, v });
      if (!lb && !/^(automation|script)\./.test(id)) for (let i = 1; i < t.length; i++) if (v[i] !== v[i - 1]) events.push({ t: t[i], kind: "state", id, changed: true });
    }
    if (lb) {
      for (const e of lb) {
        if (!e.entity_id) continue;
        const t = ms(e.when);
        if (/^(automation|script)\./.test(e.entity_id)) { if (/^(triggered|started)/.test(e.message || "")) events.push({ t, kind: "run", id: e.entity_id, source: e.source || (e.message || "").replace(/^triggered by /, "") }); }
        else if (e.state != null) events.push({ t, kind: "state", id: e.entity_id, changed: true, owner: e.context_entity_id || null });
      }
    } else {
      // Without the logbook, a run is only visible as rows on the automation's own history.
      const owners = ids.filter((id) => /^(automation|script)\./.test(id));
      const ah = await within(this._ws({ type: "history/history_during_period", ...span, entity_ids: owners, minimal_response: false, no_attributes: true, significant_changes_only: false }), SLOW);
      if (!current() || this._mode !== "history") return;
      for (const [id, rows] of Object.entries(ah || {})) {
        let last = 0;
        for (const r of rows.slice(1)) { const t = ms(r.lu ?? r.last_updated); if (t - last > 3000) events.push({ t, kind: "run", id, source: "" }); last = t; }
      }
    }
    events.sort((a, b) => a.t - b.t);
    this._hist = { start, end, series, events, exact: !!lb, T: end, idx: 0, cache: new Map(), lastRun: new Map() };
    this._histSlider.max = String(Math.round((end - start) / 1000));
    const runs = events.filter((e) => e.kind === "run").length;
    this._histNote.textContent = lb ? tr("{n} runs", { n: runs }) : tr("≈{n} runs · causes need HA's logbook", { n: runs });
    this._drawStrip();
    this._histSeek(start);
  }

  _histStatesAt(T) {
    const H = this._hist, live = this._hass.states, out = { ...live };
    for (const [id, se] of H.series) {
      const base = live[id];
      if (!base) continue;
      let lo = 0, hi = se.t.length - 1, k = 0;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (se.t[mid] <= T) { k = mid; lo = mid + 1; } else hi = mid - 1; }
      const lr = H.lastRun.get(id);
      const key = `${se.v[k]}|${se.t[k]}|${lr || ""}`;
      const c = H.cache.get(id);
      if (c?.key === key) { out[id] = c.st; continue; }
      const st = { ...base, state: se.v[k], last_changed: new Date(se.t[k]).toISOString(), attributes: lr || /^(automation|script)\./.test(id) ? { ...base.attributes, last_triggered: lr ? new Date(lr).toISOString() : null } : base.attributes };
      H.cache.set(id, { key, st });
      out[id] = st;
    }
    return out;
  }

  _histSeek(T) {
    const H = this._hist;
    if (!H) return;
    H.T = Math.max(H.start, Math.min(H.end, T));
    H.idx = 0;
    H.lastRun = new Map();
    while (H.idx < H.events.length && H.events[H.idx].t <= H.T) { const e = H.events[H.idx++]; if (e.kind === "run") H.lastRun.set(e.id, e.t); }
    this._histFrame([]);
  }

  _histFrame(batch) {
    const H = this._hist;
    this._histStates = this._histStatesAt(H.T);
    this._syncStates();
    const animate = batch.length <= 12;
    for (const e of batch) {
      const n = this._nodes.get(e.id);
      if (!n) continue;
      if (e.kind === "run") this._runVisual(n, e.source, e.t, animate);
      else if (animate) this._changeVisual(n, e.changed, e.owner);
    }
    this._histTime.textContent = dayTime(H.T);
    this._histSlider.value = String(Math.round((H.T - H.start) / 1000));
    if (performance.now() - (this._histEvalAt || 0) > 1000) { this._histEvalAt = performance.now(); this._evalAll(); }
  }

  _histPlay() {
    const H = this._hist;
    if (!H) return;
    if (H.T >= H.end - 1000) this._histSeek(H.start);
    this._setPlayLabel(true);
    let last = performance.now();
    const step = (now) => {
      const T = Math.min(H.end, H.T + (now - last) * Number(this._histSpeed.value));
      last = now;
      const batch = [];
      while (H.idx < H.events.length && H.events[H.idx].t <= T) { const e = H.events[H.idx++]; batch.push(e); if (e.kind === "run") H.lastRun.set(e.id, e.t); }
      H.T = T;
      this._histFrame(batch);
      if (T >= H.end) return this._histPause();
      this._histTimer = requestAnimationFrame(step);
    };
    this._histTimer = requestAnimationFrame(step);
  }

  _histPause() {
    if (this._histTimer) cancelAnimationFrame(this._histTimer);
    this._histTimer = null;
    this._setPlayLabel(false);
  }

  _drawStrip() {
    const c = this._histStrip, H = this._hist;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, c.clientWidth * dpr);
    c.height = Math.max(1, c.clientHeight * dpr);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = getComputedStyle(this).getPropertyValue("--in").trim() || "#F2A63E";
    ctx.globalAlpha = 0.55;
    for (const e of H.events) {
      if (e.kind !== "run") continue;
      ctx.fillRect(Math.round(((e.t - H.start) / (H.end - H.start)) * c.width), 6 * dpr, Math.max(1, 1.5 * dpr), c.height - 12 * dpr);
    }
  }
  _exitHistory() {
    this._histPause();
    this._latest.take("history");
    this._mode = "live";
    this._histStates = null;
    this._stage.classList.remove("hist");
    this._histBtn.setAttribute("aria-pressed", "false");
    if (this._histBar) this._histBar.hidden = true;
    this._clearFeed();
    this._syncStates(true);
    this._evalAll();
  }
}

if (!customElements.get("homenodes-panel")) customElements.define("homenodes-panel", HomeNodesPanel);
