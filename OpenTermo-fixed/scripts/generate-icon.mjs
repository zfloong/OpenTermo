// Generate a minimal valid PNG icon for Tauri.
// Uses only Node.js built-ins (zlib for deflate).
import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync, existsSync } from "fs";

const W = 128;
const H = 128;

// CRC32 for PNG chunks
function crc32(buf) {
  let c;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function u32be(v) {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = u32be(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcVal = crc32(crcInput);
  const crcBytes = u32be(crcVal);
  return Buffer.concat([
    Buffer.from(len),
    typeBytes,
    data,
    Buffer.from(crcBytes),
  ]);
}

// ---- build raw pixel data ----
// Filter byte (0 = none) per row, then RGB pixels
const rawRows = [];
for (let y = 0; y < H; y++) {
  const row = [0]; // filter: none
  for (let x = 0; x < W; x++) {
    // Catppuccin Mocha blue: #89B4FA
    row.push(0x89, 0xb4, 0xfa);
  }
  rawRows.push(Buffer.from(row));
}
const raw = Buffer.concat(rawRows);

// Deflate
const compressed = deflateSync(raw);

// Build PNG
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const ihdrData = Buffer.from([
  ...u32be(W),
  ...u32be(H),
  8,  // bit depth
  2,  // color type: RGB
  0,  // compression
  0,  // filter
  0,  // interlace
]);
const ihdr = chunk("IHDR", ihdrData);
const idat = chunk("IDAT", compressed);
const iend = chunk("IEND", Buffer.alloc(0));

const png = Buffer.concat([signature, ihdr, idat, iend]);

const dir = "src-tauri/icons";
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/icon.png`, png);
console.log(`Generated ${dir}/icon.png (${W}x${H})`);
