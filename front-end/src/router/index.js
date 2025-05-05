import { createRouter, createWebHistory } from 'vue-router'
import FileExplorer from '../views/FileExplorer.vue'
import FavoritesView from '../views/FavoritesView.vue'
import AdminView from '../views/AdminView.vue'

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
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: FavoritesView
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router