import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
// 导入WebSocket服务
import { videoMiddlewareInit } from './utils/videoMiddleware.js'
const app = createApp(App)

// 注册所有Element Plus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(router)


// 初始化视频中间件
videoMiddlewareInit()

async function bootstrap() {
  app.mount('#app')
}

bootstrap()