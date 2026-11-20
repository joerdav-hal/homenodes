// The panel's stylesheet: light tokens on :host, dark ones on :host([dark]).

export const CSS = `
:host { display: block; height: 100vh; height: 100dvh; position: relative; overflow: hidden;
  --canvas: #EEF1F4; --grid: rgba(26,31,39,.10); --plate: rgba(26,31,39,.03); --surface: #FFFFFF; --raised: #FFFFFF;
  --ink: #1A1F27; --ink-2: #3B4351; --muted: #687182; --line: #D7DDE4; --line-strong: #B9C1CC;
  --hover: rgba(26,31,39,.06); --hover-strong: rgba(26,31,39,.11);
  --in: #C47A12; --out: #0B87AD; --pass: #1D9156; --block: #CC3A3A;
  --shadow: 0 10px 28px rgba(16,24,40,.14); --histh: 96px;
  font-family: var(--ha-font-family-body, Roboto, "Noto Sans", system-ui, sans-serif); color: var(--ink); background: var(--canvas);
  -webkit-font-smoothing: antialiased; }
:host([dark]) {
  --canvas: #161A20; --grid: rgba(230,234,240,.075); --plate: rgba(230,234,240,.028); --surface: #1E242C; --raised: #242B34;
  --ink: #E7EAEE; --ink-2: #C3C9D2; --muted: #8C95A4; --line: #2B333E; --line-strong: #3B4553;
  --hover: rgba(230,234,240,.06); --hover-strong: rgba(230,234,240,.12);
  --in: #F2A63E; --out: #46C3E2; --pass: #5DCB8B; --block: #F06D6D;
  --shadow: 0 12px 32px rgba(0,0,0,.5); }
* { box-sizing: border-box; }
[hidden], .folded, .gone { display: none !important; }
.ico { fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.num { font-variant-numeric: tabular-nums; }

/* Buttons: one family, three weights. */
.btn { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 11px; border-radius: 6px; border: 1px solid transparent;
  background: transparent; color: var(--ink); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.btn:hover { background: var(--hover); }
.btn[aria-pressed="true"] { background: var(--hover-strong); }
.btn.outline { border-color: var(--line); }
.btn.outline:hover { border-color: var(--line-strong); }
.btn.primary { background: var(--ink); color: var(--surface); }
.btn.primary:hover { background: var(--ink-2); }
.btn.icon { width: 32px; padding: 0; justify-content: center; }
.btn:disabled { opacity: .4; cursor: default; background: transparent; }
.btn:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible, li[tabindex]:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.btn .ico { color: var(--muted); }
.btn.primary .ico { color: inherit; }
select { height: 32px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; }

/* Toolbar */
.bar { position: absolute; inset: 0 0 auto 0; height: 52px; display: flex; align-items: center; gap: 4px; padding: 0 10px 0 16px; z-index: 4;
  background: var(--surface); border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; }
.bar h1 { font-size: 15.5px; font-weight: 600; margin: 0; white-space: nowrap; letter-spacing: -.005em; }
.bar .count { font-size: 12.5px; color: var(--muted); margin: 0 12px 0 10px; white-space: nowrap; }
.grow { flex: 1; }
.sep { width: 1px; height: 20px; background: var(--line); margin: 0 6px; flex: none; }
.search { position: relative; margin-right: 8px; flex: none; }
.search .ico { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.search input { height: 34px; width: min(300px, 34vw); min-width: 140px; border-radius: 8px; border: 1px solid var(--line); background: var(--canvas);
  color: var(--ink); padding: 0 12px 0 34px; font: inherit; font-size: 13.5px; outline: none; }
.search input:focus { border-color: var(--line-strong); }
.search input::placeholder { color: var(--muted); }
.pill { display: inline-block; min-width: 18px; padding: 0 6px; border-radius: 9px; font-size: 11.5px; font-weight: 600; line-height: 18px; text-align: center;
  background: color-mix(in srgb, var(--block) 15%, transparent); color: var(--block); }
.pill:empty { display: none; }
.menu { margin-right: 4px; }

/* Popover menus */
.pop { position: absolute; top: 58px; z-index: 6; min-width: 260px; padding: 6px; background: var(--raised); color: var(--ink);
  border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); }
.pop .item { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px; background: none;
  color: inherit; text-align: left; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
.pop .item:hover { background: var(--hover); }
.pop .item small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 2px; line-height: 1.4; }
.pop .tick { width: 16px; height: 16px; margin-top: 1px; color: var(--ink); }
.pop hr { border: 0; border-top: 1px solid var(--line); margin: 6px 4px; }
.pop .key { padding: 4px 10px 6px; display: grid; grid-template-columns: 22px 1fr; gap: 6px 8px; align-items: center; font-size: 12.5px; color: var(--ink-2); }
.pop .key b { grid-column: 1 / -1; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 2px; }

/* Canvas */
.stage { position: absolute; inset: 52px 0 0 0; }
svg.map { width: 100%; height: 100%; display: block; touch-action: none; user-select: none; -webkit-user-select: none; }
svg.map.panning { cursor: grabbing; }
.zone .plate { fill: var(--plate); stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
.zone .cl { cursor: pointer; }
.zone .cl .zt { fill: var(--ink-2); font-weight: 600; letter-spacing: -.01em; }
.zone .cl .ico { color: var(--muted); }
.zone .cl:hover .zt { fill: var(--ink); }
.zone .cl .zhit { fill: transparent; }

.wire { fill: none; stroke-width: 1.25; opacity: .38; stroke-linecap: round; vector-effect: non-scaling-stroke; transition: opacity .2s; }
.wire.trigger { stroke: var(--in); }
.wire.action { stroke: var(--out); }
.wire.condition { stroke: var(--muted); stroke-dasharray: 3 4; }
.wire.learned { stroke-dasharray: 1 5; }
.wire.condition.pass { stroke: var(--pass); opacity: .6; }
.wire.condition.fail { stroke: var(--block); opacity: .7; }
.wire.live { opacity: .95; stroke-width: 1.6; stroke-dasharray: 6 8; animation: flow 1.2s linear infinite; }
.wire.hot { opacity: 1; stroke-width: 2.6; stroke-dasharray: none; animation: none; }
.wire.tpass, .wire.tfail { opacity: 1 !important; stroke-width: 2.6; stroke-dasharray: none; animation: none; }
.wire.tpass { stroke: var(--pass) !important; }
.wire.tfail { stroke: var(--block) !important; }
@keyframes flow { to { stroke-dashoffset: -28; } }
.spark { pointer-events: none; fill: currentColor; filter: drop-shadow(0 0 5px currentColor); }
.spark.trigger { color: var(--in); }
.spark.action { color: var(--out); }
.spark.condition { color: var(--muted); filter: none; }

/* Components: one anatomy, icon then name then value. */
.node { cursor: pointer; transition: opacity .2s; }
.node .body { fill: var(--surface); stroke: var(--line); stroke-width: 1; transition: stroke .25s, fill .25s; }
.node .ico { color: var(--muted); transition: color .25s; }
.node .t1 { font-size: 13px; font-weight: 600; fill: var(--ink); }
.node.entity .t1, .node.service .t1, .node.device .t1, .node.virtual .t1 { font-size: 12.5px; font-weight: 500; }
.node .t2 { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.node .port { fill: var(--canvas); stroke: var(--line-strong); stroke-width: 1.25; }
.node .hit { fill: transparent; }
.node.tog .hit { cursor: pointer; }
.node.tog:hover .ico { color: var(--ink); }
.node .heat { fill: var(--in); }
.node.time .ico, .node.recent .ico, .node.active .ico { color: var(--in); }
.node.time .t1 { font-variant-numeric: tabular-nums; }
.node.active .body { stroke: color-mix(in srgb, var(--in) 55%, var(--line)); }
.node.active .t2 { fill: var(--ink-2); }
.node.unavail .t2.state, .node.missing .t2.state { fill: var(--block); }
.node.missing .body, .node.broken .body { stroke: var(--block); stroke-dasharray: 4 3; }
.node.virtual .body { stroke-dasharray: 5 4; }
.node.disabled { opacity: .45; }
.node.cold { opacity: .55; }
.node.blocked .sum { fill: var(--block); }
.node.group .body { fill: var(--raised); stroke: var(--line-strong); }
.node.group .t1 { font-size: 15px; }
.node.flash .body { stroke: var(--out); stroke-width: 2; fill: color-mix(in srgb, var(--out) 10%, var(--surface)); transition: none; }
.node.sel .body { stroke: var(--ink); stroke-width: 1.5; }
.dim .node:not(.on) { opacity: .14; }
.dim .wire:not(.on) { opacity: .06; }
.dim .wire.on { opacity: .9; }
/* Zoomed out: components become plain blocks, and only state shows. */
.far .node text, .far .node .ico, .far .node .port, .far .node .heat { display: none; }
.far .node .body { stroke-width: 1.5; }
.far .wire:not(.live):not(.hot) { opacity: .2; }
.far .node.active .body { fill: color-mix(in srgb, var(--in) 45%, var(--surface)); stroke: var(--in); }
.far .node.recent .body { fill: color-mix(in srgb, var(--in) 22%, var(--surface)); }
.far .node.flash .body { fill: color-mix(in srgb, var(--out) 55%, var(--surface)); stroke: var(--out); }
.far .node.blocked .body { stroke: color-mix(in srgb, var(--block) 70%, var(--line)); }

/* Inspector: docked to the right, a bottom sheet on narrow screens. */
.drawer { position: absolute; top: 0; right: 0; bottom: 0; width: 380px; z-index: 3; overflow: auto; overscroll-behavior: contain;
  background: var(--surface); border-left: 1px solid var(--line); padding: 18px 22px 32px; }
.stage.hist .drawer { bottom: var(--histh); }
.drawer .close { position: absolute; top: 12px; right: 12px; }
.kicker { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); margin: 2px 40px 8px 0; }
.drawer h2 { margin: 0 40px 4px 0; font-size: 20px; font-weight: 600; line-height: 1.25; letter-spacing: -.01em; }
.drawer .id { font-size: 12px; color: var(--muted); word-break: break-all; }
.drawer .desc { font-size: 13.5px; line-height: 1.55; color: var(--ink-2); margin: 12px 0 0; max-width: 60ch; }
.drawer .acts { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 4px; }
.facts { display: grid; grid-template-columns: 92px 1fr; gap: 7px 12px; margin: 16px 0 0; font-size: 13px; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; color: var(--ink); min-width: 0; overflow-wrap: anywhere; }
.drawer h3 { display: flex; align-items: baseline; gap: 6px; font-size: 13px; font-weight: 600; margin: 24px 0 6px; }
.drawer h3 .n { color: var(--muted); font-weight: 400; }
.drawer ul { list-style: none; margin: 0; padding: 0; }
.drawer li { display: flex; align-items: center; gap: 10px; min-height: 34px; padding: 5px 8px; margin: 0 -8px; border-radius: 6px; font-size: 13px; cursor: pointer; }
.drawer li.static { cursor: default; color: var(--muted); }
.drawer li:not(.static):hover { background: var(--hover); }
.drawer li.cur { background: var(--hover-strong); }
.drawer li .name { flex: 1; min-width: 0; }
.drawer li .sub { display: block; font-size: 12px; color: var(--muted); margin-top: 1px; }
.drawer li .val { margin-left: auto; padding-left: 8px; color: var(--muted); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; }
.drawer li .when { min-width: 48px; white-space: nowrap; flex: none; font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
.drawer li .big { min-width: 52px; white-space: nowrap; flex: none; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.drawer .glyph { flex: none; }
.drawer .muted { color: var(--muted); }
.drawer .ok { color: var(--pass); } .drawer .no, .drawer li .sub.no { color: var(--block); } .drawer .warn { color: var(--in); }
.drawer .note { font-size: 12.5px; color: var(--muted); margin: 14px 0 0; }
.drawer details summary { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; margin: 24px 0 8px; cursor: pointer; list-style: none; }
.drawer details summary::-webkit-details-marker { display: none; }
.drawer details summary .ico { color: var(--muted); transition: transform .15s; transform: rotate(-90deg); }
.drawer details[open] summary .ico { transform: none; }
.drawer pre { font: 11.5px/1.5 ui-monospace, "Roboto Mono", SFMono-Regular, monospace; color: var(--ink-2); background: var(--canvas);
  border: 1px solid var(--line); border-radius: 8px; padding: 12px; overflow: auto; margin: 0; }
.sev { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.sev.error { background: var(--block); } .sev.warn { background: var(--in); } .sev.info { background: var(--line-strong); }

/* Activity log */
.activity { position: absolute; left: 16px; bottom: 16px; z-index: 1; width: min(340px, calc(100% - 32px)); padding: 8px 0 6px;
  background: var(--raised); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); font-size: 12.5px; }
.activity.empty { display: none; }
.stage.hist .activity { bottom: calc(var(--histh) + 16px); }
.activity h4 { margin: 0 12px 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
.activity .row { display: grid; grid-template-columns: 58px 1fr; align-items: baseline; padding: 5px 12px; cursor: pointer; animation: in .25s ease-out; }
.activity .row:hover { background: var(--hover); }
.activity time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
.activity b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activity small { grid-column: 2; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@keyframes in { from { opacity: 0; transform: translateY(4px); } }

/* History: a docked scrubber */
.histbar { position: absolute; left: 0; right: 0; bottom: 0; height: var(--histh); z-index: 3; display: grid; grid-template-rows: 32px 28px; gap: 10px;
  padding: 12px 16px; background: var(--surface); border-top: 1px solid var(--line); }
.histbar .row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.histbar .htime { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; margin: 0 6px; white-space: nowrap; }
.histbar .hnote { font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scrub { position: relative; height: 28px; }
.scrub canvas { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 6px; background: var(--canvas); border: 1px solid var(--line); }
.scrub input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; background: transparent; -webkit-appearance: none; appearance: none; cursor: pointer; }
.scrub input::-webkit-slider-runnable-track { background: transparent; height: 28px; }
.scrub input::-webkit-slider-thumb { -webkit-appearance: none; width: 3px; height: 28px; border-radius: 2px; background: var(--ink); }
.scrub input::-moz-range-track { background: transparent; }
.scrub input::-moz-range-thumb { width: 3px; height: 28px; border: 0; border-radius: 2px; background: var(--ink); }
.loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); font-size: 13.5px; }

@media (max-width: 799px) {
  .drawer, .stage.hist .drawer { top: auto; left: 0; right: 0; bottom: 0; width: auto; height: 52%; border-left: 0; border-top: 1px solid var(--line);
    border-radius: 14px 14px 0 0; box-shadow: var(--shadow); }
  .stage.hist .drawer { bottom: var(--histh); height: 40%; }
}
@media (max-width: 700px) { .bar .count, .bar .lbl, .sep { display: none; } .bar h1 { font-size: 15px; margin-right: 10px; } }
@media (max-width: 560px) { .bar h1, .bar .wide, .bar .grow { display: none; } .search { flex: 1; min-width: 0; margin-right: 4px; } .search input { width: 100%; min-width: 0; } }
@media (prefers-reduced-motion: reduce) { .wire.live { animation: none; } .activity .row { animation: none; } }
`;
