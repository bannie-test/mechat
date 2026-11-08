<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatBytes, formatTime, isOnlyEmoji, linkify } from '@/lib/format'
import { signedUrl } from '@/lib/storage'
import { vibrate } from '@/lib/motion'
import { onLongPress } from '@/composables/useLongPress'
import { messageActions, type MessageAction } from '@/lib/messageActions'
import type { ChatType, Message, Reaction } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { useChats } from '@/stores/chats'
import { useSettings } from '@/stores/settings'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import MediaImage from './MediaImage.vue'
import VoicePlayer from './VoicePlayer.vue'
import CallLog from './call/CallLog.vue'

const props = defineProps<{
  msg: Message
  chatType: ChatType
  /** First message of a consecutive run from the same sender. */
  first: boolean
  /** Last message of the run (shows avatar in groups). */
  last: boolean
  reactions: Reaction[]
  read: boolean
  replyTo?: Message | null
  lifted?: boolean
  highlight?: boolean
  animate?: boolean
}>()
const emit = defineEmits<{
  menu: [x: number, y: number, emojiGrid?: boolean]
  reply: []
  react: [emoji: string]
  retry: []
  jump: [id: string]
  open: [src: string]
  action: [name: MessageAction]
}>()

const { t } = useI18n()
const auth = useAuth()
const chats = useChats()
const settings = useSettings()

const mine = computed(() => props.msg.sender_id === auth.userId)
const sender = computed(() => chats.people[props.msg.sender_id ?? ''])
const showName = computed(() => props.chatType === 'group' && !mine.value && props.first)
const showAvatar = computed(() => props.chatType === 'group' && !mine.value)
const bigEmoji = computed(() => props.msg.kind === 'text' && isOnlyEmoji(props.msg.content ?? ''))
const bare = computed(() => props.msg.kind === 'sticker' || bigEmoji.value)
const segments = computed(() => linkify(props.msg.content ?? ''))
const actions = computed(() => messageActions(props.msg, mine.value))
const hoverable = computed(() => !props.msg._status && props.msg.kind !== 'system')

const grouped = computed(() => {
  const map = new Map<string, { emoji: string; count: number; mine: boolean; users: string[] }>()
  for (const r of props.reactions) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, users: [] }
    g.count++
    g.users.push(r.user_id)
    if (r.user_id === auth.userId) g.mine = true
    map.set(r.emoji, g)
  }
  return [...map.values()]
})

function replySnippet(m: Message | null | undefined) {
  if (!m) return t('chat.deletedMessage')
  if (m.kind === 'text') return m.content ?? ''
  return t(`kind.${m.kind}`)
}

async function download() {
  const a = props.msg.attachment
  if (!a?.path) return
  const url = await signedUrl(a.path, a.name ?? 'file')
  window.open(url, '_blank', 'noopener')
}

// ---- swipe left to reply + long press ------------------------------------
const root = ref<HTMLElement | null>(null)
const dx = ref(0)
let sx = 0
let sy = 0
let active = false
let horizontal: boolean | null = null
let fired = false

function down(e: PointerEvent) {
  if (e.pointerType === 'mouse' || props.msg._status) return
  sx = e.clientX
  sy = e.clientY
  active = true
  horizontal = null
  fired = false
}
function move(e: PointerEvent) {
  if (!active) return
  const ddx = e.clientX - sx
  const ddy = e.clientY - sy
  if (horizontal === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) {
    horizontal = ddx < 0 && Math.abs(ddx) > Math.abs(ddy)
  }
  if (!horizontal) return
  dx.value = Math.max(-80, Math.min(0, ddx))
  if (dx.value <= -56 && !fired) {
    fired = true
    vibrate(12)
  } else if (dx.value > -56) fired = false
}
function up() {
  if (active && fired) emit('reply')
  active = false
  dx.value = 0
}

let unbind: (() => void) | null = null
onMounted(() => {
  if (root.value) unbind = onLongPress(root.value, (x, y) => {
    if (dx.value !== 0) return
    vibrate(15)
    emit('menu', x, y)
  })
})
onBeforeUnmount(() => unbind?.())
</script>

