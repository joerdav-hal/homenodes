// The dev server: the repo as static files on localhost, never cached, so an edited module is
// what the next reload runs. Python's http.server let browsers keep stale imports.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 8770);
/** @type {Record<string, string>} */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (file.endsWith(sep) || path.endsWith("/")) file = join(file, "index.html");
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }).end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`HomeNodes dev harness: http://127.0.0.1:${PORT}/dev/`));
