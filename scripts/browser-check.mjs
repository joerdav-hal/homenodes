// Renders the panel in headless Chrome over the plain and the hostile house, clicks through it,
// and fails if anything but the panel's own elements appears, or anything throws.
import { dump, result } from "./chrome.mjs";
import { serve } from "./serve.mjs";

const server = await serve(0);
let failed = false;
try {
  for (const mode of ["check", "check&hostile"]) {
    const dom = await dump(`http://127.0.0.1:${server.port}/dev/?shot&tz=Europe/London&${mode}`);
    const r = result(dom, "check");
    if (!r) { console.log(`${mode}: the page never finished\n${dom.slice(-600)}`); failed = true; continue; }
    console.log(`${mode}: ${r.nodes} nodes, ${r.problems.length ? `${r.problems.length} problems` : "clean"}`);
    for (const p of r.problems) console.log(`  ${p}`);
    if (r.problems.length) failed = true;
  }
} finally {
  server.close();
}
process.exitCode = failed ? 1 : 0;
