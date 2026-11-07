<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUi } from '@/stores/ui'
import Icon from './Icon.vue'

const ui = useUi()
const zoom = ref(false)
watch(() => ui.viewer, () => (zoom.value = false))

function close() {
  ui.viewer = null
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
watch(() => !!ui.viewer, (o) => (o ? addEventListener('keydown', onKey) : removeEventListener('keydown', onKey)))

// Swipe down to dismiss
const dy = ref(0)
let sy = 0
function down(e: PointerEvent) { sy = e.clientY }
function move(e: PointerEvent) { if (sy && !zoom.value) dy.value = e.clientY - sy }
function up() {
  if (Math.abs(dy.value) > 120) close()
  dy.value = 0
  sy = 0
}
</script>

<template>
  <Teleport to="body">
    <Transition name="viewer">
      <div
        v-if="ui.viewer" class="viewer" :style="{ background: `rgba(0,0,0,${0.92 - Math.min(0.6, Math.abs(dy) / 400)})` }"
        @click.self="close" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"
      >
        <div class="bar">
          <a class="icon-btn" :href="ui.viewer.src" target="_blank" rel="noopener" download><Icon name="download" /></a>
          <button class="icon-btn" @click="close"><Icon name="close" /></button>
        </div>
        <img
          :src="ui.viewer.src" :alt="ui.viewer.alt ?? ''" :class="{ zoom }"
          :style="dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined"
          @click="zoom = !zoom"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.viewer { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; overflow: auto; touch-action: none; }
.bar { position: fixed; top: calc(8px + var(--safe-top)); right: 8px; display: flex; gap: 4px; z-index: 2; }
.bar .icon-btn { color: #fff; background: rgba(255, 255, 255, 0.1); }
img { max-width: 100vw; max-height: 100dvh; object-fit: contain; cursor: zoom-in; transition: transform 0.25s var(--ease-out); }
img.zoom { max-width: none; max-height: none; cursor: zoom-out; }
.viewer-enter-active, .viewer-leave-active { transition: opacity 0.22s; }
.viewer-enter-active img, .viewer-leave-active img { transition: transform 0.28s var(--ease-out); }
.viewer-enter-from, .viewer-leave-to { opacity: 0; }
.viewer-enter-from img, .viewer-leave-to img { transform: scale(0.85); }
</style>
