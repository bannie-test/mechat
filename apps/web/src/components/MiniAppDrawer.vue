<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMiniApps } from '@/stores/miniapps'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import type { MiniApp } from '@/lib/types'
import Sheet from './Sheet.vue'

const route = useRoute()
const router = useRouter()
const ui = useUi()
const miniapps = useMiniApps()
const settings = useSettings()

watch(() => ui.appDrawerOpen, (o) => { if (o) void miniapps.load(true) })

function open(app: MiniApp) {
  ui.appDrawerOpen = false
  const query: Record<string, string> = { ...(route.query as Record<string, string>), app: app.id }
  if (ui.appDrawerChatId) query.chat = ui.appDrawerChatId
  void router.push({ query })
}

const isUrl = (s: string | null) => !!s && /^https?:\/\//.test(s)
</script>

<template>
  <Sheet :open="ui.appDrawerOpen" :title="$t('apps.title')" @close="ui.appDrawerOpen = false">
    <div v-if="miniapps.apps.length" class="grid">
      <button v-for="(a, i) in miniapps.apps" :key="a.id" v-ripple class="app" :style="{ animationDelay: i * 40 + 'ms' }" @click="open(a)">
        <span class="icon">
          <img v-if="isUrl(a.icon)" :src="a.icon!" alt="" />
          <template v-else>{{ a.icon || '🧩' }}</template>
        </span>
        <b class="ellipsis">{{ miniapps.label(a, settings.locale) }}</b>
        <small class="muted">{{ miniapps.describe(a, settings.locale) }}</small>
      </button>
    </div>
    <p v-else-if="miniapps.loaded" class="muted empty">{{ $t('apps.empty') }}</p>
    <div v-else class="empty"><span class="spinner" /></div>
  </Sheet>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; padding: 4px 4px 12px; }
.app { display: grid; justify-items: center; gap: 4px; padding: 14px 8px; border-radius: 14px; text-align: center; animation: app-in 0.35s var(--ease-out) backwards; }
.app:hover { background: var(--hover); }
@keyframes app-in { from { transform: translateY(14px) scale(0.9); opacity: 0; } }
.icon { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; font-size: 36px; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 25%, transparent), color-mix(in srgb, var(--accent) 8%, transparent)); overflow: hidden; }
.icon img { width: 100%; height: 100%; object-fit: cover; }
b { max-width: 100%; }
small { font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.empty { text-align: center; padding: 24px; display: grid; place-items: center; }
</style>
