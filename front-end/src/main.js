import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
// 导入WebSocket服务
import { connectWebSocket } from './services/websocket'
import { videoMiddlewareInit } from './utils/videoMiddleware.js'
const app = createApp(App)

// 注册所有Element Plus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus)
app.use(router)

// 直接挂载应用，验证逻辑已在App.vue中处理
app.mount('#app')

// 初始化视频中间件
videoMiddlewareInit()