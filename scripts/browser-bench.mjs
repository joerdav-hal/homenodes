// Times the panel in headless Chrome: loading, a state change, the clock tick, a pan frame, a
// sweep to each corner, zooming out and focusing an automation. Script and style time; painting
// isn't counted. Fails if the 500-automation house goes over budget.
// --large adds 2,000 automations, which needs a GPU: headless software painting can't keep up.
// --report prints without failing.
import { dump, result } from "./chrome.mjs";
import { serve } from "./serve.mjs";

const large = process.argv.includes("--large"), report = process.argv.includes("--report");
const SIZES = [{ name: "50", copies: 3 }, { name: "500", copies: 26, budgeted: true }, ...(large ? [{ name: "2,000", copies: 105 }] : [])];
// Milliseconds at 500 automations: about five times a laptop's on 2026-11-20.
/** @type {Record<string, number>} */
const BUDGET = { load: 1000, stateChange: 12, clockTick: 15, pan: 5, sweep: 250, zoomOut: 250, select: 450 };

const server = await serve(0);
let over = false;
try {
  for (const { name, copies, budgeted } of SIZES) {
    const r = result(await dump(`http://127.0.0.1:${server.port}/dev/?shot&tz=Europe/London&bench&copies=${copies}`, null), "bench");
    if (!r) { console.log(`${name}: the page never finished`); over = true; continue; }
    console.log(`${name.padStart(5)} automations: ${r.elements} elements; ` +
      Object.keys(BUDGET).map((k) => `${k} ${r[k].toFixed(1)}`).join(", ") + " ms");
    if (budgeted) for (const [k, max] of Object.entries(BUDGET)) if (r[k] > max) { console.log(`  over budget: ${k} ${r[k].toFixed(0)} ms > ${max} ms`); over = true; }
  }
} finally {
  server.close();
}
if (over && !report) process.exitCode = 1;
