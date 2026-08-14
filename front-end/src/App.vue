<template>
   <el-config-provider :locale="zhCn">
    <div class="app-container" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
      <side-menu
        v-show="!isMobile || !isSidebarCollapsed"
        :is-collapsed="isSidebarCollapsed || isMobile"
        :can-render-hidden-menus="backdoorMenuAccessState.canRenderHiddenMenus"
      />
      <div class="main-content">
        <el-button size="small" @click="toggleSidebar" class="sidebar-toggle-btn" :icon="isSidebarCollapsed ? Expand : Fold" circle />
        <!-- <el-button size="small" @click="dialogDonateVisible = true" class="btn-donate">付费</el-button> -->
        <UseDark v-slot="{ isDark, toggleDark }">
          <el-button size="small" @click="toggleDark()" class="sidebar-toggle-dark" :icon="isDark ? Sunny : Moon" circle />
        </UseDark>
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>
        <!-- 自愿捐赠弹窗 -->
        <el-dialog v-model="dialogDonateVisible" title="自愿付费" width="280px">
          <div style="font-size: 14px; color: #666;margin-bottom: 6px;">喜欢该网站的人可以自愿付费23元。</div>
          <!-- <img style="border-radius: 4px;" src="./assets/donate.png" alt="Donate"> -->
        </el-dialog>
      </div>
    </div>
   </el-config-provider>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElButton } from 'element-plus'
import { Expand, Fold, Sunny, Moon } from '@element-plus/icons-vue'
import SideMenu from './components/SideMenu.vue'
import { registerUser } from './services/userApi'
import { useBackdoorMenuAccess } from './composables/useBackdoorMenuAccess'
import { useRoute } from 'vue-router'
import { connectWebSocket } from './services/websocket'
import { UseDark } from '@vueuse/components'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const dialogDonateVisible = ref(false)

const route = useRoute()
const { backdoorMenuAccessState, refreshBackdoorMenuAccess } = useBackdoorMenuAccess()

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

const isSidebarCollapsed = ref(true)
const isMobile = ref(false)
let mediaQueryList = null

const checkScreenSize = () => {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
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

  registerUser(route.query.iv)
    .then(() => {
      refreshBackdoorMenuAccess()
      connectWebSocket()
    })
    .catch((error) => {
      console.error('自动注册失败:', error)
    })
})
</script>

<style>
/* 全局样式 */
html {
  background-color: #fff;
}

html.dark,
html.dark .verification-container {
  background-color: #111;
  color: #ccc;
  --el-text-color-regular: #222;
}

html.dark .path-navigation, 
html.dark .folder-item, 
html.dark .side-menu, 
html.dark .file-item,
html.dark .verification-box {
  background-color: #000;
  border-color: #000;
  color: #999;
}

html.dark .txt-content-wrapper {
  background-color: #111;
}

html.dark .menu-item.active,
html.dark .verification-area,
html.dark .verification-button {
  background-color: #222;
}

@media (any-hover: hover) {
  html.dark .folder-item:hover, 
  html.dark .menu-item:hover {
    background-color: #333;
  }

  html.dark .file-item:hover {
    box-shadow: 0 2px 12px 0 rgba(222, 222, 222, 0.2);
  }

  html.dark .action-icon.is-disabled:hover {
    color: #4c4d4f;
  }
}

html.dark .folder-item:active {
    background-color: #202020;
    transform: translateY(-2px);
    box-shadow: 0 2px 12px 0 rgba(200, 100, 200, 0.1);
}

html.dark .action-icon {
  color: #dcdfe6;
}

html.dark .action-icon.is-disabled {
  color: #4c4d4f;
}

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
}

#app {
  height: 100%;
  width: 100%;
}

.app-container {
  display: flex;
  height: 100%;
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

.sidebar-toggle-dark {
  position: absolute;
  top: 4px;
  right: 10px;
  z-index: 1000;
  padding: 5px 10px;
  background-color: #409eff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-donate {
  position: absolute;
  top: 4px;
  right: 50px;
  z-index: 1000;
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

.newest {
  position: relative;
  overflow: hidden;
}
.newest::after {
    content: 'new';
    position: absolute;
    top: 2px;
    right: -38px;
    z-index: 9;
    text-align: center;
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    transform: rotate(45deg);
    background-color: #409eff;
    width: 100px;
    height: 20px;
    line-height: 20px;
    opacity: 0.5;
}

</style>
