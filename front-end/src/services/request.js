import axios from 'axios'
import { ElMessage } from 'element-plus';
import { aesDecrypt, aesEncrypt } from '../utils/encrypt';
import { getEncryptedFingerprint } from '../utils/fingerprint';

const ENCRYPTED_PATHS = ['/']; // "/"代表全部加密
const urlEncryptMark = '_';
const ENVELOPE_KEYS = ['d', 'i']
const appendEncryptedQueryMeta = (url, encryptedMeta) => {
  const [pathPart, queryString = ''] = String(url || '').split('?')
  const params = new URLSearchParams(queryString)
  params.set('m', encryptedMeta)
  const nextQuery = params.toString()
  return nextQuery ? `${pathPart}?${nextQuery}` : pathPart
}

const pickEnvelopeKey = () => ENVELOPE_KEYS[Math.floor(Math.random() * ENVELOPE_KEYS.length)]
const getEnvelopePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null
  for (const key of ENVELOPE_KEYS) {
    if (typeof payload[key] === 'string') {
      return payload[key]
    }
  }
  return null
}

function shouldEncryptRequest(config) {
  return ENCRYPTED_PATHS.some(apiPath => config.url.startsWith(apiPath));
}

function shouldEncryptJsonBody(config) {
  return shouldEncryptRequest(config) && !(config.data instanceof FormData);
}

function shouldDecryptResponse(response) {
  return response.headers['x-encrypt'] || response.headers['X-Encrypt'];
}

const request = axios.create({
  baseURL: '/i',
  timeout: 1 * 60 * 1000
})

// 请求时加密，并撒一把盐,盐巴加密传给后端
request.interceptors.request.use(
  async config => {
    let url = config.url || '';
    const matched = shouldEncryptRequest(config);
    const shouldEncryptBody = shouldEncryptJsonBody(config);
    const isFormData = config.data instanceof FormData;
    config.headers = config.headers || {};
    config.headers['X-Encrypt'] = matched ? 'true' : 'false';
    
    // 添加设备指纹信息
    const { encryptedFingerprint, encryptedSalt, salt } = await getEncryptedFingerprint();
    config.headers['x-fp'] = encryptedFingerprint;
    config.headers['x-s'] = encryptedSalt;
    
    if (matched) {
      let requestUrl = url.replace(/^\//, '')
      try {
        if (isFormData && config.encryptedQueryMeta) {
          const encryptedQueryMeta = aesEncrypt(JSON.stringify(config.encryptedQueryMeta), salt);
          requestUrl = appendEncryptedQueryMeta(requestUrl, encryptedQueryMeta);
        }

        const encryptedUrl = aesEncrypt(requestUrl, salt);
        config.url = `${urlEncryptMark}${encodeURIComponent(encryptedUrl)}`;

        if (shouldEncryptBody) {
          const encryptedData = aesEncrypt(JSON.stringify(config.data), salt);
          config.data = {
            [pickEnvelopeKey()]: encryptedData,
          };
        } else if (isFormData && config.encryptedMeta) {
          if (typeof config.data.delete === 'function') {
            ENVELOPE_KEYS.forEach(key => config.data.delete(key))
          }
          config.data.append(pickEnvelopeKey(), aesEncrypt(JSON.stringify(config.encryptedMeta), salt))
        }
      } catch (e) {
        ElMessage.error('请求加密失败');
        console.error('请求加密失败', e);
      }
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// 响应时解密，并且key是否有盐巴
request.interceptors.response.use(
  response => {
    const matched = shouldDecryptResponse(response);
    const encryptedPayload = getEnvelopePayload(response.data)
    if (matched && encryptedPayload) {
      try {
        const encryptedSalt = response.headers['x-s'] || response.headers['X-S'] || '';
        const salt = aesDecrypt(encryptedSalt);
        const decrypted = aesDecrypt(encryptedPayload, salt);
        // 尝试将解密后的字符串转为对象
        try {
          return decrypted && JSON.parse(decrypted);
        } catch {
          return decrypted;
        }
      } catch (e) {
        ElMessage.error('数据解密失败');
        console.error('数据解密失败', e);
        return response.data;
      }
    }
    return response.data;
  },
  error => {
    console.error(error)
    if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
      return Promise.reject(error)
    }
    if (error.response) {
      ElMessage.error(error.response.data.message || '请求失败');
    } else {
      ElMessage.error('请求失败');
    }
    return Promise.reject(error)
  }
)

request.p = request[atob('cG9zdA==')]
export default request
