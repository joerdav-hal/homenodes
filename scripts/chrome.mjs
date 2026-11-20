// Headless Chrome for the browser checks: the page's DOM once its virtual time runs out.
// Chrome is found on PATH, or set CHROME to its path.
import { spawn } from "node:child_process";

const CANDIDATES = [process.env.CHROME, "google-chrome-stable", "google-chrome", "chromium", "chromium-browser"].filter(Boolean);

/**
 * @param {string} url
 * @param {number | null} [budget] Virtual milliseconds to run for; null runs in real time, until the load event.
 * @returns {Promise<string>}
 */
export const dump = async (url, budget = 120000) => {
  for (const bin of /** @type {string[]} */ (CANDIDATES)) {
    const out = await new Promise((resolve) => {
      const time = budget == null ? [] : [`--virtual-time-budget=${budget}`];
      const p = spawn(bin, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--window-size=1440,988", ...time, "--dump-dom", url]);
      let dom = "";
      p.stdout.on("data", (d) => { dom += d; });
      p.on("error", () => resolve(null));
      p.on("close", () => resolve(dom));
    });
    if (out !== null) return out;
  }
  throw new Error(`No Chrome found; tried ${CANDIDATES.join(", ")}. Set CHROME to its path.`);
};

/** The JSON a page left in <pre id="...">, or null. @param {string} dom @param {string} id */
export const result = (dom, id) => {
  const m = dom.match(new RegExp(`<pre id="${id}">([\\s\\S]*?)</pre>`));
  if (!m) return null;
  return JSON.parse(m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
};
