<template>
  <div class="verification-container">
    <div class="verification-box">
      <h2>人机验证</h2>
      <p>请完成以下验证以继续访问</p>
      
      <div class="verification-area" 
           ref="verificationArea"
           @mousemove="trackMouseMovement"
           @mousedown="startVerification"
           @mouseup="completeVerification"
           @touchstart="startTouchVerification"
           @touchmove="trackTouchMovement"
           @touchend="completeTouchVerification">
        <div class="verification-button" :class="{ 'active': isVerifying }">
          {{ isVerifying ? '松开完成验证' : '按住并左右滑动' }}
        </div>
      </div>
      
      <div class="verification-status" v-if="verificationMessage">
        {{ verificationMessage }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { registerUser } from '../services/userApi'
import { aesEncrypt } from '../utils/encrypt'
import { connectWebSocket } from '../services/websocket'

const emit = defineEmits(['verification-success'])

const verificationArea = ref(null)
const isVerifying = ref(false)
const verificationMessage = ref('')
const verificationStartTime = ref(0)

// 鼠标移动轨迹数据
const mouseTrack = reactive({
  points: [],
  startTime: 0,
  endTime: 0
})

// 开始验证
const startVerification = (event) => {
  isVerifying.value = true
  verificationMessage.value = ''
  mouseTrack.points = []
  mouseTrack.startTime = Date.now()
  verificationStartTime.value = Date.now()
  trackMouseMovement(event)
}

// 跟踪鼠标移动
const trackMouseMovement = (event) => {
  if (!isVerifying.value) return
  
  mouseTrack.points.push({
    x: event.clientX,
    y: event.clientY,
    t: Date.now() - mouseTrack.startTime
  })
}

// 完成验证
const completeVerification = () => {
  if (!isVerifying.value) return
  
  mouseTrack.endTime = Date.now()
  isVerifying.value = false
  
  // 验证时间太短，可能是机器人
  const verificationTime = Date.now() - verificationStartTime.value
  if (verificationTime < 500) {
    verificationMessage.value = '验证失败，请重试'
    return
  }
  
  // 检查轨迹点数量，太少可能是机器人
  if (mouseTrack.points.length < 5) {
    verificationMessage.value = '验证失败，请重试'
    return
  }
  
  // 计算轨迹复杂度，太简单可能是机器人
  const complexity = calculateTrackComplexity(mouseTrack.points)
  if (complexity < 0.1) {
    verificationMessage.value = '验证失败，请重试'
    return
  }
  
  // 验证通过，调用注册接口
  verificationMessage.value = '验证中...'
  submitVerification()
}

// 计算轨迹复杂度
const calculateTrackComplexity = (points) => {
  if (points.length < 3) return 0
  
  // 简单计算轨迹的变化程度
  let changes = 0
  for (let i = 2; i < points.length; i++) {
    const dx1 = points[i-1].x - points[i-2].x
    const dy1 = points[i-1].y - points[i-2].y
    const dx2 = points[i].x - points[i-1].x
    const dy2 = points[i].y - points[i-1].y
    
    // 方向变化
    if (Math.sign(dx1) !== Math.sign(dx2) || Math.sign(dy1) !== Math.sign(dy2)) {
      changes++
    }
  }
  
  return changes / (points.length - 2)
}

// 提交验证
const submitVerification = async () => {
  try {
    // 将轨迹数据加密存储到cookie
    const trackData = {
      points: mouseTrack.points,
      time: mouseTrack.endTime - mouseTrack.startTime,
      timestamp: Date.now()
    }
    
    // 调用注册接口
    await registerUser()
    
    // 连接WebSocket
    connectWebSocket()
    
    verificationMessage.value = '验证成功'
    emit('verification-success')
  } catch (error) {
    console.error('验证失败:', error)
    verificationMessage.value = '验证失败，请重试'
  }
}

// 触摸事件处理
const startTouchVerification = (event) => {
  isVerifying.value = true
  verificationMessage.value = ''
  mouseTrack.points = []
  mouseTrack.startTime = Date.now()
  verificationStartTime.value = Date.now()
  trackTouchMovement(event)
}

const trackTouchMovement = (event) => {
  if (!isVerifying.value || !event.touches[0]) return
  
  mouseTrack.points.push({
    x: event.touches[0].clientX,
    y: event.touches[0].clientY,
    t: Date.now() - mouseTrack.startTime
  })
}

const completeTouchVerification = () => {
  completeVerification()
}
</script>

<style scoped>
.verification-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 9999;
}

.verification-box {
  background-color: white;
  border-radius: 8px;
  padding: 20px;
  width: 80%;
  max-width: 400px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  text-align: center;
}

.verification-area {
  margin: 20px 0;
  height: 50px;
  background-color: #f5f7fa;
  border-radius: 25px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.verification-button {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #e6e6e6;
  border-radius: 25px;
  transition: all 0.3s;
  user-select: none;
}

.verification-button.active {
  background-color: #409eff;
  color: white;
}

.verification-status {
  margin-top: 10px;
  font-size: 14px;
  color: #606266;
}
</style>