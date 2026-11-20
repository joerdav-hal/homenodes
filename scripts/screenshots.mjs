// Pictures for the documentation, taken from the dev harness over the made-up house, so they show
// the current release and never anyone's real home. Writes docs/images/*.png (not committed).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { screenshot } from "./chrome.mjs";
import { cropHeight } from "./png.mjs";
import { serve } from "./serve.mjs";

const OUT = fileURLToPath(new URL("../docs/images/", import.meta.url));
/** @type {[string, string, [number, number]?][]} name, harness query, window size */
const SHOTS = [
  ["map", ""],
  ["map-light", "theme=light"],
  ["focus", "select=automation.kitchen_motion_lights"],
  ["blocked", "select=automation.movie_mode"],
  ["blueprint", "select=automation.garden_motion"],
  ["entity", "select=light.kitchen_ceiling"],
  ["health", "open=health"],
  ["upnext", "open=upnext"],
  ["history", "open=history"],
  ["heat", "open=heat"],
  ["grouped-by-label", "grouping=label"],
  ["controls-off", "controls=0&select=automation.kitchen_motion_lights"],
  ["phone", "select=automation.kitchen_motion_lights", [500, 900]],
];

mkdirSync(OUT, { recursive: true });
const server = await serve(0);
try {
  for (const [name, query, size = [1440, 900]] of SHOTS) {
    // Chrome paints only its viewport, which is shorter than the window: shoot tall, then cut.
    const file = `${OUT}${name}.png`;
    await screenshot(`http://127.0.0.1:${server.port}/dev/?shot&tz=Europe/London&timeformat=24&height=${size[1]}&${query}`, file, [size[0], size[1] + 200]);
    writeFileSync(file, cropHeight(readFileSync(file), size[1]));
    console.log(`docs/images/${name}.png`);
  }
} finally {
  server.close();
}
