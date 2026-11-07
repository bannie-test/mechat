import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/stores/auth'

const Main = () => import('@/views/MainLayout.vue')

/**
 * All signed-in routes render MainLayout. It reads the route name to decide what
 * goes into the left pane (list / settings / new chat / invites) and the right pane (chat).
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/', name: 'home', component: Main },
    { path: '/c/:id', name: 'chat', component: Main },
    { path: '/new', name: 'new', component: Main },
    { path: '/settings', name: 'settings', component: Main },
    { path: '/invites', name: 'invites', component: Main },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  await auth.init()
  if (!to.meta.public && !auth.session) return { name: 'login', query: to.query.invite ? { invite: to.query.invite } : undefined }
  if (to.name === 'login' && auth.session) return { name: 'home' }
})

/** Go "back" inside the app, or to home when there is no in-app history (deep link / push). */
export function goBack() {
  if (window.history.state?.back) router.back()
  else void router.replace({ name: 'home' })
}
