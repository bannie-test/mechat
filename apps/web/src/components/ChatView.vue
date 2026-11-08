<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { goBack } from '@/router'
import { formatDay, formatTime, isSameDay } from '@/lib/format'
import type { Message } from '@/lib/types'
import type { MessageAction } from '@/lib/messageActions'
import { sfx } from '@/lib/sound'
import { useWide } from '@/composables/useBreakpoint'
import { useAuth } from '@/stores/auth'
import { useCall } from '@/stores/call'
import { useChats } from '@/stores/chats'
import { useMessages } from '@/stores/messages'
import { useRealtime } from '@/stores/realtime'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import Avatar from './Avatar.vue'
import ChatInfo from './ChatInfo.vue'
import Composer from './Composer.vue'
import Icon from './Icon.vue'
import MessageBubble from './MessageBubble.vue'
import MessageMenu from './MessageMenu.vue'
import RainOverlay from './RainOverlay.vue'
import WeatherCard from './WeatherCard.vue'

const props = defineProps<{ chatId: string }>()

const { t } = useI18n()
const route = useRoute()
const wide = useWide()
const auth = useAuth()
const chats = useChats()
const messages = useMessages()
const realtime = useRealtime()
const settings = useSettings()
const ui = useUi()
const call = useCall()

const chat = computed(() => chats.byId(props.chatId))
const bucket = computed(() => messages.bucket(props.chatId))
const items = computed(() => bucket.value.items)
const members = computed(() => chats.members[props.chatId] ?? [])

// ---- header ------------------------------------------------------------------
const subtitle = computed(() => {
  const c = chat.value
  if (!c) return ''
  const typers = realtime.typingIn(c.id)
  if (typers.length) {
    if (c.type === 'direct') return t('chat.typing')
    return t('chat.typingNamed', { name: typers.map((u) => chats.people[u]?.display_name).join(', ') })
  }
  if (c.type === 'group') {
    const on = members.value.filter((m) => m.user_id !== auth.userId && realtime.online.has(m.user_id)).length
    return on ? t('chat.membersOnline', { n: c.member_count, online: on }) : t('chat.members', { n: c.member_count })
  }
  if (realtime.online.has(c.peer_id ?? '')) return t('chat.online')
  const seen = chats.people[c.peer_id ?? '']?.last_seen_at
  if (!seen) return t('chat.lastSeenRecently')
  const d = new Date(seen)
  return isSameDay(d, new Date())
    ? t('chat.lastSeenAt', { time: formatTime(seen, settings.locale) })
    : t('chat.lastSeenOn', { date: d.toLocaleDateString(settings.locale === 'vi' ? 'vi-VN' : 'en-US') })
})
const isTyping = computed(() => realtime.typingIn(props.chatId).length > 0)

// A call is going on in this chat and we're not in it → offer to join.
const liveHere = computed(() => {
  const row = call.liveCall(props.chatId)
  return row && !(call.inCall && call.chatId === props.chatId) ? row : null
})
const headerOnline = computed(() => chat.value?.type === 'direct' && realtime.online.has(chat.value.peer_id ?? ''))

// ---- rows (date separators + sender runs) -----------------------------------
type Row =
  | { type: 'date'; key: string; label: string }
  | { type: 'system'; key: string; msg: Message }
  | { type: 'weather'; key: string; msg: Message }
  | { type: 'msg'; key: string; msg: Message; first: boolean; last: boolean }

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const list = items.value
  for (let i = 0; i < list.length; i++) {
    const m = list[i]
    const prev = list[i - 1]
    const next = list[i + 1]
    if (!prev || !isSameDay(new Date(prev.created_at), new Date(m.created_at))) {
      out.push({ type: 'date', key: `d-${m.created_at.slice(0, 10)}-${m.id}`, label: formatDay(m.created_at, settings.locale, t('chat.today'), t('chat.yesterday')) })
    }
    if (m.kind === 'system' || m.kind === 'weather') {
      out.push({ type: m.kind, key: m.id, msg: m } as Row)
      continue
    }
    const sameAsPrev = prev && prev.kind !== 'system' && prev.kind !== 'weather' && prev.sender_id === m.sender_id &&
      isSameDay(new Date(prev.created_at), new Date(m.created_at)) &&
      new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000
    const sameAsNext = next && next.kind !== 'system' && next.kind !== 'weather' && next.sender_id === m.sender_id &&
      isSameDay(new Date(next.created_at), new Date(m.created_at)) &&
      new Date(next.created_at).getTime() - new Date(m.created_at).getTime() < 5 * 60_000
    out.push({ type: 'msg', key: m.id, msg: m, first: !sameAsPrev, last: !sameAsNext })
  }
  return out
})

