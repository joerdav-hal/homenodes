// Cuts a PNG to its top rows. Each row's filter refers only to the row above it, so dropping rows
// from the bottom needs no decoding: inflate, truncate, deflate, and fix the height and checksums.
import { deflateSync, inflateSync } from "node:zlib";

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
/** @param {Uint8Array} bytes */
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** @param {string} type @param {Uint8Array} data */
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

/**
 * @param {Buffer} png An 8-bit, non-interlaced PNG, as Chrome writes them.
 * @param {number} height Rows to keep from the top.
 * @returns {Buffer}
 */
export function cropHeight(png, height) {
  let at = 8, ihdr = Buffer.alloc(0);
  /** @type {Buffer[]} */
  const idat = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at), type = png.toString("latin1", at + 4, at + 8), data = png.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") ihdr = Buffer.from(data);
    if (type === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const width = ihdr.readUInt32BE(0), depth = ihdr[8], colour = ihdr[9];
  if (depth !== 8 || ihdr[12] !== 0) throw new Error("only 8-bit, non-interlaced PNGs");
  if (height >= ihdr.readUInt32BE(4)) return png;
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour];
  if (!channels) throw new Error(`PNG colour type ${colour} isn't supported`);
  const rows = inflateSync(Buffer.concat(idat)).subarray(0, height * (1 + width * channels));
  ihdr.writeUInt32BE(height, 4);
  return Buffer.concat([png.subarray(0, 8), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", new Uint8Array(0))]);
}
