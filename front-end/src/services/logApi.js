import request from './request'

export const getRequestLogs = (params) => {
  return request.post('/logs/request', params)
}

export const getFileAccessedLogs = (params) => {
  return request.post('/logs/file', params)
}

export const getWsLogs = (params) => {
  return request.post('/logs/ws', params)
}