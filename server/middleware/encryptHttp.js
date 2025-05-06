import { aesEncrypt, aesDecrypt } from "../utils/encrypt.js";

// 需要加密返回的接口路径
const ENCRYPTED_PATHS = ['/api/user/', '/api/admin/', '/api/logs/'];
const urlEncryptMark = '_';

const shouldEncryptResponse = req => {
  return ENCRYPTED_PATHS.some(apiPath => req.originalUrl.startsWith(apiPath))
};
const shouldDecryptRequest = req => req.headers['X-Encrypt'] === 'true' || req.headers['x-encrypt'] === 'true';

export function decryptRequestMiddleware(req, res, next) {
  const reqUrl = decodeURIComponent(req.originalUrl);
  if (shouldDecryptRequest(req)) {
    try {
      const salt = req.body.s ? aesDecrypt(req.body.s) : '';

      const matches = reqUrl.split(urlEncryptMark);
      const encryptedUrl = matches[1];
      const decryptedUrl = aesDecrypt(encryptedUrl, salt);
      const decryptedData = req.body.data && aesDecrypt(req.body.data, salt);
      req.url = `${matches[0]}${decryptedUrl}`;
      req.originalUrl = req.url;
      req.body = decryptedData && JSON.parse(decryptedData);
    } catch (e) {
      console.error('请求解密失败', reqUrl, e);
      return res.status(400).json({ message: '请求解密失败' });
    }
  }
  next();
}

export function encryptResponseMiddleware(req, res, next) {
  const originalJson = res.json;
  res.json = function (body) {
    if (shouldEncryptResponse(req)) {
      let dataStr;
      const salt = Date.now().toString();
      try {
        dataStr = typeof body === 'string' ? body : JSON.stringify(body);
      } catch (e) {
        console.error('数据序列化失败', e);
        return originalJson.call(this, { message: '数据序列化失败' });
      }
      try {
        const encrypted = aesEncrypt(dataStr, salt);
        res.setHeader('X-Encrypt', 'true');
        return originalJson.call(this, { data: encrypted, s: aesEncrypt(salt) });
      } catch (e) {
        console.error('数据加密失败', e);
        return originalJson.call(this, { message: '数据加密失败' });
      }
    } else {
      return originalJson.call(this, body);
    }
  };
  next();
}
