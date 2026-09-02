/*
 * qr.js — ตัวสร้าง QR code ขนาดเล็ก ไม่มี dependency ใช้ได้ทั้งในเบราว์เซอร์และ Node
 *
 * รองรับ byte mode (UTF-8) เวอร์ชัน 1-40 ระดับกันความเสียหาย L/M/Q/H
 * อ้างอิงมาตรฐาน ISO/IEC 18004
 *
 *   QR.encode("https://...")            -> { size, modules }  (modules[y][x] = true คือช่องสีเข้ม)
 *   QR.svg("https://...", { scale: 8 }) -> สตริง SVG
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.QR = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ECC = { L: 0, M: 1, Q: 2, H: 3 };
  // บิตประจำระดับกันความเสียหายที่ใช้ในแถบ format (L=01, M=00, Q=11, H=10)
  const ECC_FORMAT_BITS = [1, 0, 3, 2];

  // จำนวน codeword สำหรับกันความเสียหาย ต่อ 1 บล็อก — [ระดับ][เวอร์ชัน] (ช่อง 0 เป็นตัวคั่นเฉย ๆ)
  const ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];

  // จำนวนบล็อกกันความเสียหาย — [ระดับ][เวอร์ชัน]
  const NUM_ECC_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  const PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  // ---------- เลขคณิตบนฟิลด์ GF(256) สำหรับ Reed-Solomon ----------

  function gfMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }

  function rsComputeDivisor(degree) {
    const result = new Uint8Array(degree);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMultiply(root, 0x02);
    }
    return result;
  }

  function rsComputeRemainder(data, divisor) {
    const result = new Uint8Array(divisor.length);
    for (const b of data) {
      const factor = b ^ result[0];
      result.copyWithin(0, 1);
      result[result.length - 1] = 0;
      for (let i = 0; i < result.length; i++) result[i] ^= gfMultiply(divisor[i], factor);
    }
    return result;
  }

  // ---------- ความจุของแต่ละเวอร์ชัน ----------

  // จำนวนช่องดิบทั้งหมดที่ใช้เก็บข้อมูลได้ (หักลายตำแหน่ง ลายจับเวลา ฯลฯ ออกแล้ว)
  function numRawDataModules(ver) {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function numDataCodewords(ver, ecl) {
    return Math.floor(numRawDataModules(ver) / 8)
      - ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ECC_BLOCKS[ecl][ver];
  }

  function alignmentPatternPositions(ver) {
    if (ver === 1) return [];
    const numAlign = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function toUtf8(str) {
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(str));
    return Array.from(Buffer.from(str, "utf8"));
  }

  // ---------- สร้างสายบิตของข้อมูล ----------

  function buildDataCodewords(bytes, ver, ecl) {
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };

    push(4, 4);                                  // ตัวบอกโหมด: byte mode
    push(bytes.length, ver <= 9 ? 8 : 16);       // จำนวนตัวอักษร (ความยาวฟิลด์ขึ้นกับเวอร์ชัน)
    for (const b of bytes) push(b, 8);

    const capacityBits = numDataCodewords(ver, ecl) * 8;
    push(0, Math.min(4, capacityBits - bits.length));      // ตัวปิดท้าย
    push(0, (8 - (bits.length % 8)) % 8);                  // เติมให้ครบไบต์
    for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

    const result = new Uint8Array(bits.length / 8);
    bits.forEach((bit, i) => { result[i >>> 3] |= bit << (7 - (i & 7)); });
    return result;
  }

  // แทรก ECC เข้าไปแล้วสลับลำดับบล็อกตามที่มาตรฐานกำหนด
  function addEccAndInterleave(data, ver, ecl) {
    const numBlocks = NUM_ECC_BLOCKS[ecl][ver];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
    const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const divisor = rsComputeDivisor(blockEccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const len = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = Array.from(data.slice(k, k + len));
      k += len;
      const ecc = Array.from(rsComputeRemainder(Uint8Array.from(dat), divisor));
      // บล็อกสั้นเติมช่องว่างไว้ 1 ช่องให้ทุกบล็อกยาวเท่ากันตอนสลับลำดับ (ช่องนี้จะถูกข้าม)
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    const result = [];
    for (let i = 0; i < blocks[0].length; i++) {
      for (let j = 0; j < blocks.length; j++) {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i]);
      }
    }
    return Uint8Array.from(result);
  }

  // ---------- วาดตาราง ----------

  function encode(text, options) {
    const opts = options || {};
    const eccName = (opts.ecc || "M").toUpperCase();
    const ecl = ECC[eccName];
    if (ecl === undefined) throw new Error("ระดับกันความเสียหายต้องเป็น L, M, Q หรือ H");

    const bytes = toUtf8(String(text));
    let ver = Math.max(1, Math.min(40, opts.minVersion || 1));
    for (; ; ver++) {
      if (ver > 40) throw new Error("ข้อความยาวเกินกว่าที่ QR code จะเก็บได้");
      const capacityBits = numDataCodewords(ver, ecl) * 8;
      const neededBits = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
      if (neededBits <= capacityBits) break;
    }

    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

    const setFn = (x, y, dark) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      modules[y][x] = dark;
      isFunction[y][x] = true;
    };

    // ลายจับเวลา — วาดยาวตลอดแถว/คอลัมน์ที่ 6 ก่อน แล้วให้ลายตำแหน่งทับส่วนที่ล้ำเข้ามุม
    for (let i = 0; i < size; i++) {
      setFn(6, i, i % 2 === 0);
      setFn(i, 6, i % 2 === 0);
    }

    // ลายตำแหน่ง 3 มุม (วาดเผื่อวงนอกไว้เป็นเส้นคั่น)
    const drawFinder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          setFn(cx + dx, cy + dy, dist !== 2 && dist !== 4);
        }
      }
    };
    drawFinder(3, 3);
    drawFinder(size - 4, 3);
    drawFinder(3, size - 4);

    // ลายปรับตำแหน่ง (ข้ามสามมุมที่มีลายตำแหน่งอยู่แล้ว)
    const aligns = alignmentPatternPositions(ver);
    for (let i = 0; i < aligns.length; i++) {
      for (let j = 0; j < aligns.length; j++) {
        const corner = (i === 0 && j === 0)
          || (i === 0 && j === aligns.length - 1)
          || (i === aligns.length - 1 && j === 0);
        if (corner) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            setFn(aligns[j] + dx, aligns[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }

    // ข้อมูลเวอร์ชัน (เฉพาะเวอร์ชัน 7 ขึ้นไป)
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = getBit(bits, i);
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFn(a, b, bit);
        setFn(b, a, bit);
      }
    }

    const drawFormatBits = (mask) => {
      const data = (ECC_FORMAT_BITS[ecl] << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = (((data << 10) | rem) ^ 0x5412) & 0x7fff;

      for (let i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
      setFn(8, 7, getBit(bits, 6));
      setFn(8, 8, getBit(bits, 7));
      setFn(7, 8, getBit(bits, 8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));

      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
      setFn(8, size - 8, true); // ช่องทึบตายตัว
    };
    drawFormatBits(0); // จองพื้นที่ไว้ก่อน ค่าจริงเขียนทับหลังเลือก mask

    // เรียงข้อมูลลงตารางแบบซิกแซกจากขวาล่างขึ้นบน
    const codewords = addEccAndInterleave(buildDataCodewords(bytes, ver, ecl), ver, ecl);
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // คอลัมน์ 6 เป็นลายจับเวลา ข้ามไป
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && i < codewords.length * 8) {
            modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }

    const maskFns = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x, y) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
    ];

    const applyMask = (mask) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!isFunction[y][x] && maskFns[mask](x, y)) modules[y][x] = !modules[y][x];
        }
      }
    };

    // ---------- คะแนนโทษ: เลือก mask ที่ทำให้ตารางอ่านง่ายที่สุด (กฎ N1-N4 ตามมาตรฐาน) ----------

    const at = (y, x) => (modules[y][x] ? 1 : 0);

    // N1: ช่องสีเดียวกันติดกันตั้งแต่ 5 ช่องขึ้นไปในแนวเดียว
    const penaltyN1 = () => {
      let points = 0;
      const scan = (get) => {
        let last = null, run = 0;
        for (let k = 0; k < size; k++) {
          const cell = get(k);
          if (cell === last) {
            run++;
          } else {
            if (run >= 5) points += PENALTY_N1 + (run - 5);
            last = cell;
            run = 1;
          }
        }
        if (run >= 5) points += PENALTY_N1 + (run - 5);
      };
      for (let i = 0; i < size; i++) {
        scan((k) => at(i, k));
        scan((k) => at(k, i));
      }
      return points;
    };

    // N2: บล็อก 2x2 ที่เป็นสีเดียวกันทั้งหมด
    const penaltyN2 = () => {
      let count = 0;
      for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
          const sum = at(y, x) + at(y, x + 1) + at(y + 1, x) + at(y + 1, x + 1);
          if (sum === 0 || sum === 4) count++;
        }
      }
      return count * PENALTY_N2;
    };

    // N3: ลาย 1:1:3:1:1 ที่มีช่องว่าง 4 ช่องขนาบข้าง (คล้ายลายตำแหน่ง เครื่องอ่านจะสับสน)
    const penaltyN3 = () => {
      let count = 0;
      for (let i = 0; i < size; i++) {
        let bitsRow = 0, bitsCol = 0;
        for (let k = 0; k < size; k++) {
          bitsRow = ((bitsRow << 1) & 0x7ff) | at(i, k);
          if (k >= 10 && (bitsRow === 0x5d0 || bitsRow === 0x05d)) count++;
          bitsCol = ((bitsCol << 1) & 0x7ff) | at(k, i);
          if (k >= 10 && (bitsCol === 0x5d0 || bitsCol === 0x05d)) count++;
        }
      }
      return count * PENALTY_N3;
    };

    // N4: สัดส่วนช่องสีเข้มเบี่ยงจาก 50% มากเท่าไร
    const penaltyN4 = () => {
      let dark = 0;
      for (const row of modules) for (const cell of row) if (cell) dark++;
      const total = size * size;
      const k = Math.abs(Math.ceil(((dark * 100) / total) / 5) - 10);
      return k * PENALTY_N4;
    };

    const penaltyScore = () => penaltyN1() + penaltyN2() + penaltyN3() + penaltyN4();

    let bestMask = 0, minPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      applyMask(mask);
      drawFormatBits(mask);
      const penalty = penaltyScore();
      if (penalty < minPenalty) { minPenalty = penalty; bestMask = mask; }
      applyMask(mask); // ลบ mask ออก (xor ซ้ำได้ค่าเดิม)
    }
    applyMask(bestMask);
    drawFormatBits(bestMask);

    return { size, modules, version: ver, mask: bestMask, ecc: eccName };
  }

  // ---------- ส่งออกเป็น SVG ----------

  function svg(text, options) {
    const opts = options || {};
    const scale = opts.scale || 8;
    const border = opts.border === undefined ? 4 : opts.border; // ขอบขาวรอบนอก มาตรฐานกำหนดอย่างน้อย 4 ช่อง
    const dark = opts.dark || "#000000";
    const light = opts.light || "#ffffff";
    const qr = encode(text, opts);
    const dim = (qr.size + border * 2) * scale;

    let path = "";
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) {
          path += "M" + (x + border) * scale + "," + (y + border) * scale +
            "h" + scale + "v" + scale + "h-" + scale + "z";
        }
      }
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + " " + dim +
      '" width="' + dim + '" height="' + dim + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + light + '"/>' +
      '<path d="' + path + '" fill="' + dark + '"/></svg>';
  }

  return { encode, svg };
});
