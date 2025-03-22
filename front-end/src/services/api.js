import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 5 * 60 * 1000
})

// 获取文件列表
export const getFiles = async (path, page = 0, pageSize = -1) => {
  const response = await api.post('/files', { path, page, pageSize })
  return response.data
}

// 搜索文件
export const searchFiles = async (query, path) => {
  const response = await api.post('/search', { query, path })
  return response.data
}

// 更新缓存
export const updateCache = async (path) => {
  const response = await api.post('/updateCache', { path })
  return response.data
}

// 创建文件夹
export const createNewFolder = async (folderName, path) => {
  const response = await api.post('/createFolder', { folderName, path })
  return response.data
}

// 重命名文件或文件夹
export const renameFile = async (sourcePath, newName, type) => {
  const response = await api.post('/rename', { sourcePath, newName, type })
  return response.data
}

// 删除文件或文件夹
export const deleteFileOrFolder = async (path, type) => {
  const response = await api.post('/delete', { path, type })
  return response.data
}

// 上传文件
export const uploadFileToServer = async (file, path, onProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await api.post(`/upload?path=${encodeURIComponent(path)}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress: (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
      if (onProgress) onProgress(percentCompleted)
    }
  })
  
  return response.data
}

// 从文本链接下载
export const downloadFromText = async (text, folder) => {
  const response = await api.post('/downloadFromText', { text, folder })
  return response.data
}

// 移动文件
export const moveFile = async (sourcePath, targetFolder) => {
  const response = await api.post('/move', { sourcePath, targetFolder })
  return response.data
}

// 解压文件
export const unzipFile = async (zipFilePath) => {
  const response = await api.post('/unzip', { zipFilePath })
  return response.data
}

// 读取文本文件
export const readTextFile = async (filePath, start = 0, numLines = 50) => {
  const response = await api.post('/readTextFile', { filePath, start, numLines })
  return response.data
}

// 转换文本文件编码
export const convertTextEncoding = async (filePath) => {
  const response = await api.post('/convertTxtEncoding', { filePath })
  return response.data
}

// 转换TS文件为MP4
export const convertFileToMp4 = async (inputFilePath, outputFilePath) => {
  const response = await api.post('/convert', { inputFilePath, outputFilePath })
  return response.data
}

export const registerUser = async () => {
  const response = await api.get('/register')
  return response.data
}