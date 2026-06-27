# byte-image-demo

A small Node.js demo showing how to read a file into raw bytes and write those
bytes back into a new, byte-identical file.

## Requirements

- Node.js (no external dependencies)

## Usage

```bash
node read-bytes.js
```

This reads `test.png`, prints its size, and writes an identical copy to
`output.png`.

## Functions

| Function | Description |
|----------|-------------|
| `readFileAsBytes(filePath)` | Reads a file and returns `{ file, length, bytes }`. Throws if the file is missing. |
| `writeBytesToFile(bytes, outPath)` | Converts a byte array back to a `Buffer` and writes it to `outPath`. |

## Example

```js
const result = readFileAsBytes("test.png");   // read  -> bytes
writeBytesToFile(result.bytes, "output.png"); // bytes -> new file
```

## Key APIs

| Task | API |
|------|-----|
| Read file as bytes | `fs.readFileSync(path)` (returns a `Buffer`) |
| Buffer to number array | `[...buffer]` |
| Number array to Buffer | `Buffer.from(bytes)` |
| Write Buffer to file | `fs.writeFileSync(path, buffer)` |
