import { createRouter, createWebHistory } from 'vue-router'
import FileExplorer from '../views/FileExplorer.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: FileExplorer
  },
  {
    path: '/folder/:id?',
    name: 'folder',
    component: FileExplorer
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router