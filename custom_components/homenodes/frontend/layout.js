// Placing nodes: one block of columns per area, and the curve each wire takes.

import { SIZE } from "./constants.js";
import { pack } from "./pack.js";

/** @typedef {import("./graph.js").GraphNode} GraphNode */
/** @typedef {import("./graph.js").GraphEdge} GraphEdge */
/** @typedef {{ x: number, y: number, w: number, h: number }} Box */

const COL = 340, GAP_Y = 16;

/** @typedef {{ name: string | undefined, members: GraphNode[], w: number, h: number }} Block */

// Gaps between zones: room for the plate's padding and the title above it. Sheets aim for a
// landscape screen's shape.
const ZONE_GAP_X = 200, ZONE_GAP_Y = 240, SHEET_ASPECT = 1.6;

/**
 * Each cluster is a block of columns: what feeds the automations, the automations (and the
 * scripts they call), then what they change. Within a column, order follows the neighbours.
 * Nodes with a fixed position keep it; new ones join their own zone (see placeNew).
 * @param {GraphNode[]} nodes
 * @param {Pick<GraphEdge, "src" | "dst" | "role">[]} edges
 * @param {Map<string, [number, number]>} [fixed]
 * @returns {void}
 */
export function layout(nodes, edges, fixed = new Map()) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) [n.w, n.h] = SIZE[n.kind] || SIZE.entity;
  const free = nodes.filter((n) => {
    const f = fixed.get(n.id);
    n.pinned = !!f;
    if (f) [n.x, n.y] = f;
    return !f;
  });
  if (!free.length) return;
  const rank = ranks(nodes, edges, byId);
  if (free.length < nodes.length) return placeNew(nodes, free, edges, byId, rank);
  arrange(blocksOf(nodes, edges, rank), 0, 0);
}

/**
 * Which column each node goes in: 0 for what feeds automations, 1 for automations and scripts,
 * 2 for scripts they call, and one past whatever writes to it for everything else.
 * @param {GraphNode[]} nodes @param {Pick<GraphEdge, "src" | "dst" | "role">[]} edges @param {Map<string, GraphNode>} byId
 * @returns {Map<string, number>}
 */
function ranks(nodes, edges, byId) {
  /** @param {GraphNode | undefined} n */
  const owner = (n) => n?.kind === "automation" || n?.kind === "script";
  const called = new Set(edges.filter((e) => byId.get(e.src)?.kind === "automation" && byId.get(e.dst)?.kind === "script").map((e) => e.dst));
  /** @type {Map<string, number>} */
  const rank = new Map();
  for (const n of nodes) if (owner(n)) rank.set(n.id, called.has(n.id) ? 2 : 1);
  for (const n of nodes) {
    if (owner(n)) continue;
    const writers = edges.filter((e) => e.dst === n.id && e.role === "action").map((e) => rank.get(e.src) || 1);
    rank.set(n.id, writers.length ? Math.max(...writers) + 1 : 0);
  }
  return rank;
}

/**
 * One block per cluster, its members placed relative to the block's top left.
 * @param {GraphNode[]} nodes @param {Pick<GraphEdge, "src" | "dst">[]} edges @param {Map<string, number>} rank
 * @returns {Block[]}
 */
function blocksOf(nodes, edges, rank) {
  /** @type {Map<string, string[]>} */
  const nbrs = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) { nbrs.get(e.src)?.push(e.dst); nbrs.get(e.dst)?.push(e.src); }
  /** @type {Map<string | undefined, GraphNode[]>} */
  const clusters = new Map();
  for (const n of nodes) {
    if (!clusters.has(n.cluster)) clusters.set(n.cluster, []);
    clusters.get(n.cluster)?.push(n);
  }
  /** @type {Block[]} */
  const blocks = [];
  for (const [name, members] of clusters) {
    /** @type {GraphNode[][]} */
    const cols = [];
    for (const n of members) (cols[rank.get(n.id) ?? 0] ||= []).push(n);
    const dense = cols.filter(Boolean);
    dense.forEach((c) => c.sort((a, b) => (a.alias || a.label).localeCompare(b.alias || b.label)));
    /** @type {Map<string, number>} */
    const pos = new Map();
    /** @param {GraphNode[]} c */
    const reindex = (c) => c.forEach((n, i) => pos.set(n.id, (i + 0.5) / c.length));
    dense.forEach(reindex);
    for (let sweep = 0; sweep < 12; sweep++) {
      for (const c of sweep % 2 ? [...dense].reverse() : dense) {
        const bc = new Map(c.map((n) => {
          const ps = /** @type {number[]} */ ((nbrs.get(n.id) || []).map((id) => pos.get(id)).filter((v) => v != null));
          return [n.id, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : /** @type {number} */ (pos.get(n.id))];
        }));
        c.sort((a, b) => /** @type {number} */ (bc.get(a.id)) - /** @type {number} */ (bc.get(b.id)));
        reindex(c);
      }
    }
    const colH = dense.map((c) => c.reduce((s, n) => s + n.h + GAP_Y, -GAP_Y));
    const H = Math.max(...colH);
    dense.forEach((c, ci) => {
      let y = (H - colH[ci]) / 2;
      for (const n of c) { n.x = ci * COL; n.y = y; y += n.h + GAP_Y; }
    });
    blocks.push({ name, members, w: dense.length * COL - (COL - 236), h: H });
  }
  return blocks;
}