<template>
  <div
    class="row" :class="{ mine, first, last, lifted, highlight, animate }"
    @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"
  >
    <div v-if="showAvatar" class="avatar-slot">
      <Avatar v-if="last" :id="msg.sender_id ?? ''" :name="sender?.display_name ?? ''" :url="sender?.avatar_url" :size="34" />
    </div>

    <div class="swipe" :style="dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined">
      <div ref="root" class="bubble" :class="[msg.kind, { bare }]">
        <div v-if="showName" class="name" :style="{ color: 'var(--accent)' }">{{ sender?.display_name }}</div>

        <div v-if="msg.forwarded_from" class="forwarded">
          {{ $t('chat.forwardedFrom') }} <b>{{ msg.forwarded_from.sender_name }}</b>
        </div>

        <button v-if="msg.reply_to_id" class="quote" data-no-swipe @click.stop="emit('jump', msg.reply_to_id!)">
          <b>{{ replyTo ? chats.people[replyTo.sender_id ?? '']?.display_name : '' }}</b>
          <span class="ellipsis">{{ replySnippet(replyTo) }}</span>
        </button>

        <!-- content -->
        <template v-if="msg.kind === 'image'">
          <MediaImage :attachment="msg.attachment" :local-url="msg._localUrl" :uploading="msg._status === 'sending'" @open="emit('open', $event)" />
          <p v-if="msg.content" class="text caption">{{ msg.content }}</p>
        </template>
        <MediaImage v-else-if="msg.kind === 'gif'" :attachment="msg.attachment" :max-width="260" @open="emit('open', $event)" />
        <div v-else-if="msg.kind === 'sticker'" class="sticker">{{ msg.content }}</div>
        <VoicePlayer v-else-if="msg.kind === 'voice'" :attachment="msg.attachment" :local-url="msg._localUrl" :mine="mine" />
        <button v-else-if="msg.kind === 'file'" class="file" @click.stop="download">
          <span class="file-icon"><span v-if="msg._status === 'sending'" class="spinner file-spin" /><Icon v-else name="download" /></span>
          <span class="file-meta">
            <span class="ellipsis">{{ msg.attachment?.name }}</span>
            <small>{{ formatBytes(msg.attachment?.size) }}</small>
          </span>
        </button>
        <CallLog v-else-if="msg.kind === 'call'" :msg="msg" :mine="mine" :chat-type="chatType" />
        <p v-else class="text" :class="{ big: bigEmoji }"><template v-for="(s, i) in segments" :key="i"><a v-if="s.href" :href="s.href" target="_blank" rel="noopener noreferrer" @click.stop>{{ s.text }}</a><template v-else>{{ s.text }}</template></template></p>

        <span class="meta" :class="{ overlay: (msg.kind === 'image' && !msg.content) || msg.kind === 'gif' || bare }">
          <span v-if="msg.edited_at" class="edited">{{ $t('chat.edited') }}</span>
          {{ formatTime(msg.created_at, settings.locale) }}
          <template v-if="mine">
            <button v-if="msg._status === 'failed'" class="failed" :title="$t('chat.retry')" @click.stop="emit('retry')"><Icon name="alert" :size="16" />{{ $t('chat.notSent') }}</button>
            <span v-else-if="msg._status === 'sending'" class="sending" :title="$t('chat.sending')"><i /></span>
            <Icon v-else :name="read ? 'checks' : 'check'" :size="16" />
          </template>
        </span>
      </div>

      <TransitionGroup v-if="grouped.length" tag="div" name="pop" class="reactions">
        <button
          v-for="g in grouped" :key="g.emoji" class="chip" :class="{ on: g.mine }" data-no-swipe
          :title="g.users.map((u) => chats.people[u]?.display_name).join(', ')"
          @click.stop="emit('react', g.emoji)"
        >
          <span>{{ g.emoji }}</span><small v-if="g.count > 1">{{ g.count }}</small>
        </button>
      </TransitionGroup>

      <div v-if="hoverable" class="hover-bar" data-no-swipe @pointerdown.stop>
        <div class="hb-item">
          <button class="hb-btn" :title="$t('menu.react')"><Icon name="smile" :size="18" /></button>
          <div class="hb-pop hb-emoji">
            <button v-for="e in settings.quickReactions" :key="e" class="hb-e" @click.stop="emit('react', e)">{{ e }}</button>
            <button class="hb-e hb-plus" :title="$t('menu.moreReactions')" @click.stop="(ev) => emit('menu', ev.clientX, ev.clientY, true)"><Icon name="plus" :size="18" /></button>
          </div>
        </div>
        <button class="hb-btn" :title="$t('menu.reply')" @click.stop="emit('reply')"><Icon name="reply" :size="18" /></button>
        <div class="hb-item">
          <button class="hb-btn" :title="$t('menu.more')" @click.stop="(ev) => emit('menu', ev.clientX, ev.clientY)"><Icon name="more" :size="18" /></button>
          <div class="hb-pop hb-actions">
            <button v-for="a in actions" :key="a.name" :class="{ danger: a.danger }" @click.stop="emit('action', a.name)">
              <Icon :name="a.icon" :size="18" />{{ $t(`menu.${a.name}`) }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <span class="reply-hint" :style="{ opacity: Math.min(1, -dx / 56), transform: `scale(${0.6 + Math.min(1, -dx / 56) * 0.4})` }">
      <Icon name="reply" :size="18" />
    </span>
  </div>
</template>

<style scoped>
.row { position: relative; display: flex; align-items: flex-end; gap: 6px; padding: 1px 0; touch-action: pan-y; }
.row.first { margin-top: 6px; }
.row.mine { flex-direction: row-reverse; }
.avatar-slot { width: 34px; flex: none; align-self: flex-end; }
.swipe { display: flex; flex-direction: column; max-width: min(78%, 480px); transition: transform 0.25s var(--ease-out); }
.mine .swipe { align-items: flex-end; }

.bubble {
  position: relative; padding: 6px 10px 6px; border-radius: var(--bubble-radius);
  background: var(--bubble-in); color: var(--text); box-shadow: var(--shadow);
  min-width: 64px; max-width: 100%; user-select: text; -webkit-user-select: text;
  transition: transform 0.2s var(--ease-out), box-shadow 0.2s;
}
.mine .bubble { background: var(--bubble-out); color: var(--bubble-out-text); }
.bubble.image, .bubble.gif { padding: 3px; }
.bubble.bare { background: transparent; box-shadow: none; padding: 0; }
.row.animate .bubble { animation: msg-in 0.28s var(--ease-out); transform-origin: bottom left; }
.row.mine.animate .bubble { transform-origin: bottom right; }
@keyframes msg-in { from { transform: translateY(12px) scale(0.92); opacity: 0; } }
.row.lifted { z-index: 31; }
.row.lifted .bubble { transform: scale(1.03); box-shadow: var(--shadow-lg); }
.row.highlight .bubble { animation: flash 1.4s ease; }
@keyframes flash { 30% { box-shadow: 0 0 0 3px var(--accent); } }

.name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.forwarded { font-size: 13px; color: var(--accent); margin-bottom: 2px; }
.quote {
  display: grid; text-align: left; gap: 1px; width: 100%; margin: 2px 0 4px; padding: 3px 8px;
  border-left: 3px solid var(--accent); border-radius: 4px 8px 8px 4px; background: color-mix(in srgb, var(--accent) 10%, transparent);
  font-size: 13px; max-width: 320px;
}
.quote b { color: var(--accent); font-weight: 600; }
.image .quote, .gif .quote { margin: 4px 4px 6px; width: auto; }

.text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; display: inline; }
.text.big { font-size: 42px; line-height: 1.15; display: block; }
.caption { display: block; padding: 4px 7px 0; }
.text::after { content: ''; display: inline-block; width: var(--meta-w, 58px); }
.mine .text::after { --meta-w: 76px; }
.row:has(.failed) .text::after { --meta-w: 130px; }
.text.big::after { display: none; }
.sticker { font-size: 96px; line-height: 1.1; padding: 4px; }

