// Tiny 8-bit PNG reader/writer shared by the outfit compositor and its checker (no dependencies).
// readPNG -> { w, h, data: Uint8ClampedArray RGBA } (colour types 6, 2, 0, 4 and 3 with tRNS; no interlace)
// encodePNG(w, h, rgba) -> Buffer
import fs from 'node:fs';
import zlib from 'node:zlib';

const crcT = (() => {
  const t = new Int32Array(256);
  for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[k] = c; }
  return t;
})();
const crc32 = (buf) => { let c = -1; for (const v of buf) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
export function readPNG(file) {
  let b;
  try { b = fs.readFileSync(file); } catch { return null; }
  if (b.length < 8 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  let p = 8, w = 0, h = 0, depth = 0, colorType = 0, interlace = 0, plte = null, trns = null;
  const idat = [];
  while (p + 8 <= b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; colorType = d[9]; interlace = d[12]; }
    else if (type === 'PLTE') plte = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
    if (type === 'IEND') break;
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : colorType === 3 ? 1 : 0;
  if (!w || !h || depth !== 8 || interlace || !ch) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, pix = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), off = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[off++], row = raw.subarray(off, off + stride); off += stride;
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, up = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + up) & 255;
      else if (filter === 3) v = (v + ((a + up) >> 1)) & 255;
      else if (filter === 4) {
        const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255;
      }
      cur[x] = v;
    }
    cur.copy(pix, y * stride); prev = cur;
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4;
    if (colorType === 6) { data[d] = pix[s]; data[d + 1] = pix[s + 1]; data[d + 2] = pix[s + 2]; data[d + 3] = pix[s + 3]; }
    else if (colorType === 2) { data[d] = pix[s]; data[d + 1] = pix[s + 1]; data[d + 2] = pix[s + 2]; data[d + 3] = 255; }
    else if (colorType === 0) { data[d] = data[d + 1] = data[d + 2] = pix[s]; data[d + 3] = 255; }
    else if (colorType === 4) { data[d] = data[d + 1] = data[d + 2] = pix[s]; data[d + 3] = pix[s + 1]; }
    else { const k = pix[s]; data[d] = plte[k * 3]; data[d + 1] = plte[k * 3 + 1]; data[d + 2] = plte[k * 3 + 2]; data[d + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return { w, h, data };
}
