<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { formatTime } from '@/lib/format'
import { uploadAvatar } from '@/lib/storage'
import type { ChatSummary } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { useChats } from '@/stores/chats'
import { useRealtime } from '@/stores/realtime'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import PeoplePicker from './PeoplePicker.vue'
import Sheet from './Sheet.vue'

const props = defineProps<{ open: boolean; chat: ChatSummary }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const router = useRouter()
const auth = useAuth()
const chats = useChats()
const realtime = useRealtime()
const settings = useSettings()
const ui = useUi()

const peer = computed(() => chats.people[props.chat.peer_id ?? ''])
const memberList = computed(() =>
  (chats.members[props.chat.id] ?? [])
    .map((m) => ({ ...m, profile: chats.people[m.user_id] }))
    .filter((m) => m.profile)
    .sort((a, b) => Number(realtime.online.has(b.user_id)) - Number(realtime.online.has(a.user_id))),
)

const renaming = ref(false)
const newTitle = ref('')
const adding = ref(false)
const picked = ref<string[]>([])

function lastSeen(id: string) {
  if (realtime.online.has(id)) return t('chat.online')
  const s = chats.people[id]?.last_seen_at
  return s ? t('chat.lastSeenAt', { time: formatTime(s, settings.locale) }) : t('chat.lastSeenRecently')
}

async function saveTitle() {
  const v = newTitle.value.trim()
  renaming.value = false
  if (v && v !== props.chat.title) await chats.updateGroup(props.chat.id, { title: v }).catch(() => ui.toast(t('errors.generic')))
}

async function pickAvatar(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f || !auth.userId) return
  try {
    const url = await uploadAvatar(auth.userId, f)
    await chats.updateGroup(props.chat.id, { avatar_url: url })
  } catch {
    ui.toast(t('errors.generic'))
  }
}

async function addPicked() {
  if (!picked.value.length) return
  await chats.addMembers(props.chat.id, picked.value).catch(() => ui.toast(t('errors.generic')))
  picked.value = []
  adding.value = false
}

async function leave() {
  if (!confirm(t('chatInfo.confirmLeave'))) return
  await chats.leave(props.chat.id)
  emit('close')
  void router.replace({ name: 'home' })
}

async function openMember(id: string) {
  if (id === auth.userId) return
  const chatId = await chats.openDirect(id)
  emit('close')
  void router.push({ name: 'chat', params: { id: chatId } })
}
</script>

<template>
  <Sheet :open="open" @close="emit('close')">
    <div class="hero">
      <label v-if="chat.type === 'group'" class="avatar-pick">
        <Avatar v-bind="chats.avatar(chat)" :size="96" />
        <span class="cam"><Icon name="camera" :size="20" /></span>
        <input type="file" accept="image/*" hidden @change="pickAvatar" />
      </label>
      <Avatar v-else v-bind="chats.avatar(chat)" :size="96" :online="realtime.online.has(chat.peer_id ?? '')" />

      <template v-if="renaming">
        <input v-model="newTitle" class="rename" maxlength="64" autofocus @keydown.enter="saveTitle" @blur="saveTitle" />
      </template>
      <h2 v-else @click="chat.type === 'group' && ((renaming = true), (newTitle = chat.title ?? ''))">
        {{ chats.title(chat) }}
        <Icon v-if="chat.type === 'group'" name="edit" :size="16" class="muted" />
      </h2>
      <p class="muted">
        {{ chat.type === 'group' ? $t('chat.members', { n: chat.member_count }) : lastSeen(chat.peer_id ?? '') }}
      </p>
    </div>

    <div v-if="chat.type === 'direct' && peer" class="card">
      <div class="kv"><small class="muted">{{ $t('settings.username') }}</small><span>@{{ peer.username }}</span></div>
      <div v-if="peer.bio" class="kv"><small class="muted">{{ $t('settings.bio') }}</small><span>{{ peer.bio }}</span></div>
    </div>

    <div class="card">
      <label class="list-item toggle">
        <Icon :name="chat.muted ? 'bellOff' : 'bell'" class="muted" />
        <span class="grow">{{ $t('chatInfo.notifications') }}</span>
        <span class="switch">
          <input type="checkbox" :checked="!chat.muted" @change="chats.setMuted(chat.id, !($event.target as HTMLInputElement).checked)" />
          <i />
        </span>
      </label>
    </div>

    <div v-if="chat.type === 'group'" class="card">
      <div class="section-title">{{ $t('chatInfo.members') }}</div>
      <button v-ripple class="list-item accent-item" @click="adding = !adding">
        <span class="add-icon"><Icon name="personAdd" :size="20" /></span>{{ $t('chatInfo.addMembers') }}
      </button>
      <div v-if="adding" class="adding">
        <PeoplePicker v-model="picked" :exclude="memberList.map((m) => m.user_id)" />
        <button class="btn block" :disabled="!picked.length" @click="addPicked">{{ $t('chatInfo.add', { n: picked.length }) }}</button>
      </div>
      <button v-for="m in memberList" :key="m.user_id" v-ripple class="list-item" @click="openMember(m.user_id)">
        <Avatar :id="m.user_id" :name="m.profile!.display_name" :url="m.profile!.avatar_url" :size="42" :online="realtime.online.has(m.user_id)" />
        <span class="grow col">
          <span class="ellipsis">{{ m.profile!.display_name }}<span v-if="m.user_id === auth.userId" class="muted"> ({{ $t('chat.you') }})</span></span>
          <small :class="realtime.online.has(m.user_id) ? 'online' : 'muted'">{{ lastSeen(m.user_id) }}</small>
        </span>
        <small v-if="m.role === 'owner'" class="muted">{{ $t('chatInfo.owner') }}</small>
      </button>
      <button v-ripple class="list-item danger-item" @click="leave"><Icon name="logout" />{{ $t('chatInfo.leave') }}</button>
    </div>
  </Sheet>
</template>

<style scoped>
.hero { display: grid; justify-items: center; gap: 4px; padding: 4px 16px 12px; text-align: center; }
.hero h2 { margin: 8px 0 0; font-size: 20px; display: flex; align-items: center; gap: 6px; cursor: default; }
.hero p { margin: 0; }
.avatar-pick { position: relative; cursor: pointer; }
.cam { position: absolute; right: 0; bottom: 0; width: 32px; height: 32px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; border: 2px solid var(--surface); }
.rename { margin-top: 8px; height: 38px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--accent); background: transparent; text-align: center; font-size: 18px; outline: none; }
.card { margin: 8px 0; padding: 4px 0; border-top: 1px solid var(--border); }
.kv { display: grid; padding: 8px 12px; }
.toggle { cursor: pointer; }
.grow { flex: 1; min-width: 0; }
.col { display: grid; text-align: left; }
.online { color: var(--accent); }
.accent-item { color: var(--accent); font-weight: 500; }
.add-icon { width: 42px; display: grid; place-items: center; }
.danger-item { color: var(--danger); }
.adding { display: grid; gap: 8px; padding: 0 8px 12px; }
</style>
