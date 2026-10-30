// Draws desktop/icon.png (256x256): a gold temple on a night-blue tile. Run: node desktop/make-icon.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 256, SS = 4;
const inRoundRect = (x, y, r) => { const cx = Math.min(Math.max(x, r), S - r), cy = Math.min(Math.max(y, r), S - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
const temple = (x, y) => {
  if (y >= 70 && y <= 104 && Math.abs(x - 128) <= (y - 70) * 2.6) return true; // pediment
  if (y >= 108 && y <= 118 && x >= 44 && x <= 212) return true;                 // architrave
  for (const c of [58, 98, 138, 178]) if (x >= c && x <= c + 20 && y >= 122 && y <= 184) return true; // columns
  if (y >= 188 && y <= 198 && x >= 40 && x <= 216) return true;                 // steps
  return y >= 202 && y <= 212 && x >= 30 && x <= 226;
};
const px = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  px[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    let a = 0, g = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const sx = x + (i + 0.5) / SS, sy = y + (j + 0.5) / SS;
      if (inRoundRect(sx, sy, 48)) { a++; if (temple(sx, sy)) g++; }
    }
    const n = SS * SS, t = a ? g / a : 0, sky = 1 - y / S;
    const o = y * (S * 4 + 1) + 1 + x * 4;
    px[o] = Math.round((18 + 20 * sky) * (1 - t) + 236 * t);
    px[o + 1] = Math.round((28 + 30 * sky) * (1 - t) + 190 * t);
    px[o + 2] = Math.round((58 + 50 * sky) * (1 - t) + 92 * t);
    px[o + 3] = Math.round((a / n) * 255);
  }
}
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'icon.png'), png);
