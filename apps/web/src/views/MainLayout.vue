<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { goBack } from '@/router'
import { useWide } from '@/composables/useBreakpoint'
import { reducedMotion } from '@/lib/motion'
import ChatListPane from '@/components/ChatListPane.vue'
import ChatView from '@/components/ChatView.vue'
import SettingsScreen from '@/components/SettingsScreen.vue'
import NewChatScreen from '@/components/NewChatScreen.vue'
import InvitesScreen from '@/components/InvitesScreen.vue'
import MiniAppDrawer from '@/components/MiniAppDrawer.vue'
import MiniAppOverlay from '@/components/MiniAppOverlay.vue'
import ForwardDialog from '@/components/ForwardDialog.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const wide = useWide()

const routeChatId = computed(() => (route.name === 'chat' ? String(route.params.id) : null))
const leftScreen = computed(() => {
  switch (route.name) {
    case 'settings': return SettingsScreen
    case 'new': return NewChatScreen
    case 'invites': return InvitesScreen
    default: return null
  }
})

// Keep the last chat rendered while the pane slides out on mobile.
const shownChatId = ref<string | null>(routeChatId.value)
watch(routeChatId, (id) => {
  if (id) shownChatId.value = id
  else if (wide.value || reducedMotion()) shownChatId.value = null
})
function onRightTransitionEnd(e: TransitionEvent) {
  if (e.target === e.currentTarget && !routeChatId.value) shownChatId.value = null
}
watch(wide, (w) => { if (w && !routeChatId.value) shownChatId.value = null })

// ---- Swipe right to go back (mobile) --------------------------------------
const rightEl = ref<HTMLElement | null>(null)
const dragX = ref(0)
const dragging = ref(false)
let startX = 0
let startY = 0
let startT = 0
let decided: 'h' | 'v' | null = null

function onPointerDown(e: PointerEvent) {
  if (wide.value || !routeChatId.value || e.pointerType === 'mouse') return
  if ((e.target as HTMLElement).closest('input, textarea, [data-no-swipe]')) return
  startX = e.clientX
  startY = e.clientY
  startT = performance.now()
  decided = null
}
function onPointerMove(e: PointerEvent) {
  if (startT === 0) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (!decided) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
    decided = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.3 ? 'h' : 'v'
    if (decided === 'h') {
      dragging.value = true
      rightEl.value?.setPointerCapture(e.pointerId)
    }
  }
  if (decided === 'h') dragX.value = Math.max(0, dx)
}
function onPointerUp() {
  if (dragging.value) {
    const width = rightEl.value?.clientWidth ?? innerWidth
    const velocity = dragX.value / Math.max(1, performance.now() - startT)
    const shouldClose = dragX.value > width * 0.35 || velocity > 0.6
    dragging.value = false
    if (shouldClose) goBack()
    dragX.value = 0
  }
  startT = 0
  decided = null
}

const rightStyle = computed(() =>
  dragging.value ? { transform: `translate3d(${dragX.value}px,0,0)`, transition: 'none' } : undefined,
)
const leftStyle = computed(() => {
  if (!dragging.value) return undefined
  const p = Math.min(1, dragX.value / (rightEl.value?.clientWidth ?? innerWidth))
  return { transform: `translate3d(${-25 + 25 * p}%,0,0)`, transition: 'none', '--dim': String(1 - p) }
})
</script>

<template>
  <div class="layout" :class="{ 'chat-open': routeChatId, wide }">
    <aside class="pane-left" :style="leftStyle">
      <ChatListPane />
      <Transition name="screen">
        <component :is="leftScreen" v-if="leftScreen" class="left-screen" />
      </Transition>
      <div class="dim" />
    </aside>

    <main
      ref="rightEl"
      class="pane-right"
      :style="rightStyle"
      @transitionend="onRightTransitionEnd"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <ChatView v-if="shownChatId" :key="shownChatId" :chat-id="shownChatId" />
      <div v-else class="empty">
        <div class="empty-card">
          <Icon name="send" :size="40" />
          <p>{{ $t('chat.selectChat') }}</p>
        </div>
      </div>
    </main>

    <MiniAppDrawer />
    <MiniAppOverlay />
    <ForwardDialog />
    <ImageViewer />
  </div>
</template>

<style scoped>
.layout { position: relative; height: 100%; overflow: hidden; background: var(--bg); }

.pane-left {
  position: absolute; inset: 0; background: var(--surface); overflow: hidden;
  transition: transform 0.35s var(--ease-out);
}
.left-screen { position: absolute; inset: 0; z-index: 5; background: var(--surface); }
.dim {
  position: absolute; inset: 0; background: #000; pointer-events: none; z-index: 10;
  opacity: 0; transition: opacity 0.35s var(--ease-out);
}

.pane-right {
  position: absolute; inset: 0; z-index: 20; background: var(--chat-bg);
  transform: translate3d(100%, 0, 0); transition: transform 0.35s var(--ease-out);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12); touch-action: pan-y;
}
.chat-open .pane-right { transform: translate3d(0, 0, 0); }
.chat-open .pane-left { transform: translate3d(-25%, 0, 0); }
.chat-open .dim { opacity: calc(0.25 * var(--dim, 1)); }

.empty { height: 100%; display: grid; place-items: center; }
.empty-card {
  display: grid; justify-items: center; gap: 8px; padding: 16px 24px; border-radius: 16px;
  color: #fff; background: rgba(0, 0, 0, 0.18); backdrop-filter: blur(6px);
}
.empty-card p { margin: 0; }

/* Two-pane layout (tablet / desktop) */
.wide .pane-left {
  right: auto; width: var(--left-width); transform: none !important;
  border-right: 1px solid var(--border);
}
.wide .dim { display: none; }
.wide .pane-right {
  left: var(--left-width); transform: none !important; box-shadow: none; transition: none;
}
@media (min-width: 1280px) {
  .layout { --left-width: 420px; }
}
</style>
