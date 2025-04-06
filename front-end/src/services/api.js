import axios from 'axios'
import { routeMedia, routeThumbnail} from '@/config'

const api = axios.create({
  baseURL: '/api',
  timeout: 5 * 60 * 1000
})

// 获取文件列表
export const getFiles = async (id = null, query = null, page = 0, pageSize = -1) => {
  const params = { id, query, page, pageSize };
  const response = await api.post('/files', params)
  return response.data.map((file) => {
    if(file.type === 'file' && file.path) {
      file.path = `${routeMedia}${file.path}`
    }
    if(file.thumbnail) {
      file.thumbnail = `${routeThumbnail}${file.thumbnail}`
    }
    return file
  })
}

// 获取文件夹详细信息
export const getFolderInfo = async (id) => {
  if (!id) return null;
  const params = { id };
  const response = await api.post('/folderInfo', params)
  return response.data
}

// 更新缓存
export const updateCache = async (id = null) => {
  const params = { id };
  const response = await api.post('/updateCache', params)
  return response.data
}

// 创建文件夹
export const createNewFolder = async (folderName, parentId = null) => {
  const params = { folderName, parentId };
  const response = await api.post('/createFolder', params)
  return response.data
}

// 重命名文件或文件夹
export const renameFile = async (id, newName, type) => {
  const params = { id, newName, type };
  const response = await api.post('/rename', params)
  return response.data
}

// 删除文件或文件夹
export const deleteFileOrFolder = async (id, type) => {
  const params = { id, type };
  const response = await api.post('/delete', params)
  return response.data
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
    onUploadProgress: (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
      if (onProgress) onProgress(percentCompleted)
    }
  })
  
  return response.data
}

// 从文本链接下载
export const downloadFromText = async (text, folderId) => {
  const response = await api.post('/downloadFromText', { text, folderId })
  return response.data
}

// 移动文件
export const moveFile = async (sourceId, targetId) => {
  const params = { sourceId, targetId };
  const response = await api.post('/move', params)
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