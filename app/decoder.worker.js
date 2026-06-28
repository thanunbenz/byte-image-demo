// Web Worker: รัน jsQR แยกจาก main thread เพื่อให้จับเฟรมได้เต็มอัตรากล้อง
import jsQR from "jsqr";

self.onmessage = (e) => {
  const { buffer, width, height } = e.data;
  const data = new Uint8ClampedArray(buffer);
  const code = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
  // jsQR.binaryData = ไบต์ดิบของ QR (ไม่ผ่าน text decode)
  self.postMessage({ bytes: code ? code.binaryData : null });
};
