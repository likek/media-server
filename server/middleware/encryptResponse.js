import { aesEncrypt } from "../utils/encrypt.js";

// 需要加密返回的接口路径
const ENCRYPTED_PATHS = ['/files', '/favorites/list', '/folderInfo'];

function shouldEncrypt(path) {
  return ENCRYPTED_PATHS.some(apiPath => path.startsWith(apiPath));
}

function encryptResponseMiddleware(req, res, next) {
  // 仅拦截json方法
  const originalJson = res.json;
  res.json = function (body) {
    if (shouldEncrypt(req.path)) {
      let dataStr;
      try {
        dataStr = typeof body === 'string' ? body : JSON.stringify(body);
      } catch (e) {
        console.error('数据序列化失败', e);
        return originalJson.call(this, { message: '数据序列化失败' });
      }
      try {
        const encrypted = aesEncrypt(dataStr);
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

export default encryptResponseMiddleware;