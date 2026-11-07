<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatBytes, formatTime, isOnlyEmoji, linkify } from '@/lib/format'
import { signedUrl } from '@/lib/storage'
import { vibrate } from '@/lib/motion'
import { onLongPress } from '@/composables/useLongPress'
import type { ChatType, Message, Reaction } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { useChats } from '@/stores/chats'
import { useSettings } from '@/stores/settings'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import MediaImage from './MediaImage.vue'
import VoicePlayer from './VoicePlayer.vue'

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
  menu: [x: number, y: number]
  reply: []
  react: [emoji: string]
  retry: []
  jump: [id: string]
  open: [src: string]
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
          <span class="file-icon"><Icon :name="msg._status === 'sending' ? 'clock' : 'download'" /></span>
          <span class="file-meta">
            <span class="ellipsis">{{ msg.attachment?.name }}</span>
            <small>{{ formatBytes(msg.attachment?.size) }}</small>
          </span>
        </button>
        <p v-else class="text" :class="{ big: bigEmoji }"><template v-for="(s, i) in segments" :key="i"><a v-if="s.href" :href="s.href" target="_blank" rel="noopener noreferrer" @click.stop>{{ s.text }}</a><template v-else>{{ s.text }}</template></template></p>

        <span class="meta" :class="{ overlay: (msg.kind === 'image' && !msg.content) || msg.kind === 'gif' || bare }">
          <span v-if="msg.edited_at" class="edited">{{ $t('chat.edited') }}</span>
          {{ formatTime(msg.created_at, settings.locale) }}
          <template v-if="mine">
            <button v-if="msg._status === 'failed'" class="failed" :title="$t('chat.retry')" @click.stop="emit('retry')"><Icon name="alert" :size="16" /></button>
            <Icon v-else-if="msg._status === 'sending'" name="clock" :size="14" />
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
.voice + .meta, .file + .meta { float: none; display: flex; justify-content: flex-end; margin: 2px 0 0; bottom: 0; }
.edited { font-style: italic; }
.failed { color: var(--danger); display: inline-grid; }

.file { display: flex; align-items: center; gap: 10px; text-align: left; min-width: 200px; padding: 2px 0; }
.file-icon { width: 44px; height: 44px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; flex: none; }
.file-meta { display: grid; min-width: 0; }
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
