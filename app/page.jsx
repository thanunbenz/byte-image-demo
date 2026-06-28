"use client";

import { useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import { makeEncoder, makeDecoder } from "./lt";

/* ============================================================
   เฟรมเป็น "ไบต์ดิบ" (ไม่ใช้ base64) อ่านกลับด้วย jsQR.binaryData
   - Meta:  [1][id:4][fileLen:u32][B:u16][mimeLen:1][mime][nameLen:1][name]
   - Data:  [2][id:4][seed:u32][payload:B]   <- payload = ซิมโบล fountain
   K (จำนวนบล็อก) คำนวณจาก fileLen/B ทั้งสองฝั่ง จึงไม่ต้องส่ง
   ============================================================ */

const enc = new TextEncoder();
const dec = new TextDecoder();

function formatSize(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i ? 1 : 0) + " " + u[i];
}

function idKey(b, off) {
  return (b[off] * 2 ** 24 + b[off + 1] * 2 ** 16 + b[off + 2] * 256 + b[off + 3]) >>> 0;
}

// แปลง Uint8Array -> Latin1 string เพื่อใส่ QR แบบ Byte mode (charCode & 0xff)
function bytesToBinStr(bytes) {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return s;
}

function drawQR(canvas, bytes) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let qr;
  try {
    qr = qrcode(0, "L"); // EC-L: ความจุสูงสุด/เวอร์ชันเล็กสุด (fountain ทนเฟรมหายอยู่แล้ว)
    qr.addData(bytesToBinStr(bytes), "Byte");
    qr.make();
  } catch (e) {
    canvas.width = canvas.height = 300;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 300, 300);
    ctx.fillStyle = "#c00"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("ข้อมูลต่อเฟรมใหญ่เกินไป", 150, 140);
    ctx.fillText("ลดขนาดต่อเฟรมลง", 150, 165);
    return;
  }
  const count = qr.getModuleCount();
  const quiet = 4;
  const dim = count + quiet * 2;
  const scale = Math.max(2, Math.floor(512 / dim));
  const px = dim * scale;
  canvas.width = canvas.height = px;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = "#000";
  for (let r = 0; r < count; r++)
    for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
}

export default function Page() {
  const [mode, setMode] = useState("home");
  const goHome = () => setMode("home");

  return (
    <div className="wrap">
      {mode === "home" && (
        <section>
          <h1>ส่งไฟล์ผ่าน QR Code</h1>
          <p className="sub">
            ส่งไฟล์ข้ามเครื่องโดยไม่ต้องใช้อินเทอร์เน็ต — ไบต์ดิบ + fountain code
            รับเฟรมครบพอก็ประกอบไฟล์ได้ ไม่ต้องรอเฟรมที่ขาดวนกลับมา
          </p>
          <div className="roles">
            <div className="role-card" onClick={() => setMode("sender")}>
              <div className="icon">&#128228;</div>
              <div className="title">ผู้ส่ง</div>
              <div className="desc">เลือกไฟล์ แล้วฉาย QR</div>
            </div>
            <div className="role-card" onClick={() => setMode("receiver")}>
              <div className="icon">&#128229;</div>
              <div className="title">ผู้รับ</div>
              <div className="desc">เปิดกล้องสแกน QR</div>
            </div>
          </div>
          <p className="note" style={{ marginTop: 24 }}>
            หมายเหตุ: ฝั่งผู้รับต้องใช้กล้อง เบราว์เซอร์อนุญาตเฉพาะ{" "}
            <span className="pill">localhost</span> หรือ <span className="pill">https</span> —
            รันด้วย <code>npm run dev</code>
          </p>
        </section>
      )}
      {mode === "sender" && <Sender onBack={goHome} />}
      {mode === "receiver" && <Receiver onBack={goHome} />}
    </div>
  );
}

/* ============================================================
   ผู้ส่ง
   ============================================================ */