/**
 * Packs blocks into a sheet starting at (x0, y0), each with room around it for its plate and title.
 * @param {Block[]} blocks @param {number} x0 @param {number} y0
 */
function arrange(blocks, x0, y0) {
  /** @type {(import("./pack.js").PackBox & { b: Block })[]} */
  const boxes = blocks.map((b) => ({ w: b.w + ZONE_GAP_X, h: b.h + ZONE_GAP_Y, b }));
  pack(boxes, SHEET_ASPECT);
  for (const { b, x = 0, y = 0 } of boxes) for (const n of b.members) { n.x = Math.round(n.x + x + x0); n.y = Math.round(n.y + y + y0); }
}

/**
 * New nodes join their own zone, below what's there, in the column their role belongs in (or
 * beside the zone member they connect to); zones below and alongside move down to make room.
 * New zones are laid out as fresh blocks under everything. Saved positions are otherwise kept.
 * @param {GraphNode[]} nodes
 * @param {GraphNode[]} free
 * @param {Pick<GraphEdge, "src" | "dst" | "role">[]} edges
 * @param {Map<string, GraphNode>} byId
 * @param {Map<string, number>} rank
 */
function placeNew(nodes, free, edges, byId, rank) {
  /** @type {Map<string | undefined, Box>} */
  const zone = new Map();
  for (const n of nodes) {
    if (!n.pinned) continue;
    const b = zone.get(n.cluster);
    if (!b) { zone.set(n.cluster, { x: n.x, y: n.y, w: n.w, h: n.h }); continue; }
    const x1 = Math.max(b.x + b.w, n.x + n.w), y1 = Math.max(b.y + b.h, n.y + n.h);
    b.x = Math.min(b.x, n.x); b.y = Math.min(b.y, n.y); b.w = x1 - b.x; b.h = y1 - b.y;
  }
  const sheet = [...zone.values()].reduce((s, b) => ({ x0: Math.min(s.x0, b.x), x1: Math.max(s.x1, b.x + b.w), y1: Math.max(s.y1, b.y + b.h) }), { x0: Infinity, x1: -Infinity, y1: -Infinity });

  const orphans = free.filter((n) => !zone.has(n.cluster));
  const joiners = free.filter((n) => zone.has(n.cluster)).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  /** @type {Map<string | undefined, number>} How far each zone's bottom moved down. */
  const grew = new Map();
  for (const n of joiners) {
    const b = /** @type {Box} */ (zone.get(n.cluster));
    const mate = edges.map((e) => (e.src === n.id ? byId.get(e.dst) : e.dst === n.id ? byId.get(e.src) : null))
      .find((o) => o?.pinned && o.cluster === n.cluster);
    const cols = Math.max(1, Math.round((b.w + COL - 236) / COL));
    const col = Math.min(cols - 1, Math.max(0, (rank.get(n.id) ?? 0) - (cols < 3 ? 1 : 0)));
    n.x = mate ? mate.x + ((rank.get(n.id) ?? 0) < (rank.get(mate.id) ?? 0) ? -COL : (rank.get(n.id) ?? 0) > (rank.get(mate.id) ?? 0) ? COL : 0) : b.x + col * COL;
    n.x = Math.min(Math.max(n.x, b.x), b.x + b.w - n.w);
    n.y = b.y + b.h + GAP_Y;
    const before = b.y + b.h;
    b.h += n.h + GAP_Y;
    grew.set(n.cluster, (grew.get(n.cluster) || 0) + (b.y + b.h - before));
  }
  // Make room: whatever sits below a grown zone, and overlaps it side to side, moves down with it.
  for (const [name, by] of [...grew].sort((a, b) => /** @type {Box} */ (zone.get(a[0])).y - /** @type {Box} */ (zone.get(b[0])).y)) {
    const g = /** @type {Box} */ (zone.get(name));
    const oldBottom = g.y + g.h - by;
    for (const [other, o] of zone) {
      if (other === name || o.y < oldBottom || o.x >= g.x + g.w + ZONE_GAP_X || o.x + o.w + ZONE_GAP_X <= g.x) continue;
      o.y += by;
      for (const n of nodes) if (n.cluster === other) n.y += by;
    }
    sheet.y1 = Math.max(sheet.y1, ...[...zone.values()].map((b) => b.y + b.h));
  }
  if (orphans.length) arrange(blocksOf(orphans, edges, rank), Number.isFinite(sheet.x0) ? sheet.x0 : 0, Number.isFinite(sheet.y1) ? sheet.y1 + ZONE_GAP_Y : 0);
  // Last, nudge new nodes off anything they still overlap.
  for (let it = 0; it < 200; it++) {
    let moved = false;
    for (const a of joiners) {
      for (const b of nodes) {
        if (a === b) continue;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + 24;
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + GAP_Y;
        if (ox <= 0 || oy <= 0) continue;
        a.y += oy;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const n of free) { n.x = Math.round(n.x); n.y = Math.round(n.y); }
}

/**
 * The curve a wire takes from the right edge of one box to the left edge of another.
 * @param {Box} a
 * @param {Box} b
 */
export const wirePath = (a, b) => {
  const sx = a.x + a.w, sy = a.y + a.h / 2, tx = b.x, ty = b.y + b.h / 2;
  const dx = Math.max(60, Math.abs(tx - sx) * 0.45);
  return `M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`;
};
