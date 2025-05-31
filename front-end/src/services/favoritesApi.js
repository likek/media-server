import request from "./request"

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

// 获取我的收藏列表
export const getFavoritesList = async (page = 0, pageSize = 20) => {
  const response = await request.post('/favorites/list', { page, pageSize })
  return response // 返回包含files和total的结构
}

// 获取最多收藏列表
export const getMostFavoritesList = async (page = 0, pageSize = 20) => {
  const response = await request.post('/favorites/most', { page, pageSize })
  return response // 返回包含files和total的结构
}