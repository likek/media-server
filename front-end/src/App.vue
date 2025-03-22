<template>
  <div class="app-container">
    <router-view />
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

// 获取当前路由信息
const route = useRoute()
const currentPath = ref('')

// 更新当前路径
const updateCurrentPath = () => {
  if (route.params.path) {
    currentPath.value = Array.isArray(route.params.path) 
      ? route.params.path.join('/') 
      : route.params.path
  } else {
    currentPath.value = ''
  }
}

// 初始化时更新路径
updateCurrentPath()

/**
 * 处理WebSocket更新缓存事件
 * @param {CustomEvent} event 自定义事件对象
 */
const handleWsUpdateCache = (event) => {
  const { dirPath } = event.detail
  
  if (currentPath.value === dirPath) {
    // 当前文件夹更新
    ElMessageBox.confirm('当前文件夹已更新，是否立即刷新?', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      // 这里应该调用loadFiles函数，但App.vue中没有此函数，可能需要从其他组件中引入或发出事件
      // 暂时使用刷新页面的方式
      location.reload()
      ElMessage.success('当前文件夹更新成功')
    }).catch(() => {
      ElMessage.info('已取消刷新')
    })
  } else if (currentPath.value.startsWith(dirPath)) {
    // 父级文件夹更新
    ElMessageBox.confirm('检测到父级文件夹已更新，是否立即刷新?', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      location.reload()
      ElMessage.success('刷新成功')
    }).catch(() => {
      ElMessage.info('已取消刷新')
    })
  } else {
    console.log(`文件夹${dirPath}发生了更新`)
  }
}

// 添加WebSocket更新缓存事件监听
window.addEventListener('ws-update-cache', handleWsUpdateCache)

onBeforeUnmount(() => {
  // 移除WebSocket更新缓存事件监听
  window.removeEventListener('ws-update-cache', handleWsUpdateCache)
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

#app, .app-container {
  height: 100vh;
  width: 100%;
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