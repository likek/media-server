<template>
  <div class="app-container">
    <router-view />
  </div>
</template>

<script setup>
import { onBeforeUnmount } from 'vue'
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