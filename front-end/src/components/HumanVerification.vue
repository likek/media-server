<template>
  <div class="verification-container">
    <div class="verification-box">
      <h2>人机验证</h2>
      <p>长按下方按钮以继续访问</p>
      
      <div
        class="verification-area"
        @pointerdown="startVerification"
        @pointerup="cancelVerification"
        @pointerleave="cancelVerification"
        @pointercancel="cancelVerification"
      >
        <div class="verification-progress" :style="{ width: `${progress}%` }"></div>
        <div class="verification-button" :class="{ active: isVerifying, success: isSubmitting }">
          {{ buttonText }}
        </div>
      </div>
      
      <div class="verification-status" v-if="verificationMessage">
        {{ verificationMessage }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { registerUser } from '../services/userApi'
import { connectWebSocket } from '../services/websocket'
import { useRoute } from 'vue-router'

const emit = defineEmits(['verification-success'])
const route = useRoute()

const isVerifying = ref(false)
const isSubmitting = ref(false)
const verificationMessage = ref('')
const progress = ref(0)
const HOLD_DURATION = 1200
const PROGRESS_INTERVAL = 16

let holdStartTime = 0
let progressTimer = null
let holdTimer = null

const buttonText = computed(() => {
  if (isSubmitting.value) return '验证中...'
  if (isVerifying.value) return '继续长按即可通过'
  return '按住 1.2 秒完成验证'
})

const resetHoldState = () => {
  isVerifying.value = false
  progress.value = 0
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }
}

const startVerification = (event) => {
  if (isSubmitting.value || isVerifying.value) return

  event.preventDefault()
  verificationMessage.value = ''
  isVerifying.value = true
  holdStartTime = Date.now()

  progressTimer = setInterval(() => {
    const elapsed = Date.now() - holdStartTime
    progress.value = Math.min(100, Math.round((elapsed / HOLD_DURATION) * 100))
  }, PROGRESS_INTERVAL)

  holdTimer = setTimeout(() => {
    resetHoldState()
    progress.value = 100
    submitVerification()
  }, HOLD_DURATION)
}

const cancelVerification = () => {
  if (!isVerifying.value || isSubmitting.value) return
  resetHoldState()
}

// 提交验证
const submitVerification = async () => {
  try {
    isSubmitting.value = true
    verificationMessage.value = '验证中...'

    // 调用注册接口, 传入url上的参数iv
    const iv = route.query.iv
    await registerUser(iv)
    
    // 连接WebSocket
    connectWebSocket()
    
    verificationMessage.value = '验证成功'
    emit('verification-success')
  } catch (error) {
    console.error('验证失败:', error)
    verificationMessage.value = '验证失败，请重试'
    progress.value = 0
  } finally {
    isSubmitting.value = false
  }
}

onBeforeUnmount(() => {
  resetHoldState()
})
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
  user-select: none;
  touch-action: none;
}

.verification-progress {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 0;
  background: linear-gradient(90deg, #67c23a, #95d475);
  transition: width 0.05s linear;
}

.verification-button {
  position: relative;
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

.verification-button.success {
  background-color: #67c23a;
  color: white;
}

.verification-status {
  margin-top: 10px;
  font-size: 14px;
  color: #606266;
}
</style>
