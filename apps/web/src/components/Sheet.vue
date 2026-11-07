<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import Icon from './Icon.vue'

const props = defineProps<{ open: boolean; title?: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
watch(() => props.open, (o) => {
  if (o) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Drag the handle down to dismiss (mobile).
let startY = 0
let el: HTMLElement | null = null
function down(e: PointerEvent) {
  el = (e.currentTarget as HTMLElement).closest('.sheet')
  startY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) {
  if (!el || !startY) return
  const dy = Math.max(0, e.clientY - startY)
  el.style.transition = 'none'
  el.style.transform = `translateY(${dy}px)`
}
function up(e: PointerEvent) {
  if (!el) return
  const dy = e.clientY - startY
  el.style.transition = ''
  el.style.transform = ''
  startY = 0
  if (dy > 90) emit('close')
  el = null
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="backdrop" @click="emit('close')" />
    </Transition>
    <Transition name="sheet-pop">
      <div v-if="open" class="sheet" :class="{ wide }" role="dialog" aria-modal="true">
        <div class="handle" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"><i /></div>
        <header v-if="title || $slots.header" class="sheet-head">
          <slot name="header"><h3>{{ title }}</h3></slot>
          <button class="icon-btn" @click="emit('close')"><Icon name="close" /></button>
        </header>
        <div class="sheet-body scroll"><slot /></div>
        <slot name="footer" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 100; background: var(--overlay); }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 101; max-height: 88dvh; display: flex; flex-direction: column;
  background: var(--surface); border-radius: 18px 18px 0 0; box-shadow: var(--shadow-lg);
  padding-bottom: var(--safe-bottom); transition: transform 0.3s var(--ease-out);
}
.handle { display: grid; place-items: center; height: 20px; cursor: grab; touch-action: none; flex: none; }
.handle i { width: 36px; height: 4px; border-radius: 2px; background: var(--border); background: var(--text-muted); opacity: 0.4; }
.sheet-head { display: flex; align-items: center; gap: 8px; padding: 0 8px 4px 20px; flex: none; }
.sheet-head h3 { flex: 1; margin: 0; font-size: 18px; }
.sheet-body { flex: 1; padding: 0 8px 12px; }

.sheet-pop-enter-active, .sheet-pop-leave-active { transition: transform 0.32s var(--ease-out), opacity 0.25s; }
.sheet-pop-enter-from, .sheet-pop-leave-to { transform: translateY(100%); }

@media (min-width: 900px) {
  .sheet {
    left: 50%; top: 50%; bottom: auto; right: auto; width: 440px; max-height: min(720px, 86vh);
    transform: translate(-50%, -50%); border-radius: 16px; padding-bottom: 0;
  }
  .sheet.wide { width: 560px; }
  .handle { visibility: hidden; height: 12px; }
  .sheet-pop-enter-from, .sheet-pop-leave-to { transform: translate(-50%, -46%) scale(0.96); opacity: 0; }
}
</style>
