import { ElMessage } from 'element-plus'
import { getEncryptedFingerprint } from '../utils/fingerprint'

let ws = null
let reconnectInterval = 3000
let reconnectTimer = null
let fingerprintInfo = null

/**
 * 连接WebSocket服务器
 * @returns {WebSocket} WebSocket实例
 */
export function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('WebSocket已连接')
    return ws
  }
  if (ws) {
    ws.close()
  }

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  
  // 获取指纹信息
  getEncryptedFingerprint().then(info => {
    fingerprintInfo = info
    
    // 在URL中添加salt参数
    const url = new URL(`${protocol}://${location.host}`)
    url.searchParams.append('s', info.encryptedSalt)
    url.searchParams.append('fp', info.encryptedFingerprint)
    
    // 创建WebSocket连接
    ws = new WebSocket(url.toString())
    
    // 连接建立后设置指纹信息
    ws.onopen = function() {
      clearInterval(reconnectTimer)
      
      // 发送指纹信息
      sendWebSocketMessage({
        event: 'setFingerprint'
      })
      
      // 尝试获取地理位置并发送到服务器
      if (typeof navigator.geolocation?.getCurrentPosition === 'function') {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const latitude = position.coords.latitude
            const longitude = position.coords.longitude
            const accuracy = position.coords.accuracy
            sendWebSocketMessage({
              event: 'location',
              data: {
                latitude,
                longitude,
                accuracy
              }
            })
          },
          (error) => {
            console.error('获取地理位置时出错:', error)
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        )
      }
    }
    
    ws.onmessage = function(event) {
      let data = {}
      try {
        data = JSON.parse(event.data)
      } catch (e) {
        console.error('消息解析错误:', e, event.data)
        return
      }
  
      // 处理不同类型的消息
      switch (data.event) {
        case 'downloadProgress':
          console.log('下载进度:', data)
          ElMessage({
            message: `第${data.data.progress}个资源提取${data.data.state === 'failed' ? '失败' : '成功'}`,
            type: data.data.state === 'failed' ? 'warning' : 'success'
          })
          break

        case 'rebuildImageIndexProgress':
          console.log('重建图片索引:', data)
          if (data.data?.state === 'start') {
            ElMessage({
              message: `开始重建图片索引，共${data.data.total}张`,
              type: 'info'
            })
          } else if (data.data?.state === 'progress') {
            ElMessage({
              message: `重建图片索引进度 ${data.data.progress}/${data.data.total}`,
              type: 'info'
            })
          } else if (data.data?.state === 'item' && data.data?.level === 'warning') {
            ElMessage({
              message: `索引警告: ${data.data.message}`,
              type: 'warning'
            })
          } else if (data.data?.state === 'done') {
            ElMessage({
              message: `重建图片索引完成，共${data.data.total}张`,
              type: 'success'
            })
          }
          break
          
        case 'updateCache':
          // 发布更新缓存事件，让组件自行处理
          const updateCacheEvent = new CustomEvent('ws-update-cache', { 
            detail: data.data 
          })
          window.dispatchEvent(updateCacheEvent)
          console.log(`文件夹${data.data.dirPath}发生了更新`)
          break
          
        default:
          console.warn('未知消息类型:', data.event, data.data)
      }
    }
  
    ws.onclose = function(event) {
      console.log('WebSocket连接已关闭:', event)
      startReconnectTimer()
    }
  
    ws.onerror = function(error) {
      console.error('WebSocket错误:', error)
    }
  })
  
  return ws
}

/**
 * 开始重连计时器
 */
function startReconnectTimer() {
  clearInterval(reconnectTimer)
  reconnectTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('WebSocket未连接，尝试重新连接...')
      connectWebSocket()
    }
  }, reconnectInterval)
}

/**
 * 发送WebSocket消息
 * @param {Object} message 要发送的消息对象
 * @returns {boolean} 是否发送成功
 */
export function sendWebSocketMessage(message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log('WebSocket未连接，尝试重新连接...')
    connectWebSocket()
    return false
  }
  
  try {
    ws.send(JSON.stringify(message))
    return true
  } catch (error) {
    console.error('发送WebSocket消息失败:', error)
    return false
  }
}

/**
 * 关闭WebSocket连接
 */
export function closeWebSocketConnection() {
  if (ws) {
    ws.close()
    ws = null
  }
  
  if (reconnectTimer) {
    clearInterval(reconnectTimer)
    reconnectTimer = null
  }
}
