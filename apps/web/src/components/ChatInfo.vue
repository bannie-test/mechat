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
import ImageCropper from './ImageCropper.vue'
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

const cropping = ref<File | null>(null)
function pickAvatar(e: Event) {
  const input = e.target as HTMLInputElement
  const picked = input.files?.[0]
  input.value = ''
  if (picked) cropping.value = picked
}
async function onAvatarCropped(blob: Blob | null) {
  const f = blob ?? cropping.value
  cropping.value = null
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

// ---- moderation (owner / admins) -------------------------------------------------
const manager = computed(() => chats.isManager(props.chat.id))
const actionsFor = ref<string | null>(null)
const busy = ref(false)

async function run(fn: () => Promise<unknown>) {
  busy.value = true
  try {
    await fn()
  } catch {
    ui.toast(t('errors.generic'))
  } finally {
    busy.value = false
  }
}
function toggleMute(userId: string, canPost: boolean) {
  void run(() => chats.setCanPost(props.chat.id, userId, !canPost))
}
function removeMember(userId: string) {
  const name = chats.people[userId]?.display_name ?? ''
  if (!confirm(t('group.confirmRemove', { name }))) return
  actionsFor.value = null
  void run(() => chats.removeMember(props.chat.id, userId))
}

// "Only selected members can send": pick who may send.
const pickingAllowed = ref(false)
const allowed = ref<string[]>([])
const regularMembers = computed(() => memberList.value.filter((m) => m.role === 'member'))
function onRestrictToggle(e: Event) {
  const on = (e.target as HTMLInputElement).checked
  if (on) {
    ;(e.target as HTMLInputElement).checked = false // becomes on once the picker is confirmed
    allowed.value = []
    pickingAllowed.value = true
  } else {
    pickingAllowed.value = false
    void run(() => chats.setRestricted(props.chat.id, false))
  }
}
function editAllowed() {
  allowed.value = regularMembers.value.filter((m) => m.can_post !== false).map((m) => m.user_id)
  pickingAllowed.value = true
}
function toggleAllowed(id: string) {
  allowed.value = allowed.value.includes(id) ? allowed.value.filter((x) => x !== id) : [...allowed.value, id]
}
function saveAllowed() {
  pickingAllowed.value = false
  void run(() => chats.setRestricted(props.chat.id, true, allowed.value))
}

// ---- nicknames ---------------------------------------------------------------------
const nickFor = ref<string | null>(null)
const nickText = ref('')
function editNick(userId: string) {
  nickFor.value = userId
  nickText.value = chats.nicknames[userId] ?? ''
}
async function saveNick() {
  const id = nickFor.value
  if (!id) return
  nickFor.value = null
  await chats.setNickname(id, nickText.value).catch(() => ui.toast(t('errors.generic')))
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
      <div class="kv nick-row">
        <small class="muted">{{ $t('nickname.label') }}</small>
        <form v-if="nickFor === peer.id" class="nick-edit" @submit.prevent="saveNick">
          <input v-model="nickText" maxlength="64" :placeholder="peer.real_name ?? peer.display_name" autofocus @keydown.esc="nickFor = null" />
          <button class="btn sm">{{ $t('common.save') }}</button>
        </form>
        <button v-else class="nick-value" @click="editNick(peer.id)">
          <span v-if="chats.nicknames[peer.id]">{{ chats.nicknames[peer.id] }} <small class="muted">· {{ peer.real_name }}</small></span>
          <span v-else class="accent">{{ $t('nickname.add') }}</span>
          <Icon name="edit" :size="15" class="muted" />
        </button>
      </div>
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

    <div v-if="chat.type === 'group' && (manager || chat.restricted)" class="card">
      <div class="section-title">{{ $t('group.permissions') }}</div>
      <label v-if="manager" class="list-item toggle">
        <Icon name="lock" class="muted" />
        <span class="grow col">
          {{ $t('group.restrict') }}
          <small class="muted">{{ $t('group.restrictHint') }}</small>
        </span>
        <span class="switch">
          <input type="checkbox" :checked="chat.restricted" :disabled="busy" @change="onRestrictToggle" />
          <i />
        </span>
      </label>
      <p v-else class="muted pad-x">{{ $t('group.restrictedNotice') }}</p>
      <button v-if="manager && chat.restricted && !pickingAllowed" v-ripple class="list-item accent-item" @click="editAllowed">
        <span class="add-icon"><Icon name="group" :size="20" /></span>{{ $t('group.chooseAllowed') }}
      </button>
      <div v-if="pickingAllowed" class="allowed">
        <small class="muted pad-x">{{ $t('group.pickAllowed') }}</small>
        <label v-for="m in regularMembers" :key="m.user_id" class="list-item toggle">
          <Avatar :id="m.user_id" :name="m.profile!.display_name" :url="m.profile!.avatar_url" :size="34" />
          <span class="grow ellipsis">{{ m.profile!.display_name }}</span>
          <input type="checkbox" class="check" :checked="allowed.includes(m.user_id)" @change="toggleAllowed(m.user_id)" />
        </label>
        <p v-if="!regularMembers.length" class="muted pad-x">{{ $t('group.noMembers') }}</p>
        <div class="row-btns">
          <button class="btn ghost" @click="pickingAllowed = false">{{ $t('common.cancel') }}</button>
          <button class="btn" :disabled="busy" @click="saveAllowed">{{ $t('group.saveAllowed', { n: allowed.length }) }}</button>
        </div>
      </div>
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
      <template v-for="m in memberList" :key="m.user_id">
        <div class="member">
          <button v-ripple class="list-item grow" @click="openMember(m.user_id)">
            <Avatar :id="m.user_id" :name="m.profile!.display_name" :url="m.profile!.avatar_url" :size="42" :online="realtime.online.has(m.user_id)" />
            <span class="grow col">
              <span class="ellipsis">
                {{ m.profile!.display_name }}<span v-if="m.user_id === auth.userId" class="muted"> ({{ $t('chat.you') }})</span>
                <small v-if="chats.nicknames[m.user_id]" class="muted"> · {{ m.profile!.real_name }}</small>
              </span>
              <small :class="realtime.online.has(m.user_id) ? 'online' : 'muted'">{{ lastSeen(m.user_id) }}</small>
            </span>
            <span v-if="m.role === 'member' && m.can_post === false" class="tag muted-tag" :title="$t('group.muted')">🔇 {{ $t('group.muted') }}</span>
            <small v-if="m.role === 'owner'" class="tag">{{ $t('chatInfo.owner') }}</small>
            <small v-else-if="m.role === 'admin'" class="tag">{{ $t('group.admin') }}</small>
          </button>
          <button
            v-if="m.user_id !== auth.userId" class="icon-btn more" :title="$t('menu.more')"
            :aria-expanded="actionsFor === m.user_id" @click="actionsFor = actionsFor === m.user_id ? null : m.user_id"
          ><Icon name="more" :size="20" /></button>
        </div>
        <Transition name="bar">
          <div v-if="actionsFor === m.user_id" class="member-actions">
            <form v-if="nickFor === m.user_id" class="nick-edit" @submit.prevent="saveNick">
              <input v-model="nickText" maxlength="64" :placeholder="m.profile!.real_name ?? m.profile!.display_name" autofocus @keydown.esc="nickFor = null" />
              <button class="btn sm">{{ $t('common.save') }}</button>
            </form>
            <template v-else>
              <button class="chip" @click="editNick(m.user_id)"><Icon name="edit" :size="16" />{{ $t('nickname.set') }}</button>
              <template v-if="manager && m.role === 'member'">
                <button class="chip" :disabled="busy" @click="toggleMute(m.user_id, m.can_post !== false)">
                  {{ m.can_post === false ? '🔊 ' + $t('group.unmute') : '🔇 ' + $t('group.mute') }}
                </button>
                <button class="chip danger" :disabled="busy" @click="removeMember(m.user_id)"><Icon name="close" :size="16" />{{ $t('group.remove') }}</button>
              </template>
            </template>
          </div>
        </Transition>
      </template>
      <button v-ripple class="list-item danger-item" @click="leave"><Icon name="logout" />{{ $t('chatInfo.leave') }}</button>
    </div>
    <ImageCropper v-if="cropping" :file="cropping" mode="avatar" @done="onAvatarCropped" @cancel="cropping = null" />
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
.member { display: flex; align-items: center; }
.member .list-item { min-width: 0; }
.more { flex: none; margin-right: 4px; }
.tag { flex: none; padding: 2px 8px; border-radius: 10px; font-size: 11.5px; background: var(--surface-2); color: var(--text-muted); }
.muted-tag { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
.member-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 10px 64px; }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 16px; background: var(--surface-2); font-size: 13px; font-weight: 600; }
.chip:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 12%, var(--surface-2)); }
.chip.danger { color: var(--danger); }
.chip:disabled { opacity: 0.5; }
.nick-row { gap: 2px; }
.nick-value { display: flex; align-items: center; gap: 6px; text-align: left; padding: 2px 0; }
.accent { color: var(--accent); font-weight: 500; }
.nick-edit { display: flex; gap: 6px; flex: 1; }
.nick-edit input { flex: 1; min-width: 0; height: 34px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--accent); background: transparent; outline: none; }
.btn.sm { height: 34px; padding: 0 14px; }
.pad-x { display: block; margin: 0; padding: 4px 12px 8px; font-size: 13px; }
.allowed { display: grid; padding-bottom: 8px; }
.check { width: 20px; height: 20px; accent-color: var(--accent); }
.row-btns { display: flex; justify-content: flex-end; gap: 8px; padding: 4px 12px 0; }
.bar-enter-active, .bar-leave-active { transition: max-height 0.25s var(--ease-out), opacity 0.2s; max-height: 120px; overflow: hidden; }
.bar-enter-from, .bar-leave-to { max-height: 0; opacity: 0; }
</style>
