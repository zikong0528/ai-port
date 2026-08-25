'use strict';

// 纯 Node 生成 AI Dock 图标：手写 PNG 编码 + ICO 封装，不依赖系统绘图库。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;

// ---------- PNG 编码 ----------
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: None
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 图形辅助 ----------
function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function coverage(sd) {
  return clamp(0.5 - sd, 0, 1); // 1px 抗锯齿
}

// ---------- 绘制 ----------
function draw() {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  const cx = 128;
  const cy = 128;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const fx = x + 0.5;
      const fy = y + 0.5;

      // 圆角矩形背景
      const bg = coverage(sdRoundRect(fx, fy, cx, cy, 120, 120, 52));
      if (bg <= 0) {
        px[i + 3] = 0;
        continue;
      }

      // 黑白极简：纯黑背景
      let r = 10;
      let g = 10;
      let b = 10;

      // 白色圆环 + 中心圆点（dock 目标样式）
      const d = Math.hypot(fx - cx, fy - cy - 6);
      const ringMid = 63;
      const ringHalf = 9;
      const ring = clamp(0.5 - (Math.abs(d - ringMid) - ringHalf), 0, 1);
      const dot = clamp(0.5 - (d - 18), 0, 1);
      const w = clamp(ring + dot, 0, 1) * bg;

      r = lerp(r, 255, w);
      g = lerp(g, 255, w);
      b = lerp(b, 255, w);

      px[i] = Math.round(r);
      px[i + 1] = Math.round(g);
      px[i + 2] = Math.round(b);
      px[i + 3] = Math.round(bg * 255);
    }
  }
  return px;
}

// ---------- ICO 封装 ----------
function makeICO(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256
  entry[1] = 0; // height 256
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuffer]);
}

// ---------- 输出 ----------
const outDir = path.join(__dirname, '..', 'resources');
fs.mkdirSync(outDir, { recursive: true });

const png = encodePNG(SIZE, SIZE, draw());
const pngPath = path.join(outDir, 'icon.png');
const icoPath = path.join(outDir, 'icon.ico');
fs.writeFileSync(pngPath, png);
fs.writeFileSync(icoPath, makeICO(png));

console.log('已生成 icon.png:', png.length, 'bytes');
console.log('已生成 icon.ico:', fs.statSync(icoPath).size, 'bytes');
