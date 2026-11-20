// Renders the panel in headless Chrome over the plain and the hostile house, clicks through it,
// and fails if anything but the panel's own elements appears, or anything throws.
// Chrome is found on PATH, or set CHROME to its path.
import { spawn } from "node:child_process";
import { serve } from "./serve.mjs";

const CANDIDATES = [process.env.CHROME, "google-chrome-stable", "google-chrome", "chromium", "chromium-browser"].filter(Boolean);

/** @param {string} url @returns {Promise<string>} The page's DOM once its virtual time has run out. */
const dump = async (url) => {
  for (const bin of /** @type {string[]} */ (CANDIDATES)) {
    const out = await new Promise((resolve) => {
      const p = spawn(bin, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--window-size=1440,988", "--virtual-time-budget=120000", "--dump-dom", url]);
      let dom = "";
      p.stdout.on("data", (d) => { dom += d; });
      p.on("error", () => resolve(null));
      p.on("close", () => resolve(dom));
    });
    if (out !== null) return out;
  }
  throw new Error(`No Chrome found; tried ${CANDIDATES.join(", ")}. Set CHROME to its path.`);
};

const server = await serve(0);
let failed = false;
try {
  for (const mode of ["check", "check&hostile"]) {
    const dom = await dump(`http://127.0.0.1:${server.port}/dev/?shot&tz=Europe/London&${mode}`);
    const m = dom.match(/<pre id="check">([\s\S]*?)<\/pre>/);
    if (!m) { console.log(`${mode}: the page never finished\n${dom.slice(-600)}`); failed = true; continue; }
    const unescape = (/** @type {string} */ t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    const r = JSON.parse(unescape(m[1]));
    console.log(`${mode}: ${r.nodes} nodes, ${r.problems.length ? `${r.problems.length} problems` : "clean"}`);
    for (const p of r.problems) console.log(`  ${p}`);
    if (r.problems.length) failed = true;
  }
} finally {
  server.close();
}
process.exitCode = failed ? 1 : 0;
