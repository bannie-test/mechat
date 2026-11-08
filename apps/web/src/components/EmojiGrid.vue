<script setup lang="ts">
/** Compact scrollable grid of all emoji, for picking a reaction. */
import { EMOJI_GROUPS } from '@/lib/emoji'

defineProps<{ selected?: string }>()
const emit = defineEmits<{ pick: [e: string] }>()
</script>

<template>
  <div class="egrid scroll" @contextmenu.prevent>
    <template v-for="g in EMOJI_GROUPS" :key="g.key">
      <div class="g">{{ $t(`emoji.${g.key}`) }}</div>
      <div class="cells">
        <button v-for="e in g.list" :key="e" :class="{ on: e === selected }" @click.stop="emit('pick', e)">{{ e }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.egrid { width: 300px; max-width: calc(100vw - 32px); max-height: 260px; padding: 4px 8px 8px; border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-lg); }
.g { position: sticky; top: 0; z-index: 1; padding: 6px 2px 4px; font-size: 12px; font-weight: 600; color: var(--text-muted); background: var(--surface); }
.cells { display: grid; grid-template-columns: repeat(8, 1fr); }
.cells button { aspect-ratio: 1; font-size: 22px; border-radius: 8px; transition: transform 0.12s; }
.cells button:hover { background: var(--hover); transform: scale(1.15); }
.cells button.on { background: color-mix(in srgb, var(--accent) 22%, transparent); }
</style>
