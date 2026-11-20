// Headless Chrome for the browser checks: the page's DOM once its virtual time runs out.
// Chrome is found on PATH, or set CHROME to its path.
import { spawn } from "node:child_process";

const CANDIDATES = [process.env.CHROME, "google-chrome-stable", "google-chrome", "chromium", "chromium-browser"].filter(Boolean);

/**
 * Chrome's stdout for these arguments, from the first Chrome that starts.
 * @param {string[]} args
 * @returns {Promise<string>}
 */
const run = async (args) => {
  for (const bin of /** @type {string[]} */ (CANDIDATES)) {
    const out = await new Promise((resolve) => {
      const p = spawn(bin, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", ...args]);
      let text = "";
      p.stdout.on("data", (d) => { text += d; });
      p.on("error", () => resolve(null));
      p.on("close", () => resolve(text));
    });
    if (out !== null) return out;
  }
  throw new Error(`No Chrome found; tried ${CANDIDATES.join(", ")}. Set CHROME to its path.`);
};

/**
 * @param {string} url
 * @param {number | null} [budget] Virtual milliseconds to run for; null runs in real time, until the load event.
 * @returns {Promise<string>}
 */
export const dump = (url, budget = 120000) =>
  run(["--window-size=1440,988", ...(budget == null ? [] : [`--virtual-time-budget=${budget}`]), "--dump-dom", url]);

/** A PNG of the page after a few virtual seconds. @param {string} url @param {string} file @param {[number, number]} size */
export const screenshot = (url, file, [w, h]) =>
  run([`--window-size=${w},${h}`, "--virtual-time-budget=8000", `--screenshot=${file}`, url]);

/** The JSON a page left in <pre id="...">, or null. @param {string} dom @param {string} id */
export const result = (dom, id) => {
  const m = dom.match(new RegExp(`<pre id="${id}">([\\s\\S]*?)</pre>`));
  if (!m) return null;
  return JSON.parse(m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
};
