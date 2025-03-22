import { createRouter, createWebHistory } from 'vue-router'
import FileExplorer from '../views/FileExplorer.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: FileExplorer
  },
  {
    path: '/folder/:path(.*)',
    name: 'Folder',
    component: FileExplorer
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router