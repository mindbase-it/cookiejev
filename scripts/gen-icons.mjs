// Generates src/icons/icon{16,32,48,128}.png without native deps: a cookie disc with a "no" slash.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src/icons');

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const chips = [[0.32, 0.35], [0.62, 0.3], [0.7, 0.62], [0.4, 0.68], [0.52, 0.5]];
function pixel(size) {
  const c = size / 2;
  const R = size * 0.46;
  return (x, y) => {
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    const d = Math.hypot(dx, dy);
    if (d > R) return [0, 0, 0, 0];
    const edge = Math.min(1, R - d);
    // dark ring
    if (d > R - size * 0.06) return [40, 30, 20, Math.round(255 * edge)];
    // slash (top-left to bottom-right), red
    const s = Math.abs(dx - dy) / Math.SQRT2;
    if (s < size * 0.07) return [214, 40, 40, 255];
    // chips
    for (const [cx, cy] of chips) {
      if (Math.hypot(x + 0.5 - cx * size, y + 0.5 - cy * size) < size * 0.07) return [92, 58, 30, 255];
    }
    return [222, 168, 96, 255];
  };
}

await mkdir(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await writeFile(path.join(outDir, `icon${size}.png`), png(size, pixel(size)));
}
console.warn('icons written to', outDir);
