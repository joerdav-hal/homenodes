// Times the pure work behind the panel at three house sizes, and fails if any goes over budget.
// Budgets are generous (shared CI runners are slow and noisy); they catch a change in kind, like
// something quadratic, not a few percent. `node scripts/bench.mjs --report` prints without failing.
import { makeHouse } from "../dev/fake-house.js";
import { buildGraph } from "../custom_components/homenodes/frontend/graph.js";
import { layout } from "../custom_components/homenodes/frontend/layout.js";
import { branchConditions, evalConditions } from "../custom_components/homenodes/frontend/conditions.js";

const SIZES = [{ name: "50", copies: 3 }, { name: "500", copies: 26 }, { name: "2,000", copies: 105 }];
/** Milliseconds allowed at the largest size. @type {Record<string, number>} */
// About five times a laptop's time on 2026-11-20 (graph 26, layout 49, conditions 2).
export const BUDGET = { graph: 150, layout: 250, conditions: 15 };

/** @template T @param {() => T} fn @returns {[T, number]} The result and the best of three runs, in ms. */
const time = (fn) => {
  let best = Infinity, out;
  for (let i = 0; i < 3; i++) { const t = performance.now(); out = fn(); best = Math.min(best, performance.now() - t); }
  return [/** @type {any} */ (out), best];
};

const report = process.argv.includes("--report");
const now = new Date(2026, 10, 20, 18, 30).getTime();
let over = false;
for (const { name, copies } of SIZES) {
  const house = makeHouse({ now, copies });
  const states = Object.fromEntries(house.states.map((s) => [s.entity_id, s]));
  const [g, graph] = time(() => buildGraph(house));
  const [, lay] = time(() => { for (const n of g.nodes) { n.x = 0; n.y = 0; } layout(g.nodes, g.edges, new Map()); });
  const [, cond] = time(() => {
    for (const cfg of Object.values(house.configs)) {
      if (!cfg || cfg.error) continue;
      for (const c of [cfg.conditions ?? cfg.condition, ...branchConditions(cfg.actions ?? cfg.action)]) evalConditions(c, { states, resolve: g.resolve, now: new Date(now) });
    }
  });
  const autos = g.nodes.filter((n) => n.kind === "automation").length;
  const row = { graph, layout: lay, conditions: cond };
  console.log(`${name.padStart(5)} automations (${autos}, ${g.nodes.length} nodes, ${g.edges.length} wires): ` +
    Object.entries(row).map(([k, v]) => `${k} ${v.toFixed(1)} ms`).join(", "));
  if (copies === SIZES[SIZES.length - 1].copies) for (const [k, v] of Object.entries(row)) if (v > BUDGET[k]) { console.log(`  over budget: ${k} ${v.toFixed(0)} ms > ${BUDGET[k]} ms`); over = true; }
}
if (over && !report) process.exitCode = 1;
