import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";
import { TEMP_FULL_PATH } from "../../serverConfig.js";

const execFileAsync = promisify(execFile);

function isHeifLike(filePath = "") {
  return /\.(heic|heif)$/i.test(filePath);
}

function isHeifUnsupportedError(error) {
  const message = error?.message || String(error || "");
  return /heif/i.test(message) || /compression format has not been built in/i.test(message);
}

async function ensureTempDir() {
  await fs.promises.mkdir(TEMP_FULL_PATH, { recursive: true });
}

async function convertHeifToPngWithSips(filePath) {
  if (process.platform !== "darwin") {
    throw new Error("HEIC/HEIF decoding is not available in current sharp build");
  }

  await ensureTempDir();
  const tempFilePath = path.join(
    TEMP_FULL_PATH,
    `heif-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.png`
  );

  try {
    await execFileAsync("sips", ["-s", "format", "png", filePath, "--out", tempFilePath]);
    const buffer = await fs.promises.readFile(tempFilePath);
    return buffer;
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
      }
    } catch {}
  }
}

export async function loadImageAsPngBuffer(filePath) {
  try {
    return await sharp(filePath, { failOn: "none" })
      .rotate()
      .png()
      .toBuffer();
  } catch (error) {
    if (!isHeifLike(filePath) || !isHeifUnsupportedError(error)) {
      throw error;
    }

    return await convertHeifToPngWithSips(filePath);
  }
}

export function isHeifLikeFile(filePath = "", mimeType = "") {
  return /\.(heic|heif)$/i.test(filePath) || /image\/hei[cf]/i.test(mimeType);
}

export async function ensureCachedPreviewImage(filePath, cacheDir, cacheKey) {
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `${cacheKey}.jpg`);
  if (fs.existsSync(cachePath)) {
    return cachePath;
  }

  const normalizedBuffer = await loadImageAsPngBuffer(filePath);
  await sharp(normalizedBuffer, { failOn: "none" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(cachePath);
  return cachePath;
}

export async function loadImageMetadata(filePath) {
  try {
    return await sharp(filePath, { failOn: "none" }).metadata();
  } catch (error) {
    if (!isHeifLike(filePath) || !isHeifUnsupportedError(error)) {
      throw error;
    }

    const buffer = await convertHeifToPngWithSips(filePath);
    return await sharp(buffer, { failOn: "none" }).metadata();
  }
}
