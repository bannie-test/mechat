<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuth } from '@/stores/auth'
import { useChats } from '@/stores/chats'
import { useRealtime } from '@/stores/realtime'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'

const props = defineProps<{ exclude?: string[] }>()
const model = defineModel<string[]>({ default: () => [] })

const auth = useAuth()
const chats = useChats()
const realtime = useRealtime()
const q = ref('')

const people = computed(() =>
  Object.values(chats.people)
    .filter((p) => p.id !== auth.userId && !props.exclude?.includes(p.id))
    .filter((p) => !q.value || (p.display_name + ' ' + p.username).toLowerCase().includes(q.value.toLowerCase()))
    .sort((a, b) => a.display_name.localeCompare(b.display_name)),
)

function toggle(id: string) {
  model.value = model.value.includes(id) ? model.value.filter((x) => x !== id) : [...model.value, id]
}
</script>

<template>
  <div class="picker">
    <input v-model="q" class="q" :placeholder="$t('common.search')" />
    <TransitionGroup v-if="model.length" name="pop" tag="div" class="chips">
      <button v-for="id in model" :key="id" class="chip" @click="toggle(id)">
        <Avatar :id="id" :name="chats.people[id]?.display_name ?? ''" :url="chats.people[id]?.avatar_url" :size="24" />
        {{ chats.people[id]?.display_name }} <Icon name="close" :size="14" />
      </button>
    </TransitionGroup>
    <button v-for="p in people" :key="p.id" v-ripple class="list-item" @click="toggle(p.id)">
      <Avatar :id="p.id" :name="p.display_name" :url="p.avatar_url" :size="42" :online="realtime.online.has(p.id)" />
      <span class="col">
        <span class="ellipsis">{{ p.display_name }}</span>
        <small class="muted">@{{ p.username }}</small>
      </span>
      <span class="check" :class="{ on: model.includes(p.id) }"><Icon name="check" :size="16" /></span>
    </button>
    <p v-if="!people.length" class="muted empty">{{ $t('newChat.nobody') }}</p>
  </div>
</template>

<style scoped>
.picker { display: grid; gap: 2px; }
.q { height: 40px; margin: 0 4px 6px; padding: 0 14px; border-radius: 20px; border: 0; background: var(--surface-2); outline: none; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 4px 6px; }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px 0 3px; border-radius: 15px; background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); font-size: 14px; }
.col { flex: 1; min-width: 0; display: grid; text-align: left; }
.check { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--text-muted); display: grid; place-items: center; color: transparent; transition: 0.15s; }
.check.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); transform: scale(1.05); }
.empty { text-align: center; padding: 16px; }
</style>
