// Packing rectangles into a sheet of a given shape: Mapbox's potpack, adapted with an aspect
// ratio. Boxes go tallest first into the smallest free space they fit, which splits in two.
// potpack: Copyright (c) 2022, Mapbox. ISC licence: permission to use, copy, modify and distribute
// with or without fee is granted, provided this notice appears; provided "as is", without warranty.

/** @typedef {{ w: number, h: number, x?: number, y?: number }} PackBox */

/**
 * Places each box (sets x and y) so they don't overlap.
 * @param {PackBox[]} boxes Each one's w and h; the array is sorted in place.
 * @param {number} [aspect] Width over height of the sheet to aim for.
 * @returns {{ w: number, h: number, fill: number }} The sheet's size and how much of it is used.
 */
export function pack(boxes, aspect = 1) {
  let area = 0, maxWidth = 0;
  for (const b of boxes) { area += b.w * b.h; maxWidth = Math.max(maxWidth, b.w); }
  boxes.sort((a, b) => b.h - a.h);
  const start = Math.max(Math.ceil(Math.sqrt((area / 0.95) * aspect)), maxWidth);
  /** @type {{ x: number, y: number, w: number, h: number }[]} */
  const spaces = [{ x: 0, y: 0, w: start, h: Infinity }];
  let width = 0, height = 0;
  for (const b of boxes) {
    // Backwards: the smaller spaces are at the end.
    for (let i = spaces.length - 1; i >= 0; i--) {
      const s = spaces[i];
      if (b.w > s.w || b.h > s.h) continue;
      b.x = s.x; b.y = s.y;
      width = Math.max(width, b.x + b.w);
      height = Math.max(height, b.y + b.h);
      if (b.w === s.w && b.h === s.h) {
        const last = /** @type {typeof s} */ (spaces.pop());
        if (i < spaces.length) spaces[i] = last;
      } else if (b.h === s.h) { s.x += b.w; s.w -= b.w; }
      else if (b.w === s.w) { s.y += b.h; s.h -= b.h; }
      else {
        spaces.push({ x: s.x + b.w, y: s.y, w: s.w - b.w, h: b.h });
        s.y += b.h; s.h -= b.h;
      }
      break;
    }
  }
  return { w: width, h: height, fill: area / (width * height) || 0 };
}
