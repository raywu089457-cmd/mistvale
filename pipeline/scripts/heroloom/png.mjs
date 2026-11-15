// pipeline/scripts/heroloom/png.mjs — tiny dependency-free PNG codec (node:zlib only).
//
// Scope on purpose: 8-bit, non-interlaced PNGs in colour types 0/2/3/4/6. That covers every file the
// HeroLoom scene restyle touches (originals are RGB or RGBA/palette, outputs are indexed or RGBA).
// No colour management: the project art is sRGB and the existing pipeline ignores gAMA/iCCP too.
//
// decodePng(buf) -> { width, height, colorType, hasAlpha, alphaMode, rgba: Uint8Array }
// encodeRgba(width, height, rgba) -> Buffer
// encodeIndexed(width, height, indices, palette, transparentIndex) -> Buffer
//
// palette is an array of [r,g,b] arrays (<= 256 entries); pass transparentIndex = -1 for opaque.

import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
};

export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33) throw new Error('not a PNG buffer');
  if (!PNG_SIGNATURE.equals(buf.subarray(0, 8))) throw new Error('PNG signature mismatch');
  let pos = 8, width = 0, height = 0, bitDepth = 8, colorType = -1, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const end = pos + 8 + len;
    if (end + 4 > buf.length) throw new Error('truncated ' + type + ' chunk');
    if (type === 'IHDR') {
      width = buf.readUInt32BE(pos + 8);
      height = buf.readUInt32BE(pos + 12);
      bitDepth = buf[pos + 16];
      colorType = buf[pos + 17];
      interlace = buf[pos + 20];
    } else if (type === 'PLTE') {
      palette = buf.subarray(pos + 8, end);
    } else if (type === 'tRNS') {
      trns = buf.subarray(pos + 8, end);
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(pos + 8, end));
    } else if (type === 'IEND') {
      break;
    }
    pos = end + 4;
  }
  if (!(width > 0) || !(height > 0)) throw new Error('missing IHDR dimensions');
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth + ' (only 8-bit)');
  if (interlace !== 0) throw new Error('interlaced PNG unsupported');
  const ch = CHANNELS[colorType];
  if (ch == null) throw new Error('unsupported colour type ' + colorType);
  if (colorType === 3 && !palette) throw new Error('indexed PNG without PLTE');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rowBytes = width * ch;
  const stride = rowBytes + 1;
  if (raw.length < height * stride) throw new Error('IDAT shorter than expected');
  const pix = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const src = y * stride + 1;
    const row = y * rowBytes;
    const prev = row - rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const a = x >= ch ? pix[row + x - ch] : 0;
      const b = y > 0 ? pix[prev + x] : 0;
      const c = x >= ch && y > 0 ? pix[prev + x - ch] : 0;
      let v = raw[src + x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: v += paeth(a, b, c); break;
        default: throw new Error('bad PNG filter type ' + filter);
      }
      pix[row + x] = v & 255;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  const keyed = colorType === 0 || colorType === 2;
  let tR = -1, tG = -1, tB = -1;
  if (keyed && trns && trns.length >= (colorType === 0 ? 2 : 6)) {
    if (colorType === 0) { tR = tG = tB = trns.readUInt16BE(0); }
    else { tR = trns.readUInt16BE(0); tG = trns.readUInt16BE(2); tB = trns.readUInt16BE(4); }
  }
  let alphaMode = 'none';
  for (let i = 0, p = 0; i < width * height; i++, p += ch) {
    let r, g, b, a = 255;
    if (colorType === 0) {
      r = g = b = pix[p];
      if (r === tR) a = 0;
    } else if (colorType === 2) {
      r = pix[p]; g = pix[p + 1]; b = pix[p + 2];
      if (r === tR && g === tG && b === tB) a = 0;
    } else if (colorType === 3) {
      const idx = pix[p];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
      else a = 255;
    } else if (colorType === 4) {
      r = g = b = pix[p]; a = pix[p + 1];
    } else {
      r = pix[p]; g = pix[p + 1]; b = pix[p + 2]; a = pix[p + 3];
    }
    if (a !== 0 && a !== 255) alphaMode = 'semi';
    else if (a === 0 && alphaMode === 'none') alphaMode = 'binary';
    const o = i * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
  }
  return { width, height, colorType, hasAlpha: colorType === 4 || colorType === 6 || !!trns, alphaMode, rgba };
}

const ihdr = (width, height, colorType) => {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(width, 0);
  b.writeUInt32BE(height, 4);
  b[8] = 8;        // bit depth
  b[9] = colorType;
  b[10] = 0;       // compression
  b[11] = 0;       // filter
  b[12] = 0;       // interlace
  return b;
};

const deflate = (raw) => zlib.deflateSync(raw, { level: 9, memLevel: 9 });

export function encodeRgba(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * stride + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr(width, height, 6)),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function encodeIndexed(width, height, indices, palette, transparentIndex = -1) {
  if (palette.length > 256) throw new Error('palette too large (' + palette.length + ')');
  if (indices.length !== width * height) throw new Error('index buffer size mismatch');
  const stride = width + 1;
  const raw = Buffer.alloc(stride * height);
  const chunks = [];
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x++) raw[y * stride + 1 + x] = indices[y * width + x];
  }
  const plte = Buffer.alloc(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i][0]; plte[i * 3 + 1] = palette[i][1]; plte[i * 3 + 2] = palette[i][2];
  }
  chunks.push(chunk('IHDR', ihdr(width, height, 3)), chunk('PLTE', plte));
  if (transparentIndex >= 0) {
    const trns = Buffer.alloc(transparentIndex + 1, 255);
    trns[transparentIndex] = 0;
    chunks.push(chunk('tRNS', trns));
  }
  chunks.push(chunk('IDAT', deflate(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat([PNG_SIGNATURE, ...chunks]);
}

export function isBinaryAlpha(rgba) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0 && rgba[i] !== 255) return false;
  return true;
}
