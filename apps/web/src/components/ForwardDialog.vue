<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useChats } from '@/stores/chats'
import { useMessages } from '@/stores/messages'
import { useUi } from '@/stores/ui'
import Avatar from './Avatar.vue'
import Sheet from './Sheet.vue'

const { t } = useI18n()
const router = useRouter()
const chats = useChats()
const messages = useMessages()
const ui = useUi()
const q = ref('')

const list = computed(() =>
  chats.sorted.filter((c) => !q.value || chats.title(c).toLowerCase().includes(q.value.toLowerCase())),
)

async function pick(chatId: string) {
  const msg = ui.forwarding
  ui.forwarding = null
  if (!msg) return
  try {
    await messages.forward(msg, chatId)
    void router.push({ name: 'chat', params: { id: chatId } })
  } catch {
    ui.toast(t('errors.generic'))
  }
}
</script>

<template>
  <Sheet :open="!!ui.forwarding" :title="$t('menu.forwardTo')" @close="ui.forwarding = null">
    <input v-model="q" class="q" :placeholder="$t('common.search')" />
    <button v-for="c in list" :key="c.id" v-ripple class="list-item" @click="pick(c.id)">
      <Avatar v-bind="chats.avatar(c)" :size="42" />
      <span class="ellipsis">{{ chats.title(c) }}</span>
    </button>
  </Sheet>
</template>

<style scoped>
.q { width: calc(100% - 8px); height: 40px; margin: 0 4px 8px; padding: 0 14px; border-radius: 20px; border: 0; background: var(--surface-2); outline: none; }
</style>
