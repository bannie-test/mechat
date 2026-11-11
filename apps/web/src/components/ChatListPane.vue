<script setup lang="ts">
import { callLogInfo } from '@/lib/call/labels'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { formatListTime } from '@/lib/format'
import type { ChatSummary, Message, Profile } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { useChats } from '@/stores/chats'
import { useRealtime } from '@/stores/realtime'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const chats = useChats()
const realtime = useRealtime()
const settings = useSettings()
const ui = useUi()

const searching = ref(false)
const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const messageHits = ref<Message[]>([])
const searchingRemote = ref(false)

const activeId = computed(() => (route.name === 'chat' ? String(route.params.id) : null))

function preview(chat: ChatSummary) {
  const typers = realtime.typingIn(chat.id)
  if (typers.length) {
    return chat.type === 'group'
      ? t('chat.typingNamed', { name: chats.people[typers[0]]?.display_name ?? '' })
      : t('chat.typing')
  }
  const m = chat.last_message
  if (!m) return chat.type === 'group' ? t('chat.groupCreated') : t('chat.noMessages')
  const body = messagePreview(m)
  if (m.kind === 'system') return body
  if (m.sender_id === auth.userId) return `${t('chat.you')}: ${body}`
  if (chat.type === 'group') return `${chats.people[m.sender_id ?? '']?.display_name ?? ''}: ${body}`
  return body
}

function messagePreview(m: Message) {
  switch (m.kind) {
    case 'image': return `📷 ${m.content || t('kind.image')}`
    case 'file': return `📎 ${m.attachment?.name ?? t('kind.file')}`
    case 'voice': return `🎤 ${t('kind.voice')}`
    case 'sticker': return `${m.content ?? ''} ${t('kind.sticker')}`
    case 'gif': return t('kind.gif')
    case 'call': {
      const info = callLogInfo(m, m.sender_id === auth.userId, chats.byId(m.chat_id)?.type === 'group')
      return `${info.video ? '📹' : '📞'} ${t(info.key)}`
    }
    case 'system': return t(`system.${m.content}`, { name: chats.people[m.sender_id ?? '']?.display_name ?? '' })
    default: return m.content ?? ''
  }
}

function isTyping(chat: ChatSummary) {
  return realtime.typingIn(chat.id).length > 0
}

function lastRead(chat: ChatSummary) {
  const m = chat.last_message
  if (!m || m.sender_id !== auth.userId || m.kind === 'system') return null
  if (m._status === 'sending') return 'clock'
  const others = (chats.members[chat.id] ?? []).filter((x) => x.user_id !== auth.userId)
  if (others.some((x) => x.last_read_at >= m.created_at)) return 'checks'
  return 'check'
}

// ---- search ----------------------------------------------------------------
const q = computed(() => query.value.trim().toLowerCase())
const chatHits = computed(() =>
  q.value ? chats.sorted.filter((c) => chats.title(c).toLowerCase().includes(q.value)) : [],
)
const peopleHits = computed<Profile[]>(() =>
  q.value
    ? Object.values(chats.people).filter(
        (p) => p.id !== auth.userId &&
          (p.display_name.toLowerCase().includes(q.value) || p.username.includes(q.value)) &&
          !chatHits.value.some((c) => c.peer_id === p.id),
      )
    : [],
)

let timer = 0
watch(query, (v) => {
  window.clearTimeout(timer)
  if (v.trim().length < 2) {
    messageHits.value = []
    return
  }
  timer = window.setTimeout(async () => {
    searchingRemote.value = true
    const { data } = await supabase.rpc('search_messages', { p_query: v.trim(), p_limit: 40 })
    messageHits.value = (data ?? []) as Message[]
    searchingRemote.value = false
  }, 300)
})

// ---- profile card (avatar in the header) ---------------------------------------
const profileOpen = ref(false)
function goSettings() {
  profileOpen.value = false
  void router.push({ name: 'settings' })
}
function onDocDown(e: PointerEvent) {
  if (profileOpen.value && !(e.target as HTMLElement).closest('.me-wrap')) profileOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown))

async function openSearch() {
  searching.value = true
}
// The input only mounts after the header's out-in fade, so focus it when it appears.
watch(searchInput, (el) => el?.focus())
function closeSearch() {
  searching.value = false
  query.value = ''
}

async function openPerson(p: Profile) {
  const id = await chats.openDirect(p.id)
  closeSearch()
  void router.push({ name: 'chat', params: { id } })
}

function openHit(m: Message) {
  closeSearch()
  void router.push({ name: 'chat', params: { id: m.chat_id }, query: { m: m.id } })
}

function highlight(text: string) {
  const i = text.toLowerCase().indexOf(q.value)
  if (i < 0) return [{ t: text.slice(0, 120), h: false }]
  const start = Math.max(0, i - 30)
  return [
    { t: (start ? '…' : '') + text.slice(start, i), h: false },
    { t: text.slice(i, i + q.value.length), h: true },
    { t: text.slice(i + q.value.length, i + 120), h: false },
  ]
}
</script>

