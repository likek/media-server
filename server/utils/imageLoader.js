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

// sharp 无法解码的错误（不支持的格式，如 BMP/HEIC，或 HEIF 编解码未编译进来）
function isSharpUnsupportedError(error) {
  const message = error?.message || String(error || "");
  return (
    /unsupported image format/i.test(message) ||
    /heif/i.test(message) ||
    /compression format has not been built in/i.test(message)
  );
}

async function ensureTempDir() {
  await fs.promises.mkdir(TEMP_FULL_PATH, { recursive: true });
}

// 用 macOS 自带的 sips 把 sharp 不支持的格式（HEIC/BMP 等）转成 PNG
async function convertToPngWithSips(filePath) {
  if (process.platform !== "darwin") {
    throw new Error(`Image format not supported by sharp, and sips fallback is unavailable on ${process.platform}: ${filePath}`);
  }

  await ensureTempDir();
  const tempFilePath = path.join(
    TEMP_FULL_PATH,
    `img-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.png`
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
    // sharp 不支持的格式（HEIC/BMP 等），回退到 macOS 系统自带的 sips 转码
    if (!isSharpUnsupportedError(error)) {
      throw error;
    }

    return await convertToPngWithSips(filePath);
  }
}

export function isHeifLikeFile(filePath = "", mimeType = "") {
  return /\.(heic|heif)$/i.test(filePath) || /image\/hei[cf]/i.test(mimeType);
}

// 浏览器无法直接显示、或原图体积过大不适合直接预览的格式（HEIC/BMP 等），
// 预览时统一走 ensureCachedPreviewImage 转成缓存 JPG
export function needsPreviewTranscode(filePath = "", mimeType = "") {
  return isHeifLikeFile(filePath, mimeType) || /\.bmp$/i.test(filePath) || /image\/(bmp|x-ms-bmp)/i.test(mimeType);
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
    if (!isSharpUnsupportedError(error)) {
      throw error;
    }

    const buffer = await convertToPngWithSips(filePath);
    return await sharp(buffer, { failOn: "none" }).metadata();
  }
}
