import { aesEncrypt, aesDecrypt } from "../utils/encrypt.js";

// 需要加密返回的接口路径
const ENCRYPTED_PATHS = ['/files', '/favorites/list', '/folderInfo'];

const shouldEncryptResponse = path => ENCRYPTED_PATHS.some(apiPath => path.startsWith(apiPath));
const shouldDecryptRequest = req => req.headers['X-Encrypt'] === 'true' || req.headers['x-encrypt'] === 'true';

export function decryptRequestMiddleware(req, res, next) {
  const reqUrl = decodeURIComponent(req.originalUrl)
  if (shouldDecryptRequest(req)) {
    try {
      const matches = reqUrl.match(/(\/api\/.+\/)(.*)/);
      const encryptedUrl = matches[2];
      const decryptedUrl = aesDecrypt(encryptedUrl);
      const decryptedData = aesDecrypt(req.body.data);
      req.originalUrl = `${matches[1]}${decryptedUrl}`;
      console.log("请求解密后：", req.originalUrl, decryptedData, req.path);
      req.body = JSON.parse(decryptedData);
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
    if (shouldEncryptResponse(req.path)) {
      let dataStr;
      try {
        dataStr = typeof body === 'string' ? body : JSON.stringify(body);
      } catch (e) {
        console.error('数据序列化失败', e);
        return originalJson.call(this, { message: '数据序列化失败' });
      }
      try {
        const encrypted = aesEncrypt(dataStr);
        res.setHeader('X-Encrypt', 'true');
        return originalJson.call(this, { data: encrypted });
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
