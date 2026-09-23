// make-icons.mjs — สร้างไอคอนแอป (PWA) จากโลโก้คบเพลิงเดียวกับที่ใช้ในหัวเว็บ
// รันด้วย: node make-icons.mjs   (ไม่ต้องติดตั้ง dependency ใด ๆ)
// แก้รูปทรง/สีที่ TORCH กับ COLORS แล้วรันใหม่ ไอคอนทุกขนาดจะอัปเดตตาม
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ROOT, "assets", "icons");
const SS = 4; // supersampling — วาดใหญ่ 4 เท่าแล้วย่อลง ขอบจะได้ไม่หยัก

// รูปคบเพลิงจาก index.html แปลงเป็นพิกัดมุม (ทุกชิ้นเป็นรูปหลายเหลี่ยมตรง ๆ) บนผืนผ้า 48x48
const TORCH = [
  { pts: [[24, 4], [27, 12], [21, 12]],                     fill: "#ffe0a6" }, // เปลวไฟ
  { pts: [[22, 12], [26, 12], [26, 17], [22, 17]],          fill: "#ffe0a6" },
  { pts: [[18, 17], [30, 17], [28, 25], [20, 25]],          fill: "#ffffff" },
  { pts: [[16, 25], [32, 25], [30.4, 34], [17.6, 34]],      fill: "#fff2e4" },
  { pts: [[13, 34], [35, 34], [33.6, 42], [14.4, 42]],      fill: "#ffd9b5" },
];
const BOX = { x0: 13, y0: 4, x1: 35, y1: 42 }; // กรอบจริงของคบเพลิงใน 48x48
const COLORS = { top: "#de6a2b", bottom: "#a83c0e" };       // ไล่สีพื้นตามโทนแบรนด์

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// วาดไอคอนหนึ่งใบ: size = ขนาดจริง, pad = สัดส่วนที่เว้นรอบคบเพลิง, round = ความมนของมุม (0 = เต็มสี่เหลี่ยม)
function drawIcon(size, { contentRatio, round }) {
  const S = size * SS;
  const big = Buffer.alloc(S * S * 4);
  const [tr, tg, tb] = hex(COLORS.top);
  const [br, bg, bb] = hex(COLORS.bottom);
  const r = round * S;

  // คบเพลิงสูง (y0..y1) — ย่อตามความสูงแล้วจัดกึ่งกลาง
  const scale = (contentRatio * S) / (BOX.y1 - BOX.y0);
  const offX = S / 2 - ((BOX.x0 + BOX.x1) / 2) * scale;
  const offY = S / 2 - ((BOX.y0 + BOX.y1) / 2) * scale;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // มุมมน: เช็กระยะจากจุดศูนย์กลางของวงมุมที่ใกล้ที่สุด
      if (r > 0) {
        const cx = Math.min(Math.max(x + 0.5, r), S - r);
        const cy = Math.min(Math.max(y + 0.5, r), S - r);
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue; // นอกกรอบมน = โปร่งใส
      }
      const t = y / (S - 1);
      big[i] = Math.round(tr + (br - tr) * t);
      big[i + 1] = Math.round(tg + (bg - tg) * t);
      big[i + 2] = Math.round(tb + (bb - tb) * t);
      big[i + 3] = 255;

      const ux = (x + 0.5 - offX) / scale;
      const uy = (y + 0.5 - offY) / scale;
      for (let k = TORCH.length - 1; k >= 0; k--) {
        if (!inPolygon(ux, uy, TORCH[k].pts)) continue;
        const [pr, pg, pb] = hex(TORCH[k].fill);
        big[i] = pr; big[i + 1] = pg; big[i + 2] = pb;
        break;
      }
    }
  }

  // ย่อจาก SS เท่า ด้วยการเฉลี่ยค่าแบบ premultiplied alpha (ขอบโปร่งใสจะได้ไม่คล้ำ)
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * S + (x * SS + dx)) * 4;
          const a = big[i + 3] / 255;
          R += big[i] * a; G += big[i + 1] * a; B += big[i + 2] * a; A += a;
        }
      }
      const n = SS * SS, o = (y * size + x) * 4;
      out[o] = A ? Math.round(R / A) : 0;
      out[o + 1] = A ? Math.round(G / A) : 0;
      out[o + 2] = A ? Math.round(B / A) : 0;
      out[o + 3] = Math.round((A / n) * 255);
    }
  }
  return out;
}

/* ---------- เขียนไฟล์ PNG เอง (RGBA 8 บิต ไม่ interlace) ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, colour type 6 (RGBA)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// maskable = ระบบปฏิบัติการจะครอปเป็นวงกลม/รูปทรงของเครื่อง จึงต้องเต็มขอบและเว้นที่รอบโลโก้มากกว่า
const ICONS = [
  { file: "icon-192.png",          size: 192, contentRatio: 0.64, round: 0.22 },
  { file: "icon-512.png",          size: 512, contentRatio: 0.64, round: 0.22 },
  { file: "icon-192-maskable.png", size: 192, contentRatio: 0.46, round: 0 },
  { file: "icon-512-maskable.png", size: 512, contentRatio: 0.46, round: 0 },
  { file: "apple-touch-icon.png",  size: 180, contentRatio: 0.62, round: 0 },
  { file: "favicon-32.png",        size: 32,  contentRatio: 0.72, round: 0.22 },
];

await mkdir(OUT_DIR, { recursive: true });
for (const ic of ICONS) {
  const png = encodePng(ic.size, drawIcon(ic.size, ic));
  await writeFile(join(OUT_DIR, ic.file), png);
  console.log(`✓ ${ic.file.padEnd(24)} ${String(ic.size).padStart(3)}px  ${(png.length / 1024).toFixed(1)} KB`);
}
console.log(`\nสร้างไอคอนเสร็จ → ${OUT_DIR}`);
