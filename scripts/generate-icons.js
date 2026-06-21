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

function makePNG(size, bgColor, fgColor) {
  const pixels = Buffer.alloc(size * size * 3);

  // Fill background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = bgColor[0];
    pixels[i * 3 + 1] = bgColor[1];
    pixels[i * 3 + 2] = bgColor[2];
  }

  // Draw "FC" centered
  const scale = Math.max(1, Math.floor(size * 0.38 / 7));
  const glyphH = 7 * scale;
  const glyphW = 5 * scale;
  const gap = Math.max(1, Math.floor(scale * 1.5));
  const textW = glyphW * 2 + gap;
  const startX = Math.floor((size - textW) / 2);
  const startY = Math.floor((size - glyphH) / 2);

  drawGlyph(pixels, size, 'F', startX, startY, scale, fgColor);
  drawGlyph(pixels, size, 'C', startX + glyphW + gap, startY, scale, fgColor);

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

const bg = [0x63, 0x66, 0xf1]; // #6366f1 indigo
const fg = [0xff, 0xff, 0xff]; // white

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), makePNG(192, bg, fg));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), makePNG(512, bg, fg));
console.log('Icons generated: public/icons/icon-192.png, public/icons/icon-512.png');
