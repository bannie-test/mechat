<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { QUICK_REACTIONS } from '@/lib/emoji'
import type { Message } from '@/lib/types'
import Icon from './Icon.vue'

const props = defineProps<{ msg: Message; x: number; y: number; mine: boolean; container: DOMRect }>()
const emit = defineEmits<{ close: []; action: [name: 'reply' | 'copy' | 'edit' | 'forward' | 'delete']; react: [emoji: string] }>()

const el = ref<HTMLElement | null>(null)
const pos = ref({ left: 0, top: 0, origin: 'top left' })

const canEdit = computed(() => props.mine && props.msg.kind === 'text' && !props.msg._status)
const canCopy = computed(() => !!props.msg.content && props.msg.kind !== 'sticker')

onMounted(() => {
  const w = el.value?.offsetWidth ?? 220
  const h = el.value?.offsetHeight ?? 260
  const c = props.container
  let left = props.x - c.left
  let top = props.y - c.top
  let ox = 'left'
  let oy = 'top'
  if (left + w > c.width - 8) { left = Math.max(8, left - w); ox = 'right' }
  if (top + h > c.height - 8) { top = Math.max(8, top - h); oy = 'bottom' }
  pos.value = { left, top, origin: `${oy} ${ox}` }
})
</script>

<template>
  <div class="overlay" @click="emit('close')" @contextmenu.prevent="emit('close')">
    <div
      ref="el" class="menu" :style="{ left: pos.left + 'px', top: pos.top + 'px', transformOrigin: pos.origin }"
      @click.stop
    >
      <div v-if="!msg._status" class="reactions">
        <button v-for="(e, i) in QUICK_REACTIONS" :key="e" class="react" :style="{ animationDelay: i * 25 + 'ms' }" @click="emit('react', e)">{{ e }}</button>
      </div>
      <div class="actions">
        <button v-if="!msg._status" v-ripple @click="emit('action', 'reply')"><Icon name="reply" :size="20" />{{ $t('menu.reply') }}</button>
        <button v-if="canCopy" v-ripple @click="emit('action', 'copy')"><Icon name="copy" :size="20" />{{ $t('menu.copy') }}</button>
        <button v-if="canEdit" v-ripple @click="emit('action', 'edit')"><Icon name="edit" :size="20" />{{ $t('menu.edit') }}</button>
        <button v-if="!msg._status && msg.kind !== 'call'" v-ripple @click="emit('action', 'forward')"><Icon name="forward" :size="20" />{{ $t('menu.forward') }}</button>
        <button v-if="mine" v-ripple class="danger" @click="emit('action', 'delete')"><Icon name="trash" :size="20" />{{ $t('menu.delete') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute; inset: 0; z-index: 30; background: rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: fade-in 0.18s ease;
}
@keyframes fade-in { from { opacity: 0; } }
.menu { position: absolute; z-index: 32; display: grid; gap: 8px; width: max-content; animation: menu-in 0.22s var(--ease-out); }
@keyframes menu-in { from { transform: scale(0.6); opacity: 0; } }
.reactions {
  display: flex; gap: 2px; padding: 4px 6px; border-radius: 26px; background: var(--surface); box-shadow: var(--shadow-lg);
  max-width: calc(100vw - 32px); overflow-x: auto; scrollbar-width: none;
}
.react { font-size: 26px; width: 40px; height: 40px; border-radius: 50%; transition: transform 0.15s var(--ease-out); animation: react-in 0.3s var(--ease-out) backwards; }
.react:hover { transform: scale(1.25); }
@keyframes react-in { from { transform: scale(0); } }
.actions { display: grid; min-width: 200px; padding: 6px; border-radius: 14px; background: var(--surface); box-shadow: var(--shadow-lg); justify-self: start; }
.actions button { display: flex; align-items: center; gap: 14px; padding: 9px 12px; border-radius: 8px; text-align: left; font-weight: 500; }
.actions button:hover { background: var(--hover); }
.actions .danger { color: var(--danger); }
</style>
