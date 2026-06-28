import "./globals.css";

export const metadata = {
  title: "ส่งไฟล์ผ่าน QR (ไม่ใช้เน็ต)",
  description: "ส่งไฟล์ข้ามเครื่องด้วย QR code แบบไม่ต้องใช้อินเทอร์เน็ต",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
