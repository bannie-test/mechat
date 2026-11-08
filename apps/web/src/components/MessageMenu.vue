<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { messageActions, type MessageAction } from '@/lib/messageActions'
import type { Message } from '@/lib/types'
import { useSettings } from '@/stores/settings'
import EmojiGrid from './EmojiGrid.vue'
import Icon from './Icon.vue'

const props = defineProps<{ msg: Message; x: number; y: number; mine: boolean; container: DOMRect; emojiGrid?: boolean }>()
const emit = defineEmits<{ close: []; action: [name: MessageAction]; react: [emoji: string] }>()

const settings = useSettings()
const el = ref<HTMLElement | null>(null)
const pos = ref({ left: 0, top: 0, origin: 'top left' })
const actions = computed(() => messageActions(props.msg, props.mine))
const more = ref(!!props.emojiGrid)

function place() {
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
}
onMounted(place)

async function showMore() {
  more.value = true
  await nextTick()
  place()
}
</script>

<template>
  <!-- Siblings, not nested: the overlay is its own stacking context, so a menu inside it would sit
       below the lifted message bubble (z 31) and the bubble would cover the reactions. -->
  <div class="overlay" @click="emit('close')" @contextmenu.prevent="emit('close')" />
  <div
    ref="el" class="menu" :style="{ left: pos.left + 'px', top: pos.top + 'px', transformOrigin: pos.origin }"
    @contextmenu.prevent
  >
    <template v-if="!msg._status">
      <EmojiGrid v-if="more" @pick="emit('react', $event)" />
      <div v-else class="reactions">
        <button
          v-for="(e, i) in settings.quickReactions" :key="e" class="react" :style="{ animationDelay: i * 25 + 'ms' }"
          @click="emit('react', e)"
        >{{ e }}</button>
        <button class="react plus" :style="{ animationDelay: '125ms' }" :title="$t('menu.moreReactions')" @click="showMore"><Icon name="plus" :size="22" /></button>
      </div>
    </template>
    <div v-if="!more" class="actions">
      <button v-for="a in actions" :key="a.name" v-ripple :class="{ danger: a.danger }" @click="emit('action', a.name)">
        <Icon :name="a.icon" :size="20" />{{ $t(`menu.${a.name}`) }}
      </button>
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
.react.plus { display: grid; place-items: center; color: var(--text-muted); background: var(--surface-2); }
.react.plus:hover { transform: scale(1.1); color: var(--accent); }
@keyframes react-in { from { transform: scale(0); } }
.actions { display: grid; min-width: 200px; padding: 6px; border-radius: 14px; background: var(--surface); box-shadow: var(--shadow-lg); justify-self: start; }
.actions button { display: flex; align-items: center; gap: 14px; padding: 9px 12px; border-radius: 8px; text-align: left; font-weight: 500; }
.actions button:hover { background: var(--hover); }
.actions .danger { color: var(--danger); }
</style>
