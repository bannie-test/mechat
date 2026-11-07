<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MiniAppHost, PROTOCOL_VERSION } from '@iemanchat/miniapp-sdk/host'
import { config } from '@/config'
import { supabase } from '@/lib/supabase'
import { vibrate } from '@/lib/motion'
import { useAuth } from '@/stores/auth'
import { useMiniApps } from '@/stores/miniapps'
import { useSettings } from '@/stores/settings'
import Icon from './Icon.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const miniapps = useMiniApps()
const settings = useSettings()

const appId = computed(() => (typeof route.query.app === 'string' ? route.query.app : null))
const chatId = computed(() => (typeof route.query.chat === 'string' ? route.query.chat : null))
const app = computed(() => miniapps.byId(appId.value))
const iframe = ref<HTMLIFrameElement | null>(null)
const loading = ref(true)
const failed = ref(false)

const src = computed(() => {
  if (!app.value) return null
  try {
    const u = new URL(app.value.url)
    u.searchParams.set('lang', settings.locale)
    u.searchParams.set('theme', settings.isDark ? 'dark' : 'light')
    return u.toString()
  } catch {
    return null
  }
})

watch(appId, (id) => {
  if (id) {
    loading.value = true
    failed.value = false
    void miniapps.load()
  }
}, { immediate: true })

let host: MiniAppHost | null = null
let readyTimer = 0
function onIframeLoad() {
  host?.destroy()
  const a = app.value
  const el = iframe.value
  if (!a || !el || !auth.session || !auth.profile) return
  const appOrigin = new URL(a.url).origin
  host = new MiniAppHost({
    iframe: el,
    appOrigin,
    getInit: () => ({
      version: PROTOCOL_VERSION,
      appId: a.id,
      user: {
        id: auth.profile!.id, username: auth.profile!.username,
        displayName: auth.profile!.display_name, avatarUrl: auth.profile!.avatar_url,
      },
      locale: settings.locale,
      theme: settings.themeForMiniApp(),
      supabase: { url: config.supabaseUrl, anonKey: config.supabaseAnonKey },
      session: { accessToken: auth.session!.access_token, expiresAt: auth.session!.expires_at ?? 0 },
      chatId: chatId.value,
    }),
    onReady: () => {
      loading.value = false
      window.clearTimeout(readyTimer)
    },
    onClose: close,
    onHaptic: (k) => vibrate(k === 'medium' || k === 'error' ? 25 : 10),
  })
  // Apps that don't use the SDK still show after a moment.
  readyTimer = window.setTimeout(() => (loading.value = false), 2500)
}

// Keep the mini app's token and theme fresh.
const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
  if (s && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) {
    host?.updateSession({ accessToken: s.access_token, expiresAt: s.expires_at ?? 0 })
  }
})
watch(() => settings.isDark, () => setTimeout(() => host?.updateTheme(settings.themeForMiniApp()), 50))
watch(() => settings.locale, (l) => host?.updateLocale(l))

function close() {
  if (window.history.state?.back) router.back()
  else {
    const { app: _a, chat: _c, ...rest } = route.query
    void _a; void _c
    void router.replace({ query: rest })
  }
}

watch(appId, (id) => { if (!id) { host?.destroy(); host = null } })
onBeforeUnmount(() => {
  host?.destroy()
  sub.subscription.unsubscribe()
  window.clearTimeout(readyTimer)
})

const title = computed(() => (app.value ? miniapps.label(app.value, settings.locale) : ''))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="appId" class="backdrop" @click="close" />
    </Transition>
    <Transition name="app">
      <div v-if="appId" class="frame" role="dialog" aria-modal="true">
        <header>
          <button class="icon-btn" :title="$t('common.close')" @click="close"><Icon name="close" /></button>
          <b class="ellipsis">{{ title }}</b>
          <button class="icon-btn" :title="$t('apps.reload')" @click="loading = true; iframe?.contentWindow?.location.replace(src!)"><Icon name="more" /></button>
        </header>
        <div class="body">
          <iframe
            v-if="src" ref="iframe" :key="src" :src="src" :title="title"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            allow="clipboard-write; vibrate; fullscreen"
            @load="onIframeLoad" @error="failed = true"
          />
          <p v-else-if="miniapps.loaded" class="center muted">{{ $t('apps.notFound') }}</p>
          <Transition name="fade">
            <div v-if="loading && src" class="center loading"><span class="spinner" /></div>
          </Transition>
          <p v-if="failed" class="center muted">{{ $t('apps.failed') }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 150; background: var(--overlay); }
.frame {
  position: fixed; inset: 0; z-index: 151; display: flex; flex-direction: column; background: var(--surface);
  padding-top: var(--safe-top); padding-bottom: var(--safe-bottom);
}
header { display: flex; align-items: center; gap: 8px; padding: 4px 8px; min-height: 52px; border-bottom: 1px solid var(--border); }
header b { flex: 1; text-align: center; font-size: 16px; }
.body { position: relative; flex: 1; }
iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--bg); }
.center { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; text-align: center; padding: 24px; }
.loading { background: var(--surface); color: var(--accent); }
.app-enter-active, .app-leave-active { transition: transform 0.35s var(--ease-out), opacity 0.3s; }
.app-enter-from, .app-leave-to { transform: translateY(100%); }

@media (min-width: 900px) {
  .frame {
    inset: auto; left: 50%; top: 50%; width: 420px; height: min(760px, 90vh); transform: translate(-50%, -50%);
    border-radius: 16px; overflow: hidden; box-shadow: var(--shadow-lg); padding: 0;
  }
  .app-enter-from, .app-leave-to { transform: translate(-50%, -45%) scale(0.95); opacity: 0; }
}
</style>
