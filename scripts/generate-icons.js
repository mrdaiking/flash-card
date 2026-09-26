// Pure Node.js PNG generator — no native deps required
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// 5-wide × 7-tall bitmap glyphs (each row = 5-bit mask, MSB = leftmost pixel)
const GLYPHS = {
  F: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000, 0b10000],
  C: [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111],
};

// Build CRC32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function mkChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([t, data]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([lenBuf, t, data, crcBuf]);
}

function setPixel(pixels, size, x, y, [r, g, b]) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 3;
  pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
}

function drawGlyph(pixels, size, char, gx, gy, scale, color) {
  const rows = GLYPHS[char];
  if (!rows) return;
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < 5; col++) {
      if (rows[row] & (0b10000 >> col)) {
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++)
            setPixel(pixels, size, gx + col * scale + sx, gy + row * scale + sy, color);
      }
    }
  }
}

// Axis-aligned rounded rect, filled by a corner-radius distance test.
// ponytail: no rotation (unlike the approved mockup's fanned/rotated cards) —
// pure-pixel rotation+anti-aliasing isn't worth it at favicon scale; the
// diagonal offset alone still reads as a stack.
function fillRoundedRect(pixels, size, x, y, w, h, r, color) {
  const x2 = x + w, y2 = y + h;
  for (let py = Math.floor(y); py < Math.ceil(y2); py++) {
    for (let px = Math.floor(x); px < Math.ceil(x2); px++) {
      const cx = px + 0.5, cy = py + 0.5;
      let inside = true;
      if (cx < x + r && cy < y + r) inside = Math.hypot(cx - (x + r), cy - (y + r)) <= r;
      else if (cx > x2 - r && cy < y + r) inside = Math.hypot(cx - (x2 - r), cy - (y + r)) <= r;
      else if (cx < x + r && cy > y2 - r) inside = Math.hypot(cx - (x + r), cy - (y2 - r)) <= r;
      else if (cx > x2 - r && cy > y2 - r) inside = Math.hypot(cx - (x2 - r), cy - (y2 - r)) <= r;
      if (inside) setPixel(pixels, size, px, py, color);
    }
  }
}

function fillTriangle(pixels, size, p1, p2, p3, color) {
  const minX = Math.floor(Math.min(p1[0], p2[0], p3[0]));
  const maxX = Math.ceil(Math.max(p1[0], p2[0], p3[0]));
  const minY = Math.floor(Math.min(p1[1], p2[1], p3[1]));
  const maxY = Math.ceil(Math.max(p1[1], p2[1], p3[1]));
  const sign = (a, b, c) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
  for (let py = minY; py < maxY; py++) {
    for (let px = minX; px < maxX; px++) {
      const pt = [px + 0.5, py + 0.5];
      const d1 = sign(pt, p1, p2), d2 = sign(pt, p2, p3), d3 = sign(pt, p3, p1);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(hasNeg && hasPos)) setPixel(pixels, size, px, py, color);
    }
  }
}

// Card-stack + "F" mark, authored in a 120x120 design space (matches the
// approved logo concept) and scaled to the actual icon size via U.
function makePNG(size) {
  const pixels = Buffer.alloc(size * size * 3);
  const U = size / 120;
  const paper = [0xff, 0xfb, 0xeb];  // cream backdrop
  const line = [0xe8, 0xdc, 0xc9];   // back card
  const base = [0xf2, 0xe6, 0xe2];   // middle card
  const accent = [0xc2, 0x41, 0x0c]; // front card (terracotta)
  const cream = [0xff, 0xfb, 0xeb];  // fold + "F"

  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = paper[0]; pixels[i * 3 + 1] = paper[1]; pixels[i * 3 + 2] = paper[2];
  }

  fillRoundedRect(pixels, size, 20 * U, 12 * U, 56 * U, 76 * U, 10 * U, line);
  fillRoundedRect(pixels, size, 26 * U, 18 * U, 56 * U, 76 * U, 10 * U, base);
  fillRoundedRect(pixels, size, 32 * U, 24 * U, 56 * U, 76 * U, 10 * U, accent);
  fillTriangle(pixels, size, [70 * U, 24 * U], [88 * U, 24 * U], [88 * U, 42 * U], cream);

  const scale = Math.max(1, Math.round(20 * U / 7));
  const glyphW = 5 * scale, glyphH = 7 * scale;
  drawGlyph(pixels, size, 'F', Math.round(60 * U - glyphW / 2), Math.round(66 * U - glyphH / 2), scale, cream);

  // Build raw scanlines (filter byte 0 = None per row)
  const rowStride = size * 3 + 1;
  const raw = Buffer.alloc(size * rowStride);
  for (let y = 0; y < size; y++) {
    raw[y * rowStride] = 0;
    pixels.copy(raw, y * rowStride + 1, y * size * 3, (y + 1) * size * 3);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    mkChunk('IHDR', ihdr),
    mkChunk('IDAT', zlib.deflateSync(raw)),
    mkChunk('IEND', Buffer.alloc(0)),
  ]);
}

const iconsDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), makePNG(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), makePNG(512));
console.log('Icons generated: public/icons/icon-192.png, public/icons/icon-512.png');
