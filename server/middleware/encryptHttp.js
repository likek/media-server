import { aesEncrypt, aesDecrypt } from "../utils/encrypt.js";
import { getSaltByReq } from "../utils/index.js";

// 需要加密返回的接口路径
const ENCRYPTED_PATHS = ['/i/user/', '/i/admin/', '/i/logs/'];
const urlEncryptMark = '_';

const shouldEncryptResponse = req => {
  return ENCRYPTED_PATHS.some(apiPath => req.originalUrl.startsWith(apiPath))
};
const shouldDecryptRequest = req => req.headers['X-Encrypt'] === 'true' || req.headers['x-encrypt'] === 'true';

export function decryptRequestMiddleware(req, res, next) {
  const reqUrl = decodeURIComponent(req.originalUrl);
  if (shouldDecryptRequest(req)) {
    try {
      const salt = getSaltByReq(req);

      const matches = reqUrl.split(urlEncryptMark);
      const decryptedUrl = aesDecrypt(matches[1], salt);
      req.url = `${matches[0]}${decryptedUrl}`;
      req.originalUrl = req.url;

      const decryptedData = req.body.d && aesDecrypt(req.body.d, salt);
      req.body = decryptedData && JSON.parse(decryptedData);
    } catch (e) {
      console.error('请求解密失败', reqUrl, e);
      return res.status(400).json({ message: '请求失败' });
    }
  }
  next();
}

export function encryptResponseMiddleware(req, res, next) {
  const originalJson = res.json;
  res.json = function (body) {
    if (shouldEncryptResponse(req)) {
      let dataStr;
      const salt = `${Date.now().toString().slice(8)}${Math.random().toString(36).substring(2, 10)}`
      try {
        dataStr = typeof body === 'string' ? body : JSON.stringify(body);
      } catch (e) {
        console.error('数据序列化失败', e);
        return originalJson.call(this, { message: '请求失败' });
      }
      try {
        const encrypted = aesEncrypt(dataStr, salt);
        res.setHeader('X-Encrypt', 'true');
        res.setHeader('X-S', aesEncrypt(salt));
        return originalJson.call(this, { d: encrypted });
      } catch (e) {
        console.error('数据加密失败', e);
        return originalJson.call(this, { message: '请求失败' });
      }
    } else {
      return originalJson.call(this, body);
    }
  };
  next();
}
