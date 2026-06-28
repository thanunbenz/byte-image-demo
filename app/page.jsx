"use client";

import { useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import jsQR from "jsqr";

/* ============================================================
   โปรโตคอลเฟรม (ข้อความใน QR แต่ละอัน)
   เฟรมข้อมูลไฟล์ (meta): M|<id>|<total>|<ชื่อไฟล์ encode>|<mime>|<size>
   เฟรมข้อมูล (data):      D|<id>|<idx>|<total>|<base64 ส่วนย่อย>
   - base64 ไม่มีอักขระ "|" จึง split ปลอดภัย
   - ไฟล์ถูก encode เป็น base64 ทั้งก้อนก่อน แล้วค่อยซอย "สตริง"
     ฝั่งรับจึงแค่ต่อสตริงตามลำดับแล้ว decode ครั้งเดียว
   ============================================================ */

function bytesToBase64(bytes) {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

function formatSize(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i ? 1 : 0) + " " + u[i];
}

// วาด QR ลง canvas เอง (คมชัด สแกนง่าย)
function drawQR(canvas, text) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let qr;
  try {
    qr = qrcode(0, "M"); // 0 = auto version, ระดับแก้ความผิดพลาด M
    qr.addData(text, "Byte");
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
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
  }
}

export default function Page() {
  const [mode, setMode] = useState("home"); // home | sender | receiver

  const goHome = () => setMode("home");

  return (
    <div className="wrap">
      {mode === "home" && (
        <section>
          <h1>ส่งไฟล์ผ่าน QR Code</h1>
          <p className="sub">
            ส่งไฟล์ข้ามเครื่องโดยไม่ต้องใช้อินเทอร์เน็ต — เครื่องส่งฉาย QR
            เครื่องรับเปิดกล้องสแกน
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
            หมายเหตุ: ฝั่งผู้รับต้องใช้กล้อง เบราว์เซอร์อนุญาตเฉพาะหน้าเว็บที่เปิดผ่าน{" "}
            <span className="pill">localhost</span> หรือ{" "}
            <span className="pill">https</span> — รันด้วย <code>npm run dev</code>
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
  const [chunkSize, setChunkSize] = useState(800);
  const [speed, setSpeed] = useState(6);
  const [sending, setSending] = useState(false);
  const [frameNow, setFrameNow] = useState("0");
  const [frameTotal, setFrameTotal] = useState(0);
  const [fileLabel, setFileLabel] = useState("-");

  const qrCanvasRef = useRef(null);
  const sendStateRef = useRef(null);

  async function startSending() {
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    const b64 = bytesToBase64(buf);
    const id = Math.random().toString(36).slice(2, 8);
    const mime = file.type || "application/octet-stream";

    const chunks = [];
    for (let i = 0; i < b64.length; i += chunkSize) chunks.push(b64.slice(i, i + chunkSize));
    const total = chunks.length;

    const frames = [];
    frames.push(`M|${id}|${total}|${encodeURIComponent(file.name)}|${mime}|${file.size}`);
    for (let i = 0; i < total; i++) frames.push(`D|${id}|${i}|${total}|${chunks[i]}`);

    sendStateRef.current = { frames, intervalMs: Math.round(1000 / speed) };
    setFrameTotal(total);
    setFileLabel(`${file.name} (${formatSize(file.size)})`);
    setSending(true);
  }

  function stopSending() {
    setSending(false);
  }

  // ฉาย QR วนเมื่อ sending = true
  useEffect(() => {
    if (!sending) return;
    const st = sendStateRef.current;
    if (!st) return;
    let idx = 0;
    const draw = () => {
      const frames = st.frames;
      const frame = frames[idx % frames.length];
      drawQR(qrCanvasRef.current, frame);
      const di = idx % frames.length;
      setFrameNow(di === 0 ? "meta" : String(di));
      idx++;
    };
    draw();
    const t = setInterval(draw, st.intervalMs);
    return () => clearInterval(t);
  }, [sending]);

  return (
    <section>
      <button className="back" onClick={onBack}>&#8592; กลับ</button>
      <h1>ผู้ส่ง</h1>
      <p className="sub">เลือกไฟล์ ระบบจะซอยเป็นหลายเฟรมแล้วฉายวนเป็น QR</p>

      <div className="panel">
        <div className="row">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
        </div>
        <div className="row" style={{ opacity: sending ? 0.4 : 1 }}>
          <div>
            <label className="field">ขนาดต่อเฟรม: <b>{chunkSize}</b> ตัวอักษร</label>
            <input
              type="range" min="200" max="1600" step="100"
              value={chunkSize} disabled={sending}
              onChange={(e) => setChunkSize(+e.target.value)}
            />
          </div>
          <div>
            <label className="field">ความเร็ว: <b>{speed}</b> เฟรม/วิ</label>
            <input
              type="range" min="1" max="15" step="1"
              value={speed} disabled={sending}
              onChange={(e) => setSpeed(+e.target.value)}
            />
          </div>
        </div>
        <div className="row">
          {!sending ? (
            <button disabled={!file} onClick={startSending}>เริ่มฉาย QR</button>
          ) : (
            <button className="ghost" onClick={stopSending}>หยุด</button>
          )}
        </div>
      </div>

      {sending && (
        <>
          <div className="qr-stage">
            <canvas ref={qrCanvasRef} />
          </div>
          <div className="panel">
            <div className="row between">
              <span className="stat">ไฟล์: <b>{fileLabel}</b></span>
              <span className="stat">เฟรม <b>{frameNow}</b> / <b>{frameTotal}</b></span>
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              ให้ผู้รับเล็งกล้องที่ QR ค้างไว้จนครบทุกเฟรม (1 เฟรมข้อมูลไฟล์ + เฟรมข้อมูล)
              ถ้าสแกนยากให้ลดขนาดต่อเฟรมหรือลดความเร็ว
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
function freshRecv() {
  return { id: null, total: 0, chunks: {}, count: 0, filename: null, mime: null, size: 0, done: false };
}

function Receiver({ onBack }) {
  const [cameraOn, setCameraOn] = useState(false);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [fileLabel, setFileLabel] = useState("รอข้อมูล...");
  const [marks, setMarks] = useState([]);
  const [done, setDone] = useState(false);
  const [download, setDownload] = useState(null); // { url, name }
  const [previewUrl, setPreviewUrl] = useState(null);

  const videoRef = useRef(null);
  const scanCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const recvRef = useRef(freshRecv());

  function refreshUI() {
    const r = recvRef.current;
    setCount(r.count);
    setTotal(r.total);
    if (r.filename) setFileLabel(`${r.filename} (${formatSize(r.size)})`);
    const m = [];
    for (let i = 0; i < r.total; i++) m.push(r.chunks[i] !== undefined);
    setMarks(m);
  }

  function resetReceive() {
    recvRef.current = freshRecv();
    setCount(0); setTotal(0); setMarks([]);
    setFileLabel("รอข้อมูล..."); setDone(false);
    setDownload(null); setPreviewUrl(null);
  }

  function assemble() {
    const r = recvRef.current;
    r.done = true;
    let b64 = "";
    for (let i = 0; i < r.total; i++) b64 += r.chunks[i];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: r.mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    setDownload({ url, name: r.filename || "received.bin" });
    if ((r.mime || "").startsWith("image/")) setPreviewUrl(url);
    setDone(true);
    stopCamera();
  }

  function handleFrame(str) {
    const parts = str.split("|");
    const type = parts[0];
    if (type !== "M" && type !== "D") return;
    const id = parts[1];

    const r = recvRef.current;
    if (r.id && r.id !== id) {
      // transfer ใหม่ -> เริ่มเก็บใหม่
      recvRef.current = freshRecv();
    }
    const rr = recvRef.current;
    rr.id = id;

    if (type === "M") {
      rr.total = parseInt(parts[2], 10);
      rr.filename = decodeURIComponent(parts[3] || "received.bin");
      rr.mime = parts[4] || "application/octet-stream";
      rr.size = parseInt(parts[5], 10) || 0;
    } else {
      const idx = parseInt(parts[2], 10);
      rr.total = parseInt(parts[3], 10);
      if (rr.chunks[idx] === undefined) {
        rr.chunks[idx] = parts[4];
        rr.count++;
      }
    }

    refreshUI();
    if (rr.total > 0 && rr.count === rr.total && !rr.done) assemble();
  }

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = s;
      setCameraOn(true);
    } catch (e) {
      alert(
        "เปิดกล้องไม่สำเร็จ: " + e.message +
        "\nต้องเปิดหน้านี้ผ่าน localhost หรือ https"
      );
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }

  // ลูปสแกนเมื่อกล้องเปิด
  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const canvas = scanCanvasRef.current;
    if (!video || !canvas) return;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});

    let raf;
    const loop = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (code && code.data) handleFrame(code.data);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  // เก็บกวาดตอนออกจากหน้า
  useEffect(() => () => stopCamera(), []);

  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <section>
      <button className="back" onClick={onBack}>&#8592; กลับ</button>
      <h1>ผู้รับ</h1>
      <p className="sub">เปิดกล้องเล็งไปที่ QR ของผู้ส่ง ระบบจะเก็บเฟรมจนครบแล้วประกอบไฟล์</p>

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
      <canvas ref={scanCanvasRef} style={{ display: "none" }} />

      {(cameraOn || count > 0) && (
        <div className="panel">
          <div className="row between">
            <span className="stat">ไฟล์: <b>{fileLabel}</b></span>
            <span className="stat">รับแล้ว <b>{count}</b> / <b>{total || "?"}</b></span>
          </div>
          <div className="bar" style={{ marginTop: 12 }}>
            <span style={{ width: pct + "%" }} />
          </div>
          <div className="grid-frames">
            {marks.map((on, i) => (
              <div key={i} className={"cell" + (on ? " on" : "")} />
            ))}
          </div>
        </div>
      )}

      {done && download && (
        <div className="panel">
          <div className="row between">
            <span className="stat" style={{ color: "var(--accent2)" }}>
              <b>รับครบแล้ว!</b> พร้อมบันทึก
            </span>
            <a className="dl" href={download.url} download={download.name}>
              <button>บันทึกไฟล์</button>
            </a>
          </div>
          {previewUrl && (
            <div className="preview">
              <img src={previewUrl} alt="preview" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