<template>
  <section class="pane">
    <header class="head">
      <Transition name="fade" mode="out-in">
        <div v-if="!searching" key="title" class="row">
          <div class="me-wrap">
            <button class="me" :title="auth.profile?.display_name" :aria-expanded="profileOpen" @click="profileOpen = !profileOpen">
              <Avatar :id="auth.userId ?? ''" :name="auth.profile?.display_name ?? ''" :url="auth.profile?.avatar_url" :size="36" />
            </button>
            <Transition name="pop">
              <div v-if="profileOpen" class="me-card" @keydown.esc="profileOpen = false">
                <div class="me-cover" />
                <Avatar class="me-avatar" :id="auth.userId ?? ''" :name="auth.profile?.display_name ?? ''" :url="auth.profile?.avatar_url" :size="72" />
                <b class="me-name ellipsis">{{ auth.profile?.display_name }}</b>
                <small class="muted">@{{ auth.profile?.username }}</small>
                <p v-if="auth.profile?.bio" class="me-bio">{{ auth.profile.bio }}</p>
                <div class="me-actions">
                  <button v-ripple class="me-btn" @click="goSettings"><Icon name="settings" :size="20" />{{ $t('settings.title') }}</button>
                  <button v-ripple class="me-btn icon" :title="$t('settings.theme')" @click="settings.toggleTheme($event)">
                    <Icon :name="settings.isDark ? 'sun' : 'moon'" :size="20" />
                  </button>
                </div>
              </div>
            </Transition>
          </div>
          <h1 class="brand wordmark">iemanchat</h1>
          <button v-ripple class="icon-btn" :title="$t('apps.title')" @click="ui.openAppDrawer()">
            <Icon name="apps" />
          </button>
          <button v-ripple class="icon-btn" :title="$t('common.search')" @click="openSearch">
            <Icon name="search" />
          </button>
        </div>
        <div v-else key="search" class="row">
          <button v-ripple class="icon-btn" @click="closeSearch"><Icon name="back" /></button>
          <input
            ref="searchInput" v-model="query" class="search" type="search"
            :placeholder="$t('search.placeholder')" @keydown.esc="closeSearch"
          />
        </div>
      </Transition>
    </header>

    <div v-if="!searching" class="list scroll">
      <div v-if="chats.loaded && chats.sorted.length === 0" class="empty-list">
        <p>{{ $t('chat.emptyList') }}</p>
        <button class="btn" @click="router.push({ name: 'new' })">{{ $t('newChat.start') }}</button>
      </div>
      <TransitionGroup name="list">
        <button
          v-for="chat in chats.sorted" :key="chat.id" v-ripple
          class="list-item chat-item" :class="{ active: chat.id === activeId }"
          @click="router.push({ name: 'chat', params: { id: chat.id } })"
        >
          <Avatar
            v-bind="chats.avatar(chat)" :size="54"
            :online="chat.type === 'direct' && realtime.online.has(chat.peer_id ?? '')"
          />
          <span class="meta">
            <span class="top">
              <span class="title ellipsis">
                <Icon v-if="chat.type === 'group'" name="group" :size="16" class="kind" />
                {{ chats.title(chat) }}
                <Icon v-if="chat.muted" name="bellOff" :size="14" class="kind" />
              </span>
              <Icon v-if="lastRead(chat)" :name="lastRead(chat)!" :size="16" class="tick" />
              <span class="time">{{ formatListTime(chat.last_message_at, settings.locale) }}</span>
            </span>
            <span class="bottom">
              <span class="preview ellipsis" :class="{ typing: isTyping(chat) }">{{ preview(chat) }}</span>
              <Transition name="pop">
                <span v-if="chat.unread_count" class="badge" :class="{ 'muted-badge': chat.muted }">
                  {{ chat.unread_count > 99 ? '99+' : chat.unread_count }}
                </span>
              </Transition>
            </span>
          </span>
        </button>
      </TransitionGroup>
    </div>

    <div v-else class="list scroll">
      <template v-if="q">
        <div v-if="chatHits.length || peopleHits.length" class="section-title">{{ $t('search.chats') }}</div>
        <button v-for="c in chatHits" :key="c.id" v-ripple class="list-item" @click="closeSearch(); router.push({ name: 'chat', params: { id: c.id } })">
          <Avatar v-bind="chats.avatar(c)" :size="42" />
          <span class="ellipsis">{{ chats.title(c) }}</span>
        </button>
        <button v-for="p in peopleHits" :key="p.id" v-ripple class="list-item" @click="openPerson(p)">
          <Avatar :id="p.id" :name="p.display_name" :url="p.avatar_url" :size="42" />
          <span class="col">
            <span class="ellipsis">{{ p.display_name }}</span>
            <small class="muted">@{{ p.username }}</small>
          </span>
        </button>

        <div class="section-title">
          {{ $t('search.messages') }}
          <span v-if="searchingRemote" class="spinner small" />
        </div>
        <button v-for="m in messageHits" :key="m.id" v-ripple class="list-item hit" @click="openHit(m)">
          <Avatar v-bind="chats.avatar(chats.byId(m.chat_id))" :size="42" />
          <span class="col">
            <span class="top">
              <span class="ellipsis title">{{ chats.title(chats.byId(m.chat_id)) }}</span>
              <span class="time">{{ formatListTime(m.created_at, settings.locale) }}</span>
            </span>
            <span class="preview two-lines">
              <template v-for="(s, i) in highlight(m.content ?? '')" :key="i"><mark v-if="s.h">{{ s.t }}</mark><template v-else>{{ s.t }}</template></template>
            </span>
          </span>
        </button>
        <p v-if="!searchingRemote && q.length >= 2 && !messageHits.length" class="muted pad">{{ $t('search.noResults') }}</p>
      </template>
      <p v-else class="muted pad">{{ $t('search.hint') }}</p>
    </div>

    <Transition name="pop">
      <button v-if="!searching" v-ripple class="fab" :title="$t('newChat.title')" @click="router.push({ name: 'new' })">
        <Icon name="plus" :size="28" />
      </button>
    </Transition>
  </section>
