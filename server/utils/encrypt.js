import crypto from 'crypto';
import { createHash } from 'crypto';

const cryptKey = "Y1G2IC3F4WE5ZDXBVU67JT8H9SA0K1NM2LQ3O4PR5678".slice(0, 32);
function padZero(buffer, blockSize = 4) {
  const padLength = blockSize - (buffer.length % blockSize);
  if (padLength === 0 || padLength === blockSize) return buffer;
  const pad = Buffer.alloc(padLength, 0);
  return Buffer.concat([buffer, pad]);
}

function getKey(key = cryptKey) {
  let buf = Buffer.from(key, 'utf8');
  buf = padZero(buf, 4);
  return buf;
}

function getIv(key = cryptKey) {
  const hash = createHash('sha256').update(key).digest();
  return hash.subarray(0, 16); // 128位IV
}

export function aesEncrypt(data, keySalt = '', key = cryptKey) {
  if (!data) return data;
  key = `${keySalt}${key}`.slice(0, 32);
  key = key || process.env.CRYPT_KEY || 'default_crypt_key';
  const cipherKey = getKey(key);
  const iv = getIv(key);
  const cipher = crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

export function aesDecrypt(data, keySalt = '', key = cryptKey) {
  if (!data) return data;
  key = `${keySalt}${key}`.slice(0, 32);
  key = key || process.env.CRYPT_KEY || 'default_crypt_key';
  const cipherKey = getKey(key);
  const iv = getIv(key);
  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  let decrypted = decipher.update(data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
