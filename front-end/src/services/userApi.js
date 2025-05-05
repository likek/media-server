import request from "./request";

const folderInfoCache = {}

// 获取文件列表
export const getFiles = async (id = null, query = null, page = 0, pageSize = -1, filters = {}) => {
  const params = { id, query, page, pageSize, ...filters };
  const response = await request.post('/files', params)
  return response
}

// 获取文件夹详细信息
export const getFolderInfo = async (id) => {
  if (!id) return null;
  if (folderInfoCache[id]) {
    return folderInfoCache[id];
  }
  const params = { id };
  const response = await request.post('/folderInfo', params)
  folderInfoCache[id] = response
  return response
}

// 更新缓存
export const updateCache = async (id = null) => {
  const params = { id };
  const response = await request.post('/updateCache', params)
  return response
}

// 创建文件夹
export const createNewFolder = async (folderName, parentId = null) => {
  const params = { folderName, parentId };
  const response = await request.post('/createFolder', params)
  return response
}

// 重命名文件或文件夹
export const renameFile = async (id, newName, type) => {
  const params = { id, newName, type };
  const response = await request.post('/rename', params)
  return response
}

// 删除文件或文件夹
export const deleteFileOrFolder = async (id, type) => {
  const params = { id, type };
  const response = await request.post('/delete', params)
  return response
}

// 上传文件
export const uploadFileToServer = async (file, parentId, onProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const url = `/upload?parentId=${encodeURIComponent(parentId)}`;
    
  const response = await request.post(url, formData, {
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
  const response = await request.post('/downloadFromText', { text, folderId }, {
    timeout: 3 * 60 * 60 * 1000
  })
  return response
}

// 移动文件
export const moveFile = async (sourceId, targetId) => {
  const params = { sourceId, targetId };
  const response = await request.post('/move', params)
  return response
}

// 解压文件
export const unzipFile = async (fileId) => {
  const response = await request.post('/unzip', { fileId })
  return response
}

// 读取文本文件
export const readTextFile = async (id, start = 0, numLines = 50) => {
  const response = await request.post('/readTextFile', { id, start, numLines })
  return response
}

// 转换文本文件编码
export const convertTextEncoding = async (id) => {
  const response = await request.post('/convertTxtEncoding', { id })
  return response
}

// 转换TS文件为MP4
export const convertFileToMp4 = async (inputFileId, outputFileSuffix = 'mp4') => {
  const response = await request.post('/convert', { inputFileId, outputFileSuffix })
  return response
}

// 添加到收藏
export const addToFavorites = async (fileId) => {
  const response = await request.post('/favorites/add', { fileId })
  return response
}

// 从收藏中移除
export const removeFromFavorites = async (fileId) => {
  const response = await request.post('/favorites/remove', { fileId })
  return response
}

// 获取收藏列表
export const getFavoritesList = async (page = 0, pageSize = 20) => {
  const response = await request.post('/favorites/list', { page, pageSize })
  return response
}

export const registerUser = async () => {
  const response = await request.get('/register')
  return response
}