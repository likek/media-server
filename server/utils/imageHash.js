import sharp from "sharp";

export async function computeDHashFromFile(filePath) {
  const { data } = await sharp(filePath, { failOn: "none" })
    .rotate()
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  let bitIndex = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      if (left > right) {
        hash |= 1n << (63n - bitIndex);
      }
      bitIndex += 1n;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

export async function computeDHashFromBuffer(buffer) {
  const { data } = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  let bitIndex = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      if (left > right) {
        hash |= 1n << (63n - bitIndex);
      }
      bitIndex += 1n;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

export function hammingDistanceHex64(a, b) {
  const x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let v = x;
  let count = 0;
  while (v) {
    count += Number(v & 1n);
    v >>= 1n;
  }
  return count;
}