.meta {
  float: right; position: relative; bottom: -4px; margin: -10px 0 0 8px; display: inline-flex; align-items: center; gap: 3px;
  font-size: 11.5px; color: var(--bubble-meta); white-space: nowrap; user-select: none;
}
.mine .meta { color: var(--bubble-out-meta); }
.meta.overlay {
  position: absolute; right: 8px; bottom: 8px; margin: 0; float: none;
  padding: 1px 6px; border-radius: 10px; background: rgba(0, 0, 0, 0.42); color: #fff;
}
.bare .meta.overlay { right: 2px; bottom: 2px; }
.voice + .meta, .file + .meta, .call-log + .meta { float: none; display: flex; justify-content: flex-end; margin: 2px 0 0; bottom: 0; }
.edited { font-style: italic; }
.failed { color: var(--danger); display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; font-weight: 600; }
.sending { display: inline-grid; place-items: center; width: 14px; height: 14px; }
.sending i {
  width: 11px; height: 11px; border-radius: 50%; border: 1.6px solid currentColor; border-right-color: transparent;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.row:has(.sending) .bubble { opacity: 0.85; }

/* Desktop hover toolbar: emoji strip and action list open on hover. */
.swipe { position: relative; }
.hover-bar {
  position: absolute; top: 50%; left: 100%; transform: translateY(-50%);
  display: none; gap: 2px; padding: 2px; margin: 0 6px; border-radius: 18px; white-space: nowrap;
  background: var(--surface); box-shadow: var(--shadow); opacity: 0; transition: opacity 0.12s;
}
@media (hover: hover) and (pointer: fine) {
  .hover-bar { display: flex; }
  .row:hover .hover-bar, .hover-bar:focus-within { opacity: 1; }
  .row:hover { z-index: 4; }
}
.mine .hover-bar { left: auto; right: 100%; }
.row.lifted .hover-bar { opacity: 0 !important; pointer-events: none; }
.hb-item { position: relative; }
.hb-btn { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: var(--text-muted); }
.hb-btn:hover { background: var(--hover); color: var(--accent); }
.hb-pop {
  position: absolute; bottom: 100%; z-index: 20; display: none; padding: 4px; margin-bottom: 6px; border-radius: 22px;
  background: var(--surface); box-shadow: var(--shadow-lg); animation: hb-in 0.14s var(--ease-out);
}
/* invisible bridge so the pointer can travel from the button to the popover */
.hb-pop::after { content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 8px; }
.hb-item:hover .hb-pop { display: flex; }
.mine .hb-pop { right: -4px; }
.row:not(.mine) .hb-pop { left: -4px; }
@keyframes hb-in { from { opacity: 0; transform: translateY(4px) scale(0.95); } }
.hb-e { width: 36px; height: 36px; border-radius: 50%; font-size: 22px; transition: transform 0.12s var(--ease-out); }
.hb-e:hover { transform: scale(1.25); }
.hb-plus { display: grid; place-items: center; font-size: 0; color: var(--text-muted); background: var(--surface-2); }
.hb-actions { flex-direction: column; min-width: 170px; border-radius: 12px; padding: 4px; }
.hb-actions button { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 8px; font-size: 14px; font-weight: 500; text-align: left; white-space: nowrap; }
.hb-actions button:hover { background: var(--hover); }
.hb-actions .danger { color: var(--danger); }

.file { display: flex; align-items: center; gap: 10px; text-align: left; min-width: 200px; padding: 2px 0; }
.file-icon { width: 44px; height: 44px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; flex: none; }
.file-meta { display: grid; min-width: 0; }
.file-spin { width: 22px; height: 22px; border-width: 2.5px; border-color: currentColor; border-right-color: transparent; }
.file-meta small { color: var(--bubble-meta); }

.reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.chip {
  display: inline-flex; align-items: center; gap: 3px; height: 26px; padding: 0 8px; border-radius: 13px;
  background: var(--bubble-in); box-shadow: var(--shadow); font-size: 15px; transition: transform 0.15s;
}
.chip:active { transform: scale(0.9); }
.chip.on { background: var(--accent); color: var(--on-accent); }
.chip small { font-size: 12px; font-weight: 600; }

.reply-hint {
  position: absolute; right: 8px; top: 50%; margin-top: -16px; width: 32px; height: 32px; border-radius: 50%;
  display: grid; place-items: center; background: rgba(0, 0, 0, 0.25); color: #fff; opacity: 0; pointer-events: none;
}
</style>
