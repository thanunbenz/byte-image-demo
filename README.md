# byte-image-demo

Two parts:

1. **Byte demo** (`read-bytes.js`) — read a file into raw bytes and write them back into a byte-identical copy.
2. **QR transfer app** (`app/`) — a Next.js frontend that sends a file across machines using animated QR codes. No internet required: the sender displays QR frames, the receiver scans them with a camera.

## Requirements

- Node.js 18+

## Quick start

```bash
npm install        # install dependencies (one time, needs internet once)
npm run dev        # start the QR app at http://localhost:3000
npm run read       # run the original byte demo
```

The QR app needs a camera on the receiver side. Browsers only allow the camera on `localhost` or `https`, so run it via `npm run dev` (localhost is a secure context).

## How the QR transfer works

| Step | Sender | Receiver |
|------|--------|----------|
| 1 | Pick a file | Open camera |
| 2 | File is base64-encoded, then the string is split into chunks | Scan QR frames continuously |
| 3 | Each chunk becomes one QR frame; frames cycle on screen | Collect frames until all are received |
| 4 | — | Reassemble chunks, decode, download the byte-identical file |

### Frame format (text inside each QR)

```text
Meta:  M | <id> | <total> | <encodedFilename> | <mime> | <size>
Data:  D | <id> | <index> | <total> | <base64Chunk>
```

Fields are joined by `|`. Base64 contains no `|`, so splitting is safe. The file is base64-encoded as one string before chunking, so the receiver just concatenates chunks in order and decodes once.

### Tuning

- **Chars per frame** — smaller frames scan easier but need more frames.
- **Speed (frames/sec)** — lower speed is easier to capture in poor lighting.

## Byte demo functions

| Function | Description |
|----------|-------------|
| `readFileAsBytes(filePath)` | Reads a file and returns `{ file, length, bytes }`. Throws if missing. |
| `writeBytesToFile(bytes, outPath)` | Converts a byte array back to a `Buffer` and writes it. |

## Project layout

```text
app/            Next.js QR transfer app (App Router)
  page.jsx      Sender + Receiver UI and logic
  layout.jsx    Root layout
  globals.css   Styles
read-bytes.js   Original byte read/write demo
input/ output/  Sample files for the byte demo
```

> Note: an earlier static prototype lives in `web/` and is no longer used. It can be deleted.
