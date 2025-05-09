<template>
  <div v-if="isVerified">
    <div class="app-container" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
      <side-menu v-show="!isMobile || !isSidebarCollapsed" :is-collapsed="isSidebarCollapsed || isMobile" />
      <div class="main-content">
        <el-button size="small" @click="toggleSidebar" class="sidebar-toggle-btn" :icon="isSidebarCollapsed ? Expand : Fold" circle />
        <router-view />
      </div>
    </div>
  </div>
  <human-verification :loading="loading" v-else-if="!loading" @verification-success="onVerificationSuccess" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElButton } from 'element-plus'
import { Fold, Expand } from '@element-plus/icons-vue'
import SideMenu from './components/SideMenu.vue'
import HumanVerification from './components/HumanVerification.vue'
import { aesDecrypt } from './utils/encrypt'
import { getFingerprint } from './utils/fingerprint'
import { registerUser } from './services/userApi'
import { useRoute } from 'vue-router'

// 验证状态
const isVerified = ref(false)
const loading = ref(true)
const route = useRoute()

// 检查是否已通过人机验证
const checkVerification = async () => {
  try {
    // 获取cookie中的s和fp
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=')
      acc[key] = decodeURIComponent(value)
      return acc
    }, {})
    
    // 如果没有s或fp，则需要验证
    if (!cookies.s || !cookies.fp) {
      console.log('未通过验证, 没有s或fp', cookies)
      isVerified.value = false
      return
    }
    
    // 尝试解密s获取salt
    const salt = aesDecrypt(cookies.s)
    if (!salt) {
      console.log('未通过验证，解密s失败', cookies)
      isVerified.value = false
      return
    }
    
    // 尝试使用salt解密fp
    const trackData = aesDecrypt(cookies.fp, salt)
    if (!trackData) {
      console.log('未通过验证，解密fp失败', cookies)
      isVerified.value = false
      return
    }
    const fp = await getFingerprint()
    isVerified.value = fp === trackData
    if (isVerified.value) {
      // 验证通过时掉用register为了更新用户一些信息(进入信息)
      registerUser(route.query.iv)
    }
  } catch (error) {
    console.error('验证检查失败:', error)
    isVerified.value = false
  }
}

// 验证成功回调
const onVerificationSuccess = () => {
  isVerified.value = true
}

/**
 * 处理WebSocket更新缓存事件
 * @param {CustomEvent} event 自定义事件对象
 */
const handleWsUpdateCache = (event) => {
  
}

// 添加WebSocket更新缓存事件监听
window.addEventListener('ws-update-cache', handleWsUpdateCache)

onBeforeUnmount(() => {
  // 移除WebSocket更新缓存事件监听
  window.removeEventListener('ws-update-cache', handleWsUpdateCache)
  if (mediaQueryList) {
    mediaQueryList.removeEventListener('change', handleResize)
  }
})

const isSidebarCollapsed = ref(false)
const isMobile = ref(false)
let mediaQueryList = null

const checkScreenSize = () => {
  if (window.matchMedia('(max-width: 768px)').matches) {
    isMobile.value = true
    isSidebarCollapsed.value = true // 移动端默认折叠
  } else {
    isMobile.value = false
    isSidebarCollapsed.value = false // 非移动端默认展开
  }
}

const handleResize = (event) => {
  checkScreenSize()
}

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

onMounted(() => {
  checkScreenSize()
  mediaQueryList = window.matchMedia('(max-width: 768px)')
  mediaQueryList.addEventListener('change', handleResize)
  
  // 检查人机验证状态
  checkVerification().finally(() => {
    loading.value = false
  })
})
</script>

<style>
/* 全局样式 */
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
}

#app {
  height: 100vh;
  width: 100%;
}

.app-container {
  display: flex;
  height: 100vh;
  width: 100%;
}

.main-content {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  position: relative; /* For positioning the toggle button */
  transition: margin-left 0.3s ease;
}

.app-container.sidebar-collapsed .main-content {
  margin-left: 0;
}

.sidebar-toggle-btn {
  position: absolute;
  top: 3px;
  left: 3px;
  z-index: 1000;
  padding: 5px 10px;
  background-color: #409eff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

/* Adjust main content margin when sidebar is visible on non-mobile */
@media (min-width: 769px) {
  .main-content {
    /* margin-left: 200px; /* Adjust based on SideMenu width */
  }
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>