function isRead(m: Message) {
  return members.value.some((x) => x.user_id !== auth.userId && x.last_read_at >= m.created_at)
}

function replyTarget(m: Message) {
  if (!m.reply_to_id) return undefined
  const found = messages.find(m.reply_to_id)
  if (!found) void messages.fetchOne(m.reply_to_id)
  return found ?? null
}

function systemText(m: Message) {
  const actor = chats.people[m.sender_id ?? '']?.display_name ?? ''
  const ids = (m.attachment?.user_ids as string[] | undefined) ?? []
  const users = ids.map((id) => chats.people[id]?.display_name ?? '').join(', ')
  return t(`system.${m.content}`, { name: actor, users, title: (m.attachment?.title as string) ?? '' })
}

// ---- scrolling -----------------------------------------------------------------
const scroller = ref<HTMLElement | null>(null)
const atBottom = ref(true)
const ready = ref(false)
const animateIds = ref(new Set<string>())
const highlightId = ref<string | null>(null)

function scrollToBottom(smooth = false) {
  const el = scroller.value
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

let loadingOlder = false
async function loadOlder() {
  const el = scroller.value
  if (!el || loadingOlder || !bucket.value.hasMore) return 0
  loadingOlder = true
  const prevHeight = el.scrollHeight
  const prevTop = el.scrollTop
  const n = await messages.loadOlder(props.chatId)
  await nextTick()
  el.scrollTop = prevTop + (el.scrollHeight - prevHeight)
  loadingOlder = false
  return n
}

function onScroll() {
  const el = scroller.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  if (el.scrollTop < 300) void loadOlder()
}

// New message appended → animate it and follow if appropriate.
watch(
  () => items.value[items.value.length - 1]?.id,
  async (id, prevId) => {
    if (!ready.value || !id || id === prevId) return
    const last = items.value[items.value.length - 1]
    if (prevId && items.value.findIndex((m) => m.id === prevId) < items.value.length - 1) {
      animateIds.value.add(id)
    }
    if (atBottom.value || last.sender_id === auth.userId) {
      await nextTick()
      scrollToBottom(true)
    }
  },
)

async function jumpTo(id: string) {
  for (let i = 0; i < 20; i++) {
    const el = scroller.value?.querySelector<HTMLElement>(`[data-id="${id}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      highlightId.value = id
      setTimeout(() => { if (highlightId.value === id) highlightId.value = null }, 1500)
      return
    }
    if (!bucket.value.hasMore) break
    if (!(await loadOlder())) break
  }
  ui.toast(t('chat.messageNotFound'))
}

// Read receipts: mark read while the latest messages are visible.
function maybeMarkRead() {
  if (atBottom.value && document.visibilityState === 'visible' && chat.value?.unread_count) chats.markRead(props.chatId)
}
watch([atBottom, () => chat.value?.unread_count], maybeMarkRead)
document.addEventListener('visibilitychange', maybeMarkRead)

onMounted(async () => {
  chats.activeChatId = props.chatId
  if (!members.value.length) void chats.loadMembers(props.chatId)
  if (!bucket.value.loaded) await messages.loadLatest(props.chatId).catch(() => ui.toast(t('errors.generic')))
  else void messages.loadLatest(props.chatId)
  await nextTick()
  scrollToBottom()
  ready.value = true
  maybeMarkRead()
  if (typeof route.query.m === 'string') void jumpTo(route.query.m)
})
onBeforeUnmount(() => {
  if (chats.activeChatId === props.chatId) chats.activeChatId = null
  document.removeEventListener('visibilitychange', maybeMarkRead)
})

// ---- reply / edit / menu ------------------------------------------------------
const replyTo = ref<Message | null>(null)
const editing = ref<Message | null>(null)
const menu = ref<{ msg: Message; x: number; y: number; rect: DOMRect; emojiGrid: boolean } | null>(null)
const root = ref<HTMLElement | null>(null)
const infoOpen = ref(false)

function openMenu(msg: Message, x: number, y: number, emojiGrid = false) {
  if (!root.value) return
  menu.value = { msg, x, y, rect: root.value.getBoundingClientRect(), emojiGrid }
}

async function onMenuAction(action: MessageAction, target?: Message) {
  const msg = target ?? menu.value?.msg
  menu.value = null
  if (!msg) return
  switch (action) {
    case 'reply': editing.value = null; replyTo.value = msg; break
    case 'copy':
      await navigator.clipboard?.writeText(msg.content ?? '').catch(() => {})
      ui.toast(t('chat.copied'), undefined, 1500)
      break
    case 'edit': replyTo.value = null; editing.value = msg; break
    case 'forward': ui.forwarding = msg; break
    case 'delete':
      if (confirm(t('chat.confirmDelete'))) await messages.remove(msg).catch(() => ui.toast(t('errors.generic')))
      break
  }
}

function onReact(msg: Message, emoji: string) {
  menu.value = null
  sfx.pop()
  void messages.toggleReaction(msg, emoji)
}

function cancelContext() {
  replyTo.value = null
  editing.value = null
}

// ---- drag & drop files (desktop) ---------------------------------------------
const composer = ref<InstanceType<typeof Composer> | null>(null)
const dragOver = ref(false)
function onDrop(e: DragEvent) {
  dragOver.value = false
  composer.value?.onDrop(e)
}

// ---- /weather card + rain effect ----------------------------------------------
const rain = ref<{ key: number; storm: boolean } | null>(null)
async function onWeatherLoaded(effect: 'rain' | 'storm' | null) {
  await nextTick()
  scrollToBottom(true)
  if (effect) rain.value = { key: Date.now(), storm: effect === 'storm' }
}
function retryWeather(msg: Message) {
  messages.discard(msg)
  void messages.postWeather(props.chatId, settings.locale)
}

const unreadBelow = computed(() => (atBottom.value ? 0 : chat.value?.unread_count ?? 0))
</script>

<template>
  <section
    ref="root" class="chat"
    @dragover.prevent="dragOver = true" @dragleave.self="dragOver = false" @drop.prevent="onDrop"
  >
    <div class="wallpaper" :class="{ custom: !!settings.wallpaper }" :style="settings.wallpaper ? { backgroundImage: `url(&quot;${settings.wallpaper}&quot;)` } : undefined" />

    <header class="head">
      <button v-if="!wide" v-ripple class="icon-btn" :title="$t('common.back')" @click="goBack">
        <Icon name="back" />
        <span v-if="chats.totalUnread - (chat?.unread_count ?? 0) > 0" class="back-badge">{{ chats.totalUnread - (chat?.unread_count ?? 0) }}</span>
      </button>
      <button class="peer" @click="infoOpen = true">
        <Avatar v-bind="chats.avatar(chat)" :size="42" :online="headerOnline" />
        <span class="peer-meta">
          <b class="ellipsis">{{ chats.title(chat) }}</b>
          <small class="ellipsis" :class="{ live: isTyping || headerOnline }">
            {{ subtitle }}<span v-if="isTyping" class="dots"><i /><i /><i /></span>
          </small>
        </span>
      </button>
      <button v-if="wide" v-ripple class="icon-btn" :title="$t('apps.title')" @click="ui.openAppDrawer(chatId)"><Icon name="apps" /></button>
      <button v-ripple class="icon-btn" :title="$t('call.voice')" @click="call.start(chatId, 'voice')"><Icon name="phone" /></button>
      <button v-ripple class="icon-btn" :title="$t('call.video')" @click="call.start(chatId, 'video')"><Icon name="videocam" /></button>
      <button v-ripple class="icon-btn" :title="$t('chat.info')" @click="infoOpen = true"><Icon name="more" /></button>
    </header>

    <Transition name="bar">
      <button v-if="liveHere" class="live-call" @click="call.start(chatId, liveHere.kind)">
        <span class="live-dot" />
        <Icon :name="liveHere.kind === 'video' ? 'videocam' : 'phone'" :size="18" />
        <span class="grow">{{ $t('call.joinBar') }}</span>
        <b>{{ $t('call.join') }}</b>
      </button>
    </Transition>

    <div ref="scroller" class="messages scroll" @scroll.passive="onScroll">
      <div class="inner">
        <div v-if="bucket.loading && !items.length" class="loading"><span class="spinner" /></div>
        <div v-else-if="bucket.loaded && !items.length" class="hello">
          <div class="hello-card">
            <p>{{ $t('chat.sayHi') }}</p>
            <button class="hello-wave" @click="messages.send(chatId, { kind: 'sticker', content: '👋' })">👋</button>
          </div>
        </div>
        <div v-if="bucket.hasMore && items.length" class="older"><span v-if="bucket.loading" class="spinner" /></div>

        <template v-for="row in rows" :key="row.key">
          <div v-if="row.type === 'date'" class="day"><span>{{ row.label }}</span></div>
          <div v-else-if="row.type === 'system'" class="day system"><span>{{ systemText(row.msg) }}</span></div>
          <WeatherCard
            v-else-if="row.type === 'weather'" :msg="row.msg"
            @close="messages.discard(row.msg)" @retry="retryWeather(row.msg)" @loaded="onWeatherLoaded"
          />
          <MessageBubble
            v-else
            :data-id="row.msg.id"
            :msg="row.msg"
            :chat-type="chat?.type ?? 'direct'"
            :first="row.first"
            :last="row.last"
            :reactions="messages.reactions[row.msg.id] ?? []"
            :read="isRead(row.msg)"
            :reply-to="replyTarget(row.msg)"
            :lifted="menu?.msg.id === row.msg.id"
            :highlight="highlightId === row.msg.id"
            :animate="animateIds.has(row.msg.id)"
            @menu="(x, y, grid) => openMenu(row.msg, x, y, grid)"
            @action="(a) => onMenuAction(a, row.msg)"
            @reply="editing = null; replyTo = row.msg"
            @react="(e) => onReact(row.msg, e)"
            @retry="messages.retry(row.msg)"
            @jump="jumpTo"
            @open="(src) => (ui.viewer = { src })"
          />
        </template>
      </div>
    </div>

    <Transition name="pop">
      <button v-if="!atBottom" class="to-bottom" @click="scrollToBottom(true)">
        <Icon name="down" />
        <span v-if="unreadBelow" class="badge">{{ unreadBelow }}</span>
      </button>
    </Transition>

    <footer class="foot">
      <Composer
        ref="composer" :chat-id="chatId" :reply-to="replyTo" :editing="editing"
        @cancel="cancelContext" @sent="replyTo = null" @edit-last="(m) => (editing = m)"
      />
    </footer>

    <MessageMenu
      v-if="menu" :msg="menu.msg" :x="menu.x" :y="menu.y" :container="menu.rect" :emoji-grid="menu.emojiGrid"
      :mine="menu.msg.sender_id === auth.userId"
      @close="menu = null" @action="onMenuAction" @react="(e) => onReact(menu!.msg, e)"
    />

    <RainOverlay v-if="rain" :key="rain.key" :storm="rain.storm" @done="rain = null" />

    <Transition name="fade">
      <div v-if="dragOver" class="drop"><span>{{ $t('chat.dropFiles') }}</span></div>
    </Transition>

    <ChatInfo v-if="chat" :open="infoOpen" :chat="chat" @close="infoOpen = false" />
  </section>
</template>

<style scoped>
.chat { position: relative; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.wallpaper {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(160deg, var(--chat-bg), var(--chat-bg-2));
}
.wallpaper::after {
  content: ''; position: absolute; inset: 0; background: url('/wallpaper.svg') 0 0 / 240px repeat;
  opacity: var(--pattern-opacity);
}
:root[data-theme='dark'] .wallpaper::after { filter: invert(1); }
.wallpaper.custom { background-size: cover; background-position: center; }
.wallpaper.custom::after { display: none; }

.head {
  position: relative; z-index: 2; display: flex; align-items: center; gap: 4px;
  padding: calc(4px + var(--safe-top)) 8px 4px; min-height: calc(var(--header-h) + var(--safe-top));
  background: var(--surface); box-shadow: 0 1px 0 var(--border);
}
.head .icon-btn { position: relative; }
.back-badge {
  position: absolute; top: 2px; right: -2px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  background: var(--accent); color: var(--on-accent); font-size: 11px; font-weight: 700; display: grid; place-items: center;
}
.peer { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; text-align: left; padding: 4px; border-radius: 10px; }
.peer-meta { min-width: 0; display: grid; }
.peer-meta small { color: var(--text-muted); font-size: 13px; }
.peer-meta small.live { color: var(--accent); }
.dots { display: inline-flex; gap: 2px; margin-left: 3px; }
.dots i { width: 4px; height: 4px; border-radius: 50%; background: currentColor; animation: dot 1.2s infinite; }
.dots i:nth-child(2) { animation-delay: 0.15s; }
.dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes dot { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }

.live-call {
  position: relative; z-index: 2; display: flex; align-items: center; gap: 8px; padding: 9px 16px; color: #fff;
  background: #2fb36a; font-size: 14px; text-align: left;
}
.live-call .grow { flex: 1; }
.live-call b { padding: 3px 12px; border-radius: 12px; background: rgba(255, 255, 255, 0.22); }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: live-blink 1.2s ease-in-out infinite; }
@keyframes live-blink { 50% { opacity: 0.3; } }
.bar-enter-active, .bar-leave-active { transition: max-height 0.3s var(--ease-out), opacity 0.25s; max-height: 44px; overflow: hidden; }
.bar-enter-from, .bar-leave-to { max-height: 0; opacity: 0; }
.messages { position: relative; flex: 1; touch-action: pan-y; }
.inner { max-width: 760px; margin: 0 auto; padding: 8px 12px 8px; min-height: 100%; display: flex; flex-direction: column; justify-content: flex-end; }
.loading, .older { display: grid; place-items: center; padding: 12px; color: #fff; min-height: 24px; }
.day { position: sticky; top: 6px; z-index: 1; display: flex; justify-content: center; margin: 8px 0; pointer-events: none; }
.day span { padding: 3px 10px; border-radius: 12px; font-size: 13px; font-weight: 500; color: #fff; background: rgba(0, 0, 0, 0.28); backdrop-filter: blur(6px); }
.day.system { position: static; }
.hello { flex: 1; display: grid; place-items: center; }
.hello-card { display: grid; justify-items: center; gap: 6px; padding: 18px 26px; border-radius: 18px; color: #fff; background: rgba(0, 0, 0, 0.2); backdrop-filter: blur(6px); }
.hello-card p { margin: 0; }
.hello-wave { font-size: 64px; animation: wave 2s ease-in-out infinite; transform-origin: 70% 70%; }
@keyframes wave { 0%, 60%, 100% { transform: rotate(0); } 10%, 30% { transform: rotate(14deg); } 20% { transform: rotate(-8deg); } }

.to-bottom {
  position: absolute; right: 16px; bottom: calc(84px + var(--safe-bottom)); z-index: 3; width: 48px; height: 48px; border-radius: 50%;
  display: grid; place-items: center; background: var(--surface); color: var(--text-muted); box-shadow: var(--shadow-lg);
}
.to-bottom .badge { position: absolute; top: -6px; left: 50%; transform: translateX(-50%); }
.foot { position: relative; z-index: 2; }

.drop {
  position: absolute; inset: 12px; z-index: 40; display: grid; place-items: center; border-radius: 16px;
  border: 3px dashed var(--accent); background: color-mix(in srgb, var(--surface) 85%, transparent); font-size: 18px; font-weight: 600; color: var(--accent);
  pointer-events: none;
}
</style>