</template>

<style scoped>
.pane { position: relative; height: 100%; display: flex; flex-direction: column; }
.head { padding: calc(8px + var(--safe-top)) 8px 8px; min-height: calc(var(--header-h) + var(--safe-top)); }
.row { display: flex; align-items: center; gap: 4px; height: 40px; }
.brand { flex: 1; margin: 0 0 0 10px; font-size: 25px; padding: 4px 0 6px; }
.me-wrap { position: relative; }
.me { display: grid; border-radius: 50%; padding: 2px; transition: box-shadow 0.2s, transform 0.15s; }
.me:hover, .me[aria-expanded='true'] { box-shadow: 0 0 0 2px var(--accent); }
.me:active { transform: scale(0.94); }
.me-card {
  position: absolute; z-index: 50; top: calc(100% + 8px); left: 0; width: 260px; display: grid; justify-items: center; gap: 2px;
  padding: 0 14px 14px; border-radius: 18px; background: var(--surface); box-shadow: var(--shadow-lg); overflow: hidden;
  transform-origin: top left; text-align: center;
}
.me-cover { justify-self: stretch; height: 54px; margin: 0 -14px; background: linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #ff5fa2)); }
.me-avatar { margin-top: -36px; border-radius: 50%; box-shadow: 0 0 0 4px var(--surface); }
.me-name { margin-top: 8px; font-size: 17px; max-width: 100%; }
.me-bio { margin: 6px 0 0; font-size: 13.5px; color: var(--text-muted); overflow-wrap: anywhere; }
.me-actions { display: flex; gap: 8px; width: 100%; margin-top: 12px; }
.me-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; border-radius: 12px; background: var(--surface-2); font-weight: 600; }
.me-btn:hover { background: color-mix(in srgb, var(--accent) 14%, var(--surface-2)); color: var(--accent); }
.me-btn.icon { flex: none; width: 40px; }
.search {
  flex: 1; height: 40px; border-radius: 20px; border: 2px solid transparent; padding: 0 16px;
  background: var(--surface-2); outline: none; transition: border-color 0.2s;
}
.search:focus { border-color: var(--accent); background: transparent; }
.list { flex: 1; padding: 0 8px calc(88px + var(--safe-bottom)); }
.chat-item { padding: 9px 10px; }
.meta { flex: 1; min-width: 0; display: grid; gap: 3px; }
.top, .bottom { display: flex; align-items: center; gap: 6px; min-width: 0; }
.title { flex: 1; font-weight: 600; display: flex; align-items: center; gap: 4px; }
.kind { flex: none; opacity: 0.7; }
.time { font-size: 12px; color: var(--text-muted); flex: none; }
.tick { color: var(--accent); flex: none; }
.preview { flex: 1; color: var(--text-muted); }
.preview.typing { color: var(--accent); }
.active .time, .active .preview, .active .tick, .active .kind { color: inherit; opacity: 0.85; }
.active .badge { background: var(--on-accent); color: var(--accent); }
.col { flex: 1; min-width: 0; display: grid; gap: 2px; text-align: left; }
.two-lines { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
mark { background: color-mix(in srgb, var(--accent) 25%, transparent); color: inherit; border-radius: 3px; }
.pad { padding: 16px; text-align: center; }
.spinner.small { width: 12px; height: 12px; border-width: 2px; display: inline-block; vertical-align: middle; margin-left: 6px; }
.empty-list { display: grid; justify-items: center; gap: 12px; padding: 48px 16px; color: var(--text-muted); text-align: center; }

.fab {
  position: absolute; right: 20px; bottom: calc(20px + var(--safe-bottom)); width: 56px; height: 56px; border-radius: 50%;
  background: var(--accent); color: var(--on-accent); display: grid; place-items: center; box-shadow: var(--shadow-lg);
  transition: transform 0.2s var(--ease-out), background 0.15s;
}
.fab:hover { background: var(--accent-hover); transform: scale(1.05); }

.list-move { transition: transform 0.35s var(--ease-out); }
.list-enter-active { transition: opacity 0.25s, transform 0.25s var(--ease-out); }
.list-enter-from { opacity: 0; transform: translateY(-8px); }
.list-leave-active { display: none; }
</style>
