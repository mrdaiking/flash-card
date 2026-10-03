// Pure Node.js PNG generator — no native deps required.
// Draws the "spaced dots" mark: four dots with widening gaps climbing a curve
// (reviews spread further apart as memory gets stronger). Shapes are defined in
// a 1024×1024 space and anti-aliased by 4×4 supersampling.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const BG = [181, 69, 26];         // #B5451A
const FG = [255, 255, 255];
const CURVE_ALPHA = 0.28;

const DOTS = [[232, 744, 52], [356, 712, 52], [528, 616, 52], [792, 300, 64]];
// Below ~64 px the curve and the second dot turn to mush: three bigger dots.
const DOTS_SMALL = [[232, 744, 76], [420, 680, 76], [792, 300, 96]];
const CURVE = [[232, 744], [380, 712], [560, 600], [792, 300]]; // cubic bezier
const CURVE_HALF_WIDTH = 9;

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
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([lenBuf, t, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    mkChunk('IHDR', ihdr),
    mkChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    mkChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Bezier sampled once into a polyline; distance-to-polyline gives the stroke.
const curvePts = Array.from({ length: 97 }, (_, i) => {
  const t = i / 96, u = 1 - t;
  const [p0, p1, p2, p3] = CURVE;
  return [0, 1].map(k => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
});
function nearCurve(x, y) {
  for (let i = 1; i < curvePts.length; i++) {
    const [ax, ay] = curvePts[i - 1], [bx, by] = curvePts[i];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= CURVE_HALF_WIDTH) return true;
  }
  return false;
}

function insideRoundedSquare(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1024 - r), cy = Math.min(Math.max(y, r), 1024 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

// opts.radius: corner radius in 1024 space (0 = full bleed, for platforms that mask).
// opts.scale: content scale around the centre (maskable icons keep the mark in the safe zone).
function render(size, { radius = 0, scale = 1 } = {}) {
  const small = size < 64;
  const dots = small ? DOTS_SMALL : DOTS;
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const X = ((px + (sx + 0.5) / SS) / size) * 1024;
          const Y = ((py + (sy + 0.5) / SS) / size) * 1024;
          if (radius && !insideRoundedSquare(X, Y, radius)) continue;
          bg++;
          // mark coordinates, scaled about the centre
          const x = 512 + (X - 512) / scale, y = 512 + (Y - 512) / scale;
          if (dots.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) <= r)) fg += 1;
          else if (!small && x > 200 && x < 820 && y > 270 && y < 780 && nearCurve(x, y)) fg += CURVE_ALPHA;
        }
      }
      const n = SS * SS, i = (py * size + px) * 4;
      const a = bg / n, f = bg ? fg / bg : 0;
      for (let k = 0; k < 3; k++) rgba[i + k] = Math.round(BG[k] * (1 - f) + FG[k] * f);
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return encodePNG(size, rgba);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
const icons = [
  ['icon-192.png', 192, { radius: 228 }],
  ['icon-512.png', 512, { radius: 228 }],
  ['icon-maskable-512.png', 512, { scale: 0.8 }], // Android masks it; mark stays in the safe zone
  ['apple-touch-icon.png', 180, {}],              // iOS rounds the corners itself
  ['favicon-32.png', 32, { radius: 228 }],
];
for (const [name, size, opts] of icons) {
  fs.writeFileSync(path.join(outDir, name), render(size, opts));
  console.log(`Generated ${name}`);
}
