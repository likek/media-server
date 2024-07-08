import { aesEncrypt, aesDecrypt } from "../utils/encrypt.js";
import { getSaltByReq } from "../utils/index.js";

// 需要加密返回的接口路径
const ENCRYPTED_PATHS = ['/i/'];
const urlEncryptMark = '_';
const ENVELOPE_KEYS = ['d', 'i'];

const shouldEncryptResponse = req => {
  return ENCRYPTED_PATHS.some(apiPath => req.originalUrl.startsWith(apiPath))
};
const shouldDecryptRequest = req => req.headers['X-Encrypt'] === 'true' || req.headers['x-encrypt'] === 'true';

const decryptPayload = (encryptedPayload, salt) => {
  if (!encryptedPayload) {
    return null;
  }
  const decryptedData = aesDecrypt(encryptedPayload, salt);
  return decryptedData ? JSON.parse(decryptedData) : null;
};

const pickEnvelopeKey = () => ENVELOPE_KEYS[Math.floor(Math.random() * ENVELOPE_KEYS.length)];

const getEnvelopePayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  for (const key of ENVELOPE_KEYS) {
    if (typeof payload[key] === "string") {
      return payload[key];
    }
  }
  return null;
};

const deleteEnvelopePayloads = (payload) => {
  if (!payload || typeof payload !== "object") {
    return;
  }
  ENVELOPE_KEYS.forEach((key) => {
    delete payload[key];
  });
};

const appendQueryValue = (params, key, value) => {
  if (Array.isArray(value)) {
    value.forEach(item => appendQueryValue(params, key, item));
    return;
  }
  if (value === undefined || value === null || value === "") {
    return;
  }
  params.append(key, String(value));
};

const mergeDecryptedQueryMetaIntoUrl = (requestUrl, salt) => {
  const [pathPart, queryString = ""] = String(requestUrl || "").split("?");
  const params = new URLSearchParams(queryString);
  const encryptedMeta = params.get("m");
  if (!encryptedMeta) {
    return requestUrl;
  }

  const decryptedMeta = decryptPayload(encryptedMeta, salt);
  params.delete("m");
  if (decryptedMeta && typeof decryptedMeta === "object" && !Array.isArray(decryptedMeta)) {
    Object.entries(decryptedMeta).forEach(([key, value]) => {
      appendQueryValue(params, key, value);
    });
  }

  const nextQuery = params.toString();
  return nextQuery ? `${pathPart}?${nextQuery}` : pathPart;
};

export function decryptUrlMiddleware(req, res, next) {
  const reqUrl = decodeURIComponent(req.url || req.originalUrl || "");
  if (shouldDecryptRequest(req)) {
    try {
      const salt = getSaltByReq(req);
      const markerIndex = reqUrl.indexOf(urlEncryptMark);
      if (markerIndex === -1) {
        throw new Error("encrypted url marker not found");
      }
      const prefix = reqUrl.slice(0, markerIndex);
      const encryptedPath = reqUrl.slice(markerIndex + 1);
      const decryptedUrl = aesDecrypt(decodeURIComponent(encryptedPath), salt);
      const mergedUrl = mergeDecryptedQueryMetaIntoUrl(decryptedUrl, salt);
      const nextUrl = `${prefix}${mergedUrl}`;
      const baseUrl = req.baseUrl || "";
      req.url = nextUrl;
      req.originalUrl = `${baseUrl}${nextUrl}`;
      req._parsedUrl = undefined;
      req._parsedOriginalUrl = undefined;
    } catch (e) {
      console.error('请求解密失败', reqUrl, e);
      return res.status(400).json({ message: '请求失败' });
    }
  }
  next();
}

export function decryptJsonBodyMiddleware(req, res, next) {
  const encryptedPayload = getEnvelopePayload(req.body);
  if (!shouldDecryptRequest(req) || !encryptedPayload) {
    return next();
  }
  try {
    const salt = getSaltByReq(req);
    req.body = decryptPayload(encryptedPayload, salt) || {};
  } catch (e) {
    console.error('JSON请求体解密失败', req.originalUrl, e);
    return res.status(400).json({ message: '请求失败' });
  }
  next();
}

export function decryptMultipartMetaMiddleware(req, res, next) {
  const encryptedPayload = getEnvelopePayload(req.body);
  if (!shouldDecryptRequest(req) || !encryptedPayload) {
    return next();
  }
  try {
    const salt = getSaltByReq(req);
    const decryptedMeta = decryptPayload(encryptedPayload, salt);
    deleteEnvelopePayloads(req.body);
    if (decryptedMeta && typeof decryptedMeta === 'object' && !Array.isArray(decryptedMeta)) {
      req.body = {
        ...req.body,
        ...decryptedMeta,
      };
    }
  } catch (e) {
    console.error('multipart元数据解密失败', req.originalUrl, e);
    return res.status(400).json({ message: '请求失败' });
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
        return originalJson.call(this, { [pickEnvelopeKey()]: encrypted });
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
