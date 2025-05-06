import axios from 'axios'
import { ElMessage } from 'element-plus';
import { aesDecrypt, aesEncrypt } from '../utils/encrypt';

const ENCRYPTED_PATHS = ['/']; // "/"代表全部加密
const urlEncryptMark = '_';
function shouldEncryptRequest(config) {
  return ENCRYPTED_PATHS.some(apiPath => config.url.startsWith(apiPath));
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
  config => {
    let url = config.url || '';
    const matched = shouldEncryptRequest(config);
    config.headers = config.headers || {};
    config.headers['X-Encrypt'] = matched ? 'true' : 'false';
    if (matched) {
      const salt = Date.now().toString();
      url = url.replace(/^\//, '')
      try {
        const encryptedUrl = aesEncrypt(url, salt);
        config.url = `${urlEncryptMark}${encryptedUrl}`;

        const encryptedData = aesEncrypt(JSON.stringify(config.data), salt);
        config.data = {
          d: encryptedData,
          s: aesEncrypt(salt)
        };
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
    if (matched && response.data && typeof response.data.d === 'string') {
      try {
        const salt = response.data.s ? aesDecrypt(response.data.s) : '';
        const decrypted = response.data.d && aesDecrypt(response.data.d, salt);
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
    if (error.response) {
      ElMessage.error(error.response.data.message || '请求失败');
    } else {
      ElMessage.error('请求失败');
    }
    return Promise.reject(error)
  }
)
export default request