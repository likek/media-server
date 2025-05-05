import axios from 'axios'
import { ElMessage } from 'element-plus';

const request = axios.create({
  baseURL: '/api',
  timeout: 1 * 60 * 1000
})

request.interceptors.response.use(
  response => {
    console.log(response.data)
    return response.data
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