import axios from 'axios'
import { ElMessage } from 'element-plus';

const api = axios.create({
  baseURL: '/api',
  timeout: 1 * 60 * 1000
})

api.interceptors.response.use(
  response => {
    return response.data
  },
  error => {
    if (error.response) {
      ElMessage.error(error.response.data.message || '请求失败');
    } else {
      ElMessage.error('请求失败');
    }
    return Promise.reject(error)
  }
)

const folderInfoCache = {}

// 获取文件列表
export const getFiles = async (id = null, query = null, page = 0, pageSize = -1, filters = {}) => {
  const params = { id, query, page, pageSize, ...filters };
  const response = await api.post('/files', params)
  return response
}

// 获取文件夹详细信息
export const getFolderInfo = async (id) => {
  if (!id) return null;
  if (folderInfoCache[id]) {
    return folderInfoCache[id];
  }
  const params = { id };
  const response = await api.post('/folderInfo', params)
  folderInfoCache[id] = response
  return response
}

// 更新缓存
export const updateCache = async (id = null) => {
  const params = { id };
  const response = await api.post('/updateCache', params)
  return response
}

// 创建文件夹
export const createNewFolder = async (folderName, parentId = null) => {
  const params = { folderName, parentId };
  const response = await api.post('/createFolder', params)
  return response
}

// 重命名文件或文件夹
export const renameFile = async (id, newName, type) => {
  const params = { id, newName, type };
  const response = await api.post('/rename', params)
  return response
}

// 删除文件或文件夹
export const deleteFileOrFolder = async (id, type) => {
  const params = { id, type };
  const response = await api.post('/delete', params)
  return response
}

// 上传文件
export const uploadFileToServer = async (file, parentId, onProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const url = `/upload?parentId=${encodeURIComponent(parentId)}`;
    
  const response = await api.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    timeout: 3 * 60 * 60 * 1000,
    onUploadProgress: (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
      if (onProgress) onProgress(percentCompleted)
    }
  })
  
  return response
}

// 从文本链接下载
export const downloadFromText = async (text, folderId) => {
  const response = await api.post('/downloadFromText', { text, folderId }, {
    timeout: 3 * 60 * 60 * 1000
  })
  return response
}

// 移动文件
export const moveFile = async (sourceId, targetId) => {
  const params = { sourceId, targetId };
  const response = await api.post('/move', params)
  return response
}

// 解压文件
export const unzipFile = async (fileId) => {
  const response = await api.post('/unzip', { fileId })
  return response
}

// 读取文本文件
export const readTextFile = async (id, start = 0, numLines = 50) => {
  const response = await api.post('/readTextFile', { id, start, numLines })
  return response
}

// 转换文本文件编码
export const convertTextEncoding = async (id) => {
  const response = await api.post('/convertTxtEncoding', { id })
  return response
}

// 转换TS文件为MP4
export const convertFileToMp4 = async (inputFileId, outputFileSuffix = 'mp4') => {
  const response = await api.post('/convert', { inputFileId, outputFileSuffix })
  return response
}

// 添加到收藏
export const addToFavorites = async (fileId) => {
  const response = await api.post('/favorites/add', { fileId })
  return response
}

// 从收藏中移除
export const removeFromFavorites = async (fileId) => {
  const response = await api.post('/favorites/remove', { fileId })
  return response
}

// 获取收藏列表
export const getFavoritesList = async (page = 0, pageSize = 20) => {
  const response = await api.post('/favorites/list', { page, pageSize })
  return response
}

export const registerUser = async () => {
  const response = await api.get('/register')
  return response
}