function Sender({ onBack }) {
  const [file, setFile] = useState(null);
  const [bytesPerFrame, setBytesPerFrame] = useState(900);
  const [fps, setFps] = useState(10);
  const [sending, setSending] = useState(false);
  const [info, setInfo] = useState({ label: "-", K: 0, sent: 0 });

  const canvasRef = useRef(null);
  const stRef = useRef(null);

  async function start() {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const B = bytesPerFrame;
    const enc8 = makeEncoder(bytes, B);
    const id4 = new Uint8Array(4);
    for (let i = 0; i < 4; i++) id4[i] = Math.floor(Math.random() * 256);

    // meta frame (ไบต์)
    const mimeB = enc.encode(file.type || "application/octet-stream");
    const nameB = enc.encode(file.name).subarray(0, 255);
    const meta = new Uint8Array(1 + 4 + 4 + 2 + 1 + mimeB.length + 1 + nameB.length);
    const mdv = new DataView(meta.buffer);
    let o = 0;
    meta[o++] = 1; meta.set(id4, o); o += 4;
    mdv.setUint32(o, bytes.length, true); o += 4;
    mdv.setUint16(o, B, true); o += 2;
    meta[o++] = mimeB.length; meta.set(mimeB, o); o += mimeB.length;
    meta[o++] = nameB.length; meta.set(nameB, o); o += nameB.length;

    stRef.current = { enc8, id4, B, meta, seed: 1, intervalMs: Math.round(1000 / fps) };
    setInfo({ label: `${file.name} (${formatSize(bytes.length)})`, K: enc8.K, sent: 0 });
    setSending(true);
  }

  useEffect(() => {
    if (!sending) return;
    const st = stRef.current;
    if (!st) return;
    let tick = 0;
    const draw = () => {
      // แทรก meta เป็นระยะ (1 ใน 12 เฟรม) ที่เหลือเป็นซิมโบลข้อมูล
      if (tick % 12 === 0) {
        drawQR(canvasRef.current, st.meta);
      } else {
        const seed = st.seed++;
        const payload = st.enc8.symbol(seed);
        const frame = new Uint8Array(9 + st.B);
        frame[0] = 2; frame.set(st.id4, 1);
        new DataView(frame.buffer).setUint32(5, seed, true);
        frame.set(payload, 9);
        drawQR(canvasRef.current, frame);
        setInfo((p) => ({ ...p, sent: seed }));
      }
      tick++;
    };
    draw();
    const t = setInterval(draw, st.intervalMs);
    return () => clearInterval(t);
  }, [sending]);

  return (
    <section>
      <button className="back" onClick={onBack}>&#8592; กลับ</button>
      <h1>ผู้ส่ง</h1>
      <p className="sub">ไฟล์ถูกซอยเป็นบล็อก แล้วฉายซิมโบล fountain วนต่อเนื่อง</p>

      <div className="panel">
        <div className="row">
          <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} />
        </div>
        <div className="row" style={{ opacity: sending ? 0.4 : 1 }}>
          <div>
            <label className="field">ขนาดต่อเฟรม: <b>{bytesPerFrame}</b> ไบต์</label>
            <input type="range" min="300" max="1800" step="100" value={bytesPerFrame}
              disabled={sending} onChange={(e) => setBytesPerFrame(+e.target.value)} />
          </div>
          <div>
            <label className="field">ความเร็ว: <b>{fps}</b> เฟรม/วิ</label>
            <input type="range" min="2" max="30" step="1" value={fps}
              disabled={sending} onChange={(e) => setFps(+e.target.value)} />
          </div>
        </div>
        <div className="row">
          {!sending ? (
            <button disabled={!file} onClick={start}>เริ่มฉาย QR</button>
          ) : (
            <button className="ghost" onClick={() => setSending(false)}>หยุด</button>
          )}
        </div>
      </div>

      {sending && (
        <>
          <div className="qr-stage"><canvas ref={canvasRef} /></div>
          <div className="panel">
            <div className="row between">
              <span className="stat">ไฟล์: <b>{info.label}</b></span>
              <span className="stat">บล็อก <b>{info.K}</b> · ส่งแล้ว <b>{info.sent}</b></span>
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              ให้ผู้รับเล็งกล้องที่ QR ค้างไว้ ผู้รับต้องการเฟรมประมาณ {Math.ceil(info.K * 1.1)}+ เฟรม
              (ลำดับไหนก็ได้) ถ้าสแกนยากให้ลดขนาดต่อเฟรมหรือลดความเร็ว
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/* ============================================================
   ผู้รับ
   ============================================================ */
function Receiver({ onBack }) {
  const [cameraOn, setCameraOn] = useState(false);
  const [st, setSt] = useState({ name: "รอข้อมูล...", size: 0, K: 0, got: 0, frames: 0 });
  const [done, setDone] = useState(null); // { url, name }
  const [previewUrl, setPreviewUrl] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const workerRef = useRef(null);
  const runningRef = useRef(false);
  const inFlightRef = useRef(false);

  const decRef = useRef(null); // { id, K, B, fileLength, mime, name, decoder, frames }
  const bufRef = useRef([]); // ซิมโบลที่มาก่อน meta

  function resetReceive() {
    decRef.current = null;
    bufRef.current = [];
    setSt({ name: "รอข้อมูล...", size: 0, K: 0, got: 0, frames: 0 });
    setDone(null);
    setPreviewUrl(null);
  }

  function finish() {
    const d = decRef.current;
    const bytes = d.decoder.assemble();
    const blob = new Blob([bytes], { type: d.mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    setDone({ url, name: d.name || "received.bin" });
    if ((d.mime || "").startsWith("image/")) setPreviewUrl(url);
    stopCamera();
  }

  function handleFrame(b) {
    if (!b || b.length < 5) return;
    const type = b[0];
    const id = idKey(b, 1);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);

    if (type === 1) {
      // meta
      const fileLength = dv.getUint32(5, true);
      const B = dv.getUint16(9, true);
      let o = 11;
      const mimeLen = b[o++]; const mime = dec.decode(b.subarray(o, o + mimeLen)); o += mimeLen;
      const nameLen = b[o++]; const name = dec.decode(b.subarray(o, o + nameLen)); o += nameLen;

      if (decRef.current && decRef.current.id === id) return; // มีแล้ว
      const K = Math.ceil(fileLength / B);
      const decoder = makeDecoder(K, B, fileLength);
      decRef.current = { id, K, B, fileLength, mime, name, decoder, frames: 0 };
      // เล่นซ้ำซิมโบลที่บัฟไว้ก่อน meta
      for (const s of bufRef.current) if (s.id === id) { decoder.add(s.seed, s.payload); decRef.current.frames++; }
      bufRef.current = [];
      pushState();
    } else if (type === 2) {
      const seed = dv.getUint32(5, true);
      const payload = b.subarray(9);
      const d = decRef.current;
      if (!d || d.id !== id) {
        // ยังไม่มี meta -> บัฟไว้ (เก็บสำเนา payload)
        bufRef.current.push({ id, seed, payload: payload.slice(0) });
        if (bufRef.current.length > 4000) bufRef.current.shift();
        return;
      }
      d.decoder.add(seed, payload);
      d.frames++;
      pushState();
      if (d.decoder.isDone()) finish();
    }
  }

  function pushState() {
    const d = decRef.current;
    if (!d) return;
    setSt({
      name: d.name, size: d.fileLength, K: d.K,
      got: d.decoder.count(), frames: d.frames,
    });
  }

  async function startCamera() {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (e) {
      alert("เปิดกล้องไม่สำเร็จ: " + e.message + "\nต้องเปิดผ่าน localhost หรือ https");
      return;
    }
    // สร้าง worker (ถ้าไม่ได้ค่อย fallback decode บน main thread)
    if (!workerRef.current) {
      try {
        const w = new Worker(new URL("./decoder.worker.js", import.meta.url));
        w.onmessage = (e) => {
          inFlightRef.current = false;
          if (e.data.bytes) handleFrame(new Uint8Array(e.data.bytes));
        };
        w.onerror = () => { workerRef.current = null; };
        workerRef.current = w;
      } catch {
        workerRef.current = null;
      }
    }
    setCameraOn(true);
  }

  function stopCamera() {
    runningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }

  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});
    runningRef.current = true;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const capture = () => {
      if (!runningRef.current) return;
      if (!inFlightRef.current && video.readyState >= 2 && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (workerRef.current) {
          inFlightRef.current = true;
          workerRef.current.postMessage(
            { buffer: img.data.buffer, width: img.width, height: img.height },
            [img.data.buffer]
          );
        } else {
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code && code.binaryData) handleFrame(new Uint8Array(code.binaryData));
        }
      }
      schedule();
    };
    const schedule = () => {
      if (!runningRef.current) return;
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(capture);
      else requestAnimationFrame(capture);
    };
    schedule();
    return () => { runningRef.current = false; };
  }, [cameraOn]);

  useEffect(() => () => {
    runningRef.current = false;
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (workerRef.current) workerRef.current.terminate();
  }, []);

  const pct = st.K > 0 ? Math.round((st.got / st.K) * 100) : 0;
  const showGrid = st.K > 0 && st.K <= 400;

  return (
    <section>
      <button className="back" onClick={onBack}>&#8592; กลับ</button>
      <h1>ผู้รับ</h1>
      <p className="sub">เปิดกล้องเล็งไปที่ QR ของผู้ส่ง รับครบพอแล้วประกอบไฟล์อัตโนมัติ</p>

      <div className="panel">
        <div className="row">
          {!cameraOn ? (
            <button onClick={startCamera}>เปิดกล้อง</button>
          ) : (
            <button className="ghost" onClick={stopCamera}>ปิดกล้อง</button>
          )}
          <button className="ghost small" onClick={resetReceive}>เริ่มรับใหม่</button>
        </div>
      </div>

      <video ref={videoRef} playsInline style={{ display: cameraOn ? "block" : "none" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {(cameraOn || st.got > 0) && (
        <div className="panel">
          <div className="row between">
            <span className="stat">ไฟล์: <b>{st.name}{st.size ? ` (${formatSize(st.size)})` : ""}</b></span>
            <span className="stat">บล็อก <b>{st.got}</b> / <b>{st.K || "?"}</b> · เฟรม <b>{st.frames}</b></span>
          </div>
          <div className="bar" style={{ marginTop: 12 }}><span style={{ width: pct + "%" }} /></div>
          {showGrid && (
            <div className="grid-frames">
              {Array.from({ length: st.K }, (_, i) => (
                <div key={i} className={"cell" + (decRef.current?.decoder.blockDone(i) ? " on" : "")} />
              ))}
            </div>
          )}
        </div>
      )}

      {done && (
        <div className="panel">
          <div className="row between">
            <span className="stat" style={{ color: "var(--accent2)" }}><b>รับครบแล้ว!</b> พร้อมบันทึก</span>
            <a className="dl" href={done.url} download={done.name}><button>บันทึกไฟล์</button></a>
          </div>
          {previewUrl && <div className="preview"><img src={previewUrl} alt="preview" /></div>}
        </div>
      )}
    </section>
  );
}
