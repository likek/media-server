import request from "./request";

const folderInfoCache = {}

// 获取文件列表
export const getFiles = async (id = null, query = null, page = 0, pageSize = -1, filters = {}) => {
  const params = { id, query, page, pageSize, ...filters };
  const response = await request.post('/user/files', params)
  return response
}

// 获取文件夹详细信息
export const getFolderInfo = async (id) => {
  if (!id) return null;
  if (folderInfoCache[id]) {
    return folderInfoCache[id];
  }
  const params = { id };
  const response = await request.post('/user/folderInfo', params)
  folderInfoCache[id] = response
  return response
}

// 更新缓存
export const updateCache = async (id = null) => {
  const params = { id, recursive: true };
  const response = await request.post('/user/updateCache', params)
  return response
}

export const cleanDb = async (id = null, options = {}) => {
  const params = { id, ...options };
  const response = await request.post('/user/cleanDb', params, {
    timeout: 30 * 60 * 1000
  })
  return response
}

export const checkFiles = async (id = null, options = {}) => {
  const params = { id, ...options };
  const response = await request.post('/user/checkFiles', params, {
    timeout: 30 * 60 * 1000
  })
  return response
}

// 创建文件夹
export const createNewFolder = async (folderName, parentId = null) => {
  const params = { folderName, parentId };
  const response = await request.post('/user/createFolder', params)
  return response
}

// 重命名文件或文件夹
export const renameFile = async (id, newName, type) => {
  const params = { id, newName, type };
  const response = await request.post('/user/rename', params)
  return response
}

// 删除文件或文件夹
export const deleteFileOrFolder = async (id, type) => {
  const params = { id, type };
  const response = await request.post('/user/delete', params)
  return response
}

// 上传文件
export const uploadFileToServer = async (file, parentId, onProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const hasParentId = parentId !== null && parentId !== undefined && parentId !== ''
  const url = hasParentId ? `/user/upload?parentId=${encodeURIComponent(parentId)}` : `/user/upload`;
    
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
  const response = await request.post('/user/downloadFromText', { text, folderId }, {
    timeout: 3 * 60 * 60 * 1000
  })
  return response
}

// 移动文件
export const moveFile = async (sourceId, targetId) => {
  const params = { sourceId, targetId };
  const response = await request.post('/user/move', params)
  return response
}

// 解压文件
export const unzipFile = async (fileId) => {
  const response = await request.post('/user/unzip', { fileId })
  return response
}

// 读取文本文件
export const readTextFile = async (id, start = 0, numLines = 50) => {
  const response = await request.post('/user/readTextFile', { id, start, numLines })
  return response
}

// 转换文本文件编码
export const convertTextEncoding = async (id) => {
  const response = await request.post('/user/convertTxtEncoding', { id })
  return response
}

// 转换TS文件为MP4
export const convertFileToMp4 = async (inputFileId, outputFileSuffix = 'mp4') => {
  const response = await request.post('/user/convert', { inputFileId, outputFileSuffix })
  return response
}

// 转换MP4文件为HLS
export const convertToHls = async (id) => {
  const response = await request.post('/media/convertToHls', { id }, {
    timeout: 3 * 60 * 60 * 1000
  })
  return response
}

// iv可选
export const registerUser = async (iv) => {
  const response = await request.post('/user/register', { iv })
  return response
}

export const updateThumbnail = async (id, time) => {
  const response = await request.post('/user/updateThumbnail', { id, time })
  return response
}

export const saveVideoFrame = async (id, time) => {
  const response = await request.post('/user/saveVideoFrame', { id, time })
  return response
}

export const setFolderCover = async (fileId) => {
  const response = await request.post('/user/setFolderCover', { fileId })
  return response
}

export const searchByImage = async (file, folderId = null, topK = 50) => {
  const formData = new FormData()
  formData.append('file', file)
  if (folderId !== null && folderId !== undefined) {
    formData.append('folderId', folderId)
  }
  formData.append('topK', topK)

  const response = await request.post('/user/searchByImage', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    timeout: 5 * 60 * 1000
  })
  return response
}

export const rebuildImageHash = async (max = 200) => {
  const response = await request.post('/user/rebuildImageHash', { max }, {
    timeout: 30 * 60 * 1000
  })
  return response
}
