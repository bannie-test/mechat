<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { registerSW } from 'virtual:pwa-register'
import { isConfigured } from '@/lib/supabase'
import { useSettings } from '@/stores/settings'
import { useAuth } from '@/stores/auth'
import { useChats } from '@/stores/chats'
import { useMessages } from '@/stores/messages'
import { useRealtime } from '@/stores/realtime'
import { useUi } from '@/stores/ui'
import ToastHost from '@/components/ToastHost.vue'

useSettings()
const auth = useAuth()
const chats = useChats()
const messages = useMessages()
const realtime = useRealtime()
const ui = useUi()
const router = useRouter()
const { t } = useI18n()

// Boot data + realtime whenever a user signs in; tear down on sign-out.
watch(
  () => auth.userId,
  async (id) => {
    if (id) {
      realtime.start(id)
      await Promise.all([chats.loadPeople(), chats.load()]).catch((e) => console.error(e))
    } else {
      if (!auth.ready) return
      realtime.stop()
      chats.reset()
      messages.reset()
      if (router.currentRoute.value.name !== 'login') void router.replace({ name: 'login' })
    }
  },
  { immediate: true },
)

// Unread count on the tab title + installed app icon badge.
watch(
  () => chats.totalUnread,
  (n) => {
    document.title = n ? `(${n}) iemanchat` : 'iemanchat'
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    void (n ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {})
  },
)

onMounted(() => {
  const update = registerSW({
    onNeedRefresh() {
      ui.toast(t('app.updateReady'), { label: t('app.reload'), run: () => void update(true) }, 0)
    },
  })
  // Notification click while the app is open → navigate in-app.
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate' && typeof e.data.url === 'string') void router.push(e.data.url)
  })
})
</script>

<template>
  <div v-if="!isConfigured" class="setup">
    <h2>iemanchat</h2>
    <p>{{ t('app.notConfigured') }}</p>
    <code>VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY</code>
  </div>
  <RouterView v-else />
  <ToastHost />
</template>

<style scoped>
.setup { height: 100%; display: grid; place-content: center; text-align: center; padding: 24px; gap: 8px; }
code { background: var(--surface-2); padding: 6px 10px; border-radius: 8px; }
</style>
