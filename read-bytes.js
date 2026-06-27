const fs = require("fs");
const path = require("path");

function readFileAsBytes(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ไม่พบไฟล์: ${filePath}`);
  }

  const bytes = fs.readFileSync(filePath);

  return {
    file: filePath,
    length: bytes.length,
    bytes: [...bytes],
  };
}

function writeBytesToFile(bytes, outPath) {
  const buffer = Buffer.from(bytes); // แปลง array ตัวเลข -> Buffer
  fs.writeFileSync(outPath, buffer); // เขียนลงไฟล์
  return outPath;
}

// 1) อ่านไฟล์ต้นฉบับ
const target = path.join(__dirname, "input/test.png");
const result = readFileAsBytes(target);

console.log(`ไฟล์: ${result.file}`);
console.log(`ขนาดไฟล์: ${result.length} bytes`);

const outPath = path.join(__dirname, "output/output2.png");
writeBytesToFile(
  [
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13,
    73, 72, 68, 82, 0, 0, 0, 4, 0, 0, 0, 4,
    8, 2, 0, 0, 0, 38, 147, 9, 41, 0, 0, 0,
    39, 73, 68, 65, 84, 120, 156, 5, 193, 49, 1, 0,
    0, 0, 130, 48, 130, 25, 204, 147, 80, 6, 116, 3,
    12, 22, 135, 16, 19, 27, 23, 161, 166, 182, 174, 194,
    204, 236, 220, 60, 167, 99, 19, 65, 29, 165, 81, 33,
    0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
  ], outPath);

console.log(`${outPath}`);
