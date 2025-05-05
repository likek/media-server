import axios from 'axios'
import { ElMessage } from 'element-plus';
import { aesDecrypt } from '../utils/encrypt';

const ENCRYPTED_PATHS = ['/user/files', '/user/favorites/list', '/user/folderInfo'];

const request = axios.create({
  baseURL: '/api',
  timeout: 1 * 60 * 1000
})

request.interceptors.response.use(
  response => {
    const url = response.config.url || '';
    const matched = ENCRYPTED_PATHS.some(path => url.startsWith(path));
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