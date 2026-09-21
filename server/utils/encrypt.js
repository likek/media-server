import crypto from "crypto";

// 纯 Node crypto 实现，替代原来的 aes_crypto_wasm。
// 算法与 Rust 端完全一致：AES-256-CBC + PKCS7 + base64，
// key = (keySalt + baseKey) 补 '0' / 截断到 32 字节，iv = sha256(key)[0..16]。
//
// 为什么不再用 wasm：Rust 的 decrypt() 在遇到非法输入时会 panic（unwrap），
// wasm32-unknown-unknown 没有栈展开，panic 直接 trap，导致 __stack_pointer
// 无法回滚。每次 panic 都会永久泄漏约 1.7KB 影子栈；累积约 600 次后栈指针下溢，
// 之后所有 encrypt/decrypt 都会抛 "memory access out of bounds"，
// 整个加密模块彻底失效（只能重启进程）。Node crypto 无共享状态，不会因此崩溃。
const DEFAULT_BASE_KEY = "Y1G2IC3F4WE5ZDXBVU67JT8H9SA0K1NM";

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const isBase64 = (data) => {
  if (typeof data !== "string" || data.length === 0) return false;
  if (data.length % 4 !== 0) return false;
  return BASE64_RE.test(data);
};

// Rust: combine_key() -> 拼接后用 '0' 补到 32 字节，再截断到 32 字节
const deriveKey = (keySalt, baseKey) => {
  const raw = `${keySalt == null ? "" : keySalt}${baseKey == null ? DEFAULT_BASE_KEY : baseKey}`;
  const buf = Buffer.from(raw, "utf8");
  if (buf.length >= 32) {
    return buf.subarray(0, 32);
  }
  return Buffer.concat([buf, Buffer.alloc(32 - buf.length, 0x30)]); // '0' === 0x30
};

// Rust: get_key() 补零到 32 字节（这里 deriveKey 已保证 32 字节）+ get_iv()
const getKeyAndIv = (keySalt, baseKey) => {
  const key = deriveKey(keySalt, baseKey);
  const iv = crypto.createHash("sha256").update(key).digest().subarray(0, 16);
  return { key, iv };
};

export function aesEncrypt(data, keySalt = "", key = undefined) {
  if (!data) return data;
  const { key: aesKey, iv } = getKeyAndIv(keySalt, key);
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(data, "utf8")), cipher.final()]);
  return encrypted.toString("base64");
}

export function aesDecrypt(data, keySalt = "", key = undefined) {
  if (!data) return data;
  // 与 Rust 端保持一致：非法 base64 返回字符串而不是抛错
  if (!isBase64(data)) return "Invalid base64";
  const { key: aesKey, iv } = getKeyAndIv(keySalt, key);
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
