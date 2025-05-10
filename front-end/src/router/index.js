import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/FileExplorer.vue')
  },
  {
    path: '/folder/:id?',
    name: 'folder',
    component: () => import('../views/FileExplorer.vue')
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: () => import('../views/FavoritesView.vue')
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminView.vue')
  },
  {
    path: '/log-manager',
    name: 'log-manager',
    component: () => import('../views/LogManagerView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router