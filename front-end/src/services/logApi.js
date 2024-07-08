import request from './request'

export const getRequestLogs = (params) => {
  return request.p('/logs/request', params)
}

export const getFileAccessedLogs = (params) => {
  return request.p('/logs/file', params)
}

export const getWsLogs = (params) => {
  return request.p('/logs/ws', params)
}