// Fails if the shipped frontend uses anything that parses HTML, evaluates strings or reaches
// the network. HomeNodes renders text as text and talks only to Home Assistant's own socket.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const frontend = join(root, "custom_components/homenodes/frontend");

/** @type {[RegExp, string][]} */
const FORBIDDEN = [
  [/\binnerHTML\b/, "innerHTML parses HTML; build nodes with h() and s()"],
  [/\bouterHTML\s*=/, "outerHTML assignment parses HTML"],
  [/insertAdjacentHTML/, "insertAdjacentHTML parses HTML"],
  [/document\.write/, "document.write parses HTML"],
  [/\beval\s*\(/, "eval runs strings as code"],
  [/new\s+Function\s*\(/, "new Function runs strings as code"],
  [/set(?:Timeout|Interval)\s*\(\s*["'`]/, "string timers run strings as code"],
  [/\bimport\s*\(/, "dynamic import could load code from elsewhere"],
  [/\bfetch\s*\(/, "network requests go through Home Assistant's socket only"],
  [/XMLHttpRequest|new\s+WebSocket\s*\(|navigator\.sendBeacon|EventSource\s*\(/, "network requests go through Home Assistant's socket only"],
];
// The SVG namespace is an identifier, not a request.
const ALLOWED_URLS = new Set(["http://www.w3.org/2000/svg"]);

let problems = 0;
for (const name of readdirSync(frontend, { recursive: true })) {
  const path = join(frontend, name);
  if (!name.endsWith(".js") || !statSync(path).isFile()) continue;
  readFileSync(path, "utf8").split("\n").forEach((line, i) => {
    // Comment-only lines never run; JSDoc's import("…") type references live there.
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
    const where = `${relative(root, path)}:${i + 1}`;
    for (const [re, why] of FORBIDDEN) if (re.test(line)) { console.error(`${where}: ${why}`); problems++; }
    for (const url of line.match(/https?:\/\/[^\s"'`)]+/g) || []) {
      if (!ALLOWED_URLS.has(url)) { console.error(`${where}: outside URL ${url}`); problems++; }
    }
  });
}
if (problems) process.exitCode = 1;
else process.stdout.write("check: no forbidden APIs or outside URLs\n");
