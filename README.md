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

The file is sent as **raw bytes** (no base64) using an **LT fountain code**, so frame order does not matter and lost frames never need to be re-shown.

| Step | Sender | Receiver |
|------|--------|----------|
| 1 | Pick a file | Open camera |
| 2 | Split into K blocks of B bytes | Scan QR frames continuously |
| 3 | Emit fountain symbols (XOR of random blocks) as QR frames, cycling forever | Decode symbols by peeling as they arrive |
| 4 | — | Once enough symbols arrive (~K + 5-20%), reassemble and download |

### Why it is fast

- **Raw bytes in QR Byte mode** — no base64, ~33% less data than text encoding.
- **Fountain code** — each frame is a random XOR of blocks keyed by a 4-byte seed; the receiver finishes after any sufficient set of frames, with no waiting for a specific missing frame to loop back.
- **Web Worker decode** — jsQR runs off the main thread, paced by `requestVideoFrameCallback`, so capture is not throttled by rendering.
- **EC level L** — maximum QR capacity; the fountain code already tolerates losses.

### Frame format (raw bytes inside each QR)

```text
Meta:  [1][id:4][fileLen:u32][B:u16][mimeLen:1][mime][nameLen:1][name]
Data:  [2][id:4][seed:u32][payload:B]
```

K (block count) is derived as `ceil(fileLen / B)` on both sides. The data payload is one fountain symbol; the receiver regenerates the block set from `seed`.

### Tuning

- **Bytes per frame (B)** — smaller frames scan easier but need more frames.
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
