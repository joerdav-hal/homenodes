// The dev server: the repo as static files on localhost, never cached, so an edited module is
// what the next reload runs. Python's http.server let browsers keep stale imports.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/** @type {Record<string, string>} */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

/**
 * Serve the repo on 127.0.0.1. Port 0 picks a free one.
 * @param {number} port
 * @returns {Promise<{ port: number, close(): void }>}
 */
export const serve = (port) => new Promise((ready) => {
  // Headless Chrome dumps the page at its load event; a page that is timing itself in real time
  // holds that open with an image from /__hold until it fetches /__release.
  /** @type {import("node:http").Response[]} */
  let held = [];
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
    if (path === "/__hold") { held.push(res); return; }
    if (path === "/__release") {
      for (const r of held) r.writeHead(204, { "Cache-Control": "no-store" }).end();
      held = [];
      res.writeHead(204).end();
      return;
    }
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (file.endsWith(sep) || path.endsWith("/")) file = join(file, "index.html");
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }).end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    }
  });
  server.listen(port, "127.0.0.1", () => ready({ port: server.address().port, close: () => server.close() }));
});

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const { port } = await serve(Number(process.env.PORT || 8770));
  console.log(`HomeNodes dev harness: http://127.0.0.1:${port}/dev/`);
}
