import axios from 'axios'
import { ElMessage } from 'element-plus';
import { aesDecrypt, aesEncrypt } from '../utils/encrypt';

const ENCRYPTED_PATHS = ['/user/files'];
function shouldEncryptRequest(path) {
  return ENCRYPTED_PATHS.some(apiPath => path.startsWith(apiPath));
}

function shouldDecryptResponse(response) {
  return response.headers['x-encrypt'] || response.headers['X-Encrypt'];
}

const request = axios.create({
  baseURL: '/api',
  timeout: 1 * 60 * 1000
})

request.interceptors.request.use(
  config => {
    const url = config.url || '';
    const matched = shouldEncryptRequest(url);
    config.headers = config.headers || {};
    config.headers['X-Encrypt'] = matched ? 'true' : 'false';
    if (matched) {
      try {
        const urlRoutes = url.split('/');
        const encryptedUrl = aesEncrypt(urlRoutes.slice(2).join('/'));
        const encryptedData = aesEncrypt(JSON.stringify(config.data));
        config.url = `${urlRoutes.slice(0,2).join('/')}/${encryptedUrl}`;
        config.data = {
          data: encryptedData
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
request.interceptors.response.use(
  response => {
    const matched = shouldDecryptResponse(response);
    if (matched && response.data && typeof response.data.data === 'string') {
      try {
        const decrypted = aesDecrypt(response.data.data);
        // 尝试将解密后的字符串转为对象
        try {
          return JSON.parse(decrypted);
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