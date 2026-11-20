// Collects every tr("…") message in the frontend into translations/en.json, the catalog
// translators work from. With --check it only fails if the catalog is out of date, for CI.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("../custom_components/homenodes/frontend", import.meta.url));
const catalog = join(frontend, "translations/en.json");

/** @type {Set<string>} */
const messages = new Set();
let dynamic = 0;
for (const name of readdirSync(frontend, { recursive: true })) {
  if (!name.endsWith(".js") || name === "strings.js") continue;
  const src = readFileSync(join(frontend, name), "utf8");
  // tr("…"), with the usual escapes; anything else passed to tr() can't be translated.
  for (const m of src.matchAll(/\btr\(\s*(?:"((?:[^"\\]|\\.)*)"|([^)\s][^,)]*))/g)) {
    if (m[1] !== undefined) messages.add(JSON.parse(`"${m[1]}"`));
    else { console.error(`${name}: tr() needs a string literal, not ${m[2]}`); dynamic++; }
  }
}
const json = `${JSON.stringify(Object.fromEntries([...messages].sort().map((m) => [m, m])), null, 2)}\n`;
if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(catalog, "utf8"); } catch { /* missing counts as stale */ }
  if (current !== json || dynamic) {
    console.error("translations/en.json is out of date: run node scripts/strings.mjs");
    process.exitCode = 1;
  } else process.stdout.write(`strings: ${messages.size} messages, catalog up to date\n`);
} else {
  writeFileSync(catalog, json);
  process.stdout.write(`strings: wrote ${messages.size} messages\n`);
  if (dynamic) process.exitCode = 1;
}
