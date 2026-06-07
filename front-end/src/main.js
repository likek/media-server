import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
// 按需导入Element Plus图标
import { 
  Refresh,
  FolderAdd,
  UploadFilled,
  Link,
  HomeFilled,
  Folder,
  Star,
  StarFilled,
  User,
  Tickets,
  Expand,
  Fold,
  VideoCamera,
  Picture,
  Collection,
  Reading,
  Microphone,
  Document,
  View,
  FolderOpened,
  VideoPlay,
  Edit,
  Position,
  Delete,
  Loading,
  Switch,
  Histogram,
  Filter,
  RefreshRight,
  Search,
  FolderChecked,
  List
} from '@element-plus/icons-vue'

import { videoMiddlewareInit } from './utils/videoMiddleware.js'
const app = createApp(App)

// 注册使用到的Element Plus图标
const icons = [
  Refresh,
  FolderAdd,
  UploadFilled,
  Link,
  HomeFilled,
  Folder,
  Star,
  StarFilled,
  User,
  Tickets,
  Expand,
  Fold,
  VideoCamera,
  Picture,
  Collection,
  Reading,
  Microphone,
  Document,
  View,
  FolderOpened,
  VideoPlay,
  Edit,
  Position,
  Delete,
  Loading,
  Switch,
  Histogram,
  Filter,
  RefreshRight,
  Search,
  FolderChecked,
  List
]

icons.forEach(icon => {
  app.component(icon.name, icon)
})

app.use(router)

// 初始化视频中间件
videoMiddlewareInit()

async function bootstrap() {
  app.mount('#app')
}

bootstrap()
