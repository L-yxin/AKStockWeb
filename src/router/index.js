import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../components/home.vue')
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../components/Settings.vue')
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminPanel.vue')
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
