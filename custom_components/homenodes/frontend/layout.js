// Placing nodes: one block of columns per area, and the curve each wire takes.

import { SIZE } from "./constants.js";

/** @typedef {import("./graph.js").GraphNode} GraphNode */
/** @typedef {import("./graph.js").GraphEdge} GraphEdge */
/** @typedef {{ x: number, y: number, w: number, h: number }} Box */

const COL = 340, GAP_Y = 16;

/**
 * Each cluster is a block of columns: what feeds the automations, the automations (and the
 * scripts they call), then what they change. Within a column, order follows the neighbours.
 * Nodes with a fixed position keep it, and any others are placed beside what they connect to.
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
  if (free.length < nodes.length) return placeNear(nodes, free, edges, byId);

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
  /** @type {Map<string, string[]>} */
  const nbrs = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) { nbrs.get(e.src)?.push(e.dst); nbrs.get(e.dst)?.push(e.src); }

  /** @type {Map<string | undefined, GraphNode[]>} */
  const clusters = new Map();
  for (const n of nodes) {
    if (!clusters.has(n.cluster)) clusters.set(n.cluster, []);
    clusters.get(n.cluster)?.push(n);
  }
  /** @type {{ name: string | undefined, members: GraphNode[], w: number, h: number }[]} */
  const blocks = [];
  for (const [name, members] of clusters) {
    /** @type {GraphNode[][]} */
    const cols = [];
    for (const n of members) (cols[/** @type {number} */ (rank.get(n.id))] ||= []).push(n);
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
  // Shelf-pack the blocks, tallest first, into a roughly landscape sheet.
  blocks.sort((a, b) => b.h - a.h);
  const area = blocks.reduce((s, b) => s + (b.w + 200) * (b.h + 240), 0);
  const maxW = Math.max(...blocks.map((b) => b.w), Math.sqrt(area * 1.8));
  let x = 0, y = 0, rowH = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.w > maxW) { x = 0; y += rowH + 240; rowH = 0; }
    for (const n of b.members) { n.x = Math.round(n.x + x); n.y = Math.round(n.y + y); }
    x += b.w + 200;
    rowH = Math.max(rowH, b.h);
  }
}

/**
 * New nodes beside what they connect to, then nudged until nothing overlaps.
 * @param {GraphNode[]} nodes
 * @param {GraphNode[]} free
 * @param {Pick<GraphEdge, "src" | "dst">[]} edges
 * @param {Map<string, GraphNode>} byId
 */
function placeNear(nodes, free, edges, byId) {
  for (const n of free) {
    /** @type {([GraphNode | undefined, number] | null)[]} */
    const ends = edges.map((e) => (e.src === n.id ? [byId.get(e.dst), -1] : e.dst === n.id ? [byId.get(e.src), 1] : null));
    const placed = /** @type {[GraphNode, number][]} */ (ends.filter((p) => p?.[0]?.pinned));
    if (placed.length) {
      n.x = placed.reduce((s, [o, side]) => s + o.x + side * COL, 0) / placed.length;
      n.y = placed.reduce((s, [o]) => s + o.y, 0) / placed.length;
    } else {
      const maxY = Math.max(...nodes.filter((o) => o.pinned).map((o) => o.y + o.h), 0);
      n.x = 0; n.y = maxY + 300;
    }
  }
  for (let it = 0; it < 200; it++) {
    let moved = false;
    for (const a of free) {
      for (const b of nodes) {
        if (a === b) continue;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + 24;
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + GAP_Y;
        if (ox <= 0 || oy <= 0) continue;
        a.y += a.y <= b.y ? -oy : oy;
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
