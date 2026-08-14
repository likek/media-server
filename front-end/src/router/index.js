import { createRouter, createWebHistory } from 'vue-router'
import { getBackdoorMenuStatus } from '../services/backdoorApi'

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
    redirect: '/favorites/my',
    children: [
      {
        path: 'my',
        name: 'my-favorites',
        component: () => import('../views/FavoritesView.vue')
      },
      {
        path: 'most',
        name: 'most-favorites',
        component: () => import('../views/MostFavoritesView.vue')
      }
    ]
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

router.beforeEach(async (to) => {
  if (!['admin', 'log-manager'].includes(to.name)) {
    return true
  }

  try {
    const response = await getBackdoorMenuStatus()
    if (response?.canRenderHiddenMenus) {
      return true
    }
  } catch (error) {
    console.error('校验隐藏菜单访问权限失败:', error)
  }

  return { name: 'home' }
})

export default router
