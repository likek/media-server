import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
// 导入WebSocket服务
import { connectWebSocket } from './services/websocket'
import { registerUser } from './services/api'
const app = createApp(App)

// 注册所有Element Plus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus)
app.use(router)
app.mount('#app')

registerUser().then(() => {
  connectWebSocket();
}).catch((error) => {
  console.error('注册失败:', error)
})