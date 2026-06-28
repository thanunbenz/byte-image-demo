/* ============================================================
   LT Fountain Code
   ------------------------------------------------------------
   - แบ่งไฟล์เป็น K บล็อก ขนาด B ไบต์ (บล็อกสุดท้าย pad ด้วย 0)
   - แต่ละ "ซิมโบล" ที่ส่ง = XOR ของบล็อกชุดหนึ่งที่สุ่มจาก seed
   - ผู้ส่งใส่แค่ seed (4 ไบต์) ผู้รับ regenerate ชุดบล็อกจาก seed เดียวกัน
   - ผู้รับถอดรหัสแบบ peeling (belief propagation)
   - รับเฟรมครบพอ (เกิน K เล็กน้อย ~5-15%) ก็ประกอบไฟล์ได้
     โดยไม่สนลำดับและไม่ต้องรอ "เฟรมที่ขาด" วนกลับมา
   ============================================================ */

// PRNG แบบกำหนด seed ได้ (ต้องให้ผลตรงกันทั้งสองฝั่ง)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Robust Soliton distribution -> CDF (คำนวณครั้งเดียวต่อ K)
export function solitonCdf(K, c = 0.03, delta = 0.5) {
  if (K <= 1) return [0, 1]; // K=1: degree=1 เสมอ
  const rho = new Array(K + 1).fill(0);
  rho[1] = 1 / K;
  for (let d = 2; d <= K; d++) rho[d] = 1 / (d * (d - 1));

  const R = c * Math.log(K / delta) * Math.sqrt(K);
  const kr = Math.max(1, Math.round(K / R));
  const tau = new Array(K + 1).fill(0);
  for (let d = 1; d <= K; d++) {
    if (d < kr) tau[d] = R / (d * K);
    else if (d === kr) tau[d] = (R * Math.log(R / delta)) / K;
    else tau[d] = 0;
  }

  let Z = 0;
  const mu = new Array(K + 1).fill(0);
  for (let d = 1; d <= K; d++) { mu[d] = rho[d] + tau[d]; Z += mu[d]; }

  const cdf = new Array(K + 1).fill(0);
  let acc = 0;
  for (let d = 1; d <= K; d++) { acc += mu[d] / Z; cdf[d] = acc; }
  return cdf;
}

function sampleDegree(cdf, K, rnd) {
  const x = rnd();
  for (let d = 1; d <= K; d++) if (x <= cdf[d]) return d;
  return K;
}

// seed -> รายชื่อ index ของบล็อกที่นำมา XOR กัน
export function symbolIndices(seed, K, cdf) {
  const rnd = mulberry32(seed);
  const d = sampleDegree(cdf, K, rnd);
  const set = new Set();
  while (set.size < d) set.add(Math.floor(rnd() * K));
  return set;
}

function xorInto(target, src) {
  for (let i = 0; i < target.length; i++) target[i] ^= src[i];
}

// ---------- ฝั่งส่ง ----------
export function makeEncoder(fileBytes, B) {
  const K = Math.ceil(fileBytes.length / B);
  const blocks = new Array(K);
  for (let i = 0; i < K; i++) {
    const blk = new Uint8Array(B); // pad 0 อัตโนมัติ
    blk.set(fileBytes.subarray(i * B, Math.min((i + 1) * B, fileBytes.length)));
    blocks[i] = blk;
  }
  const cdf = solitonCdf(K);
  function symbol(seed) {
    const out = new Uint8Array(B);
    for (const idx of symbolIndices(seed, K, cdf)) xorInto(out, blocks[idx]);
    return out;
  }
  return { K, symbol };
}

// ---------- ฝั่งรับ (peeling decoder) ----------
export function makeDecoder(K, B, fileLength) {
  const cdf = solitonCdf(K);
  const recovered = new Array(K).fill(null);
  let recoveredCount = 0;
  const byIndex = Array.from({ length: K }, () => new Set());

  function recover(startI, startData) {
    const queue = [[startI, startData]];
    while (queue.length) {
      const [i, data] = queue.shift();
      if (recovered[i]) continue;
      recovered[i] = data;
      recoveredCount++;
      const affected = [...byIndex[i]];
      byIndex[i].clear();
      for (const sym of affected) {
        if (!sym.indices.has(i)) continue;
        xorInto(sym.data, data);
        sym.indices.delete(i);
        if (sym.indices.size === 1) {
          const j = sym.indices.values().next().value;
          byIndex[j].delete(sym);
          queue.push([j, sym.data]);
        }
      }
    }
  }

  function add(seed, payload) {
    const sym = { indices: symbolIndices(seed, K, cdf), data: payload.slice(0) };
    // ลดด้วยบล็อกที่รู้แล้ว
    for (const i of [...sym.indices]) {
      if (recovered[i]) {
        xorInto(sym.data, recovered[i]);
        sym.indices.delete(i);
      }
    }
    if (sym.indices.size === 0) return;
    if (sym.indices.size === 1) {
      recover(sym.indices.values().next().value, sym.data);
    } else {
      for (const i of sym.indices) byIndex[i].add(sym);
    }
  }

  function assemble() {
    const out = new Uint8Array(K * B);
    for (let i = 0; i < K; i++) if (recovered[i]) out.set(recovered[i], i * B);
    return out.subarray(0, fileLength);
  }

  return {
    add,
    isDone: () => recoveredCount === K,
    count: () => recoveredCount,
    blockDone: (i) => recovered[i] !== null,
    assemble,
  };
}
