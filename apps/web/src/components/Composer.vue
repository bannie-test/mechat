<script lang="ts">
// Unsent text per chat survives switching chats.
const drafts = new Map<string, string>()
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDuration } from '@/lib/format'
import { resizeImage, uploadAttachment } from '@/lib/storage'
import { vibrate } from '@/lib/motion'
import type { Attachment, Message } from '@/lib/types'
import { useRecorder } from '@/composables/useRecorder'
import { useWide } from '@/composables/useBreakpoint'
import { useAuth } from '@/stores/auth'
import { useChats } from '@/stores/chats'
import { useMessages } from '@/stores/messages'
import { useRealtime } from '@/stores/realtime'
import { useUi } from '@/stores/ui'
import EmojiPanel from './EmojiPanel.vue'
import Icon from './Icon.vue'

const props = defineProps<{ chatId: string; replyTo: Message | null; editing: Message | null }>()
const emit = defineEmits<{ cancel: []; sent: []; editLast: [m: Message] }>()

const { t } = useI18n()
const auth = useAuth()
const chats = useChats()
const messages = useMessages()
const realtime = useRealtime()
const ui = useUi()
const wide = useWide()
const rec = useRecorder()

const text = ref(drafts.get(props.chatId) ?? '')
const input = ref<HTMLTextAreaElement | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const showEmoji = ref(false)
const showAttach = ref(false)

const canSend = computed(() => text.value.trim().length > 0)

watch(text, (v) => {
  drafts.set(props.chatId, v)
  autosize()
  if (v.trim() && !props.editing) realtime.sendTyping(props.chatId)
})

watch(() => props.editing, async (m, prev) => {
  if (m) {
    if (!prev) drafts.set(`${props.chatId}:pre-edit`, text.value)
    text.value = m.content ?? ''
    await nextTick()
    input.value?.focus()
  } else {
    text.value = drafts.get(`${props.chatId}:pre-edit`) ?? ''
    drafts.delete(`${props.chatId}:pre-edit`)
  }
})
watch(() => props.replyTo, (m) => { if (m) input.value?.focus() })

function autosize() {
  const el = input.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && wide.value) {
    e.preventDefault()
    void submit()
  } else if (e.key === 'Escape' && (props.editing || props.replyTo)) {
    emit('cancel')
  } else if (e.key === 'ArrowUp' && !text.value && !props.editing) {
    // Edit your last text message, like desktop chat apps.
    const last = [...messages.bucket(props.chatId).items]
      .reverse()
      .find((m) => m.sender_id === auth.userId && m.kind === 'text' && !m._status)
    if (last) {
      e.preventDefault()
      emit('editLast', last)
    }
  }
}

async function submit() {
  const body = text.value.trim()
  if (!body) return
  if (props.editing) {
    const m = props.editing
    emit('cancel')
    text.value = ''
    if (body !== m.content) await messages.edit(m, body).catch(() => ui.toast(t('errors.generic')))
    return
  }
  text.value = ''
  drafts.delete(props.chatId)
  realtime.stopTyping(props.chatId)
  const reply = props.replyTo?.id ?? null
  emit('sent')
  await messages.send(props.chatId, { kind: 'text', content: body, reply_to_id: reply })
  input.value?.focus()
}

// ---- media -------------------------------------------------------------------
async function sendImage(file: File) {
  const isGif = file.type === 'image/gif'
  const { blob, width, height } = isGif
    ? await createImageBitmap(file).then((b) => ({ blob: file as Blob, width: b.width, height: b.height })).catch(() => ({ blob: file as Blob, width: 0, height: 0 }))
    : await resizeImage(file)
  const name = isGif ? file.name : file.name.replace(/\.\w+$/, '') + '.jpg'
  const reply = props.replyTo?.id ?? null
  emit('sent')
  await messages.send(
    props.chatId,
    { kind: 'image', attachment: { width, height, mime: blob.type, size: blob.size, name }, reply_to_id: reply, localUrl: URL.createObjectURL(blob) },
    () => uploadAttachment(props.chatId, blob, name),
  )
}

async function sendFile(file: File) {
  if (file.size > 25 * 1024 * 1024) return ui.toast(t('errors.tooLarge'))
  const reply = props.replyTo?.id ?? null
  emit('sent')
  await messages.send(
    props.chatId,
    { kind: 'file', attachment: { name: file.name, size: file.size, mime: file.type }, reply_to_id: reply },
    () => uploadAttachment(props.chatId, file, file.name),
  )
}

async function onPick(e: Event, kind: 'photo' | 'file') {
  const files = [...((e.target as HTMLInputElement).files ?? [])]
  ;(e.target as HTMLInputElement).value = ''
  showAttach.value = false
  for (const f of files) {
    if (kind === 'photo' && f.type.startsWith('image/')) await sendImage(f)
    else await sendFile(f)
  }
}

function onPaste(e: ClipboardEvent) {
  const files = [...(e.clipboardData?.files ?? [])]
  if (!files.length) return
  e.preventDefault()
  for (const f of files) void (f.type.startsWith('image/') ? sendImage(f) : sendFile(f))
}

function onDrop(e: DragEvent) {
  for (const f of [...(e.dataTransfer?.files ?? [])]) void (f.type.startsWith('image/') ? sendImage(f) : sendFile(f))
}
defineExpose({ onDrop })

async function sendSticker(s: string) {
  showEmoji.value = false
  emit('sent')
  await messages.send(props.chatId, { kind: 'sticker', content: s, reply_to_id: props.replyTo?.id ?? null })
}
async function sendGif(a: Attachment) {
  showEmoji.value = false
  emit('sent')
  await messages.send(props.chatId, { kind: 'gif', attachment: a, reply_to_id: props.replyTo?.id ?? null })
}
function insertEmoji(e: string) {
  const el = input.value
  if (!el) return void (text.value += e)
  const start = el.selectionStart ?? text.value.length
  const end = el.selectionEnd ?? start
  text.value = text.value.slice(0, start) + e + text.value.slice(end)
  void nextTick(() => {
    el.setSelectionRange(start + e.length, start + e.length)
  })
}

// ---- voice -------------------------------------------------------------------
async function startRecording() {
  try {
    await rec.start()
    vibrate(20)
  } catch {
    ui.toast(t('errors.mic'))
  }
}
async function finishRecording() {
  const r = await rec.stop()
  if (!r) return
  const ext = r.mime.includes('mp4') ? 'm4a' : r.mime.includes('ogg') ? 'ogg' : 'webm'
  const reply = props.replyTo?.id ?? null
  emit('sent')
  await messages.send(
    props.chatId,
    { kind: 'voice', attachment: { duration: r.duration, waveform: r.waveform, mime: r.mime, size: r.blob.size }, reply_to_id: reply, localUrl: URL.createObjectURL(r.blob) },
    () => uploadAttachment(props.chatId, r.blob, `voice.${ext}`),
  )
}

function openApps() {
  showAttach.value = false
  ui.openAppDrawer(props.chatId)
}

function closePopovers(e: PointerEvent) {
  if (!(e.target as HTMLElement).closest('.composer')) {
    showEmoji.value = false
    showAttach.value = false
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', closePopovers)
  autosize()
  if (wide.value) input.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closePopovers)
  realtime.stopTyping(props.chatId)
})

const replyName = computed(() => chats.people[props.replyTo?.sender_id ?? '']?.display_name ?? '')
function snippet(m: Message) {
  return m.kind === 'text' ? m.content : t(`kind.${m.kind}`)
}
</script>

<template>
  <div class="composer" data-no-swipe>
    <Transition name="pop">
      <div v-if="showEmoji" class="popover emoji-pop">
        <EmojiPanel @emoji="insertEmoji" @sticker="sendSticker" @gif="sendGif" />
      </div>
    </Transition>
    <Transition name="pop">
      <div v-if="showAttach" class="popover attach-pop">
        <button v-ripple @click="photoInput?.click()"><Icon name="image" :size="22" />{{ $t('attach.photo') }}</button>
        <button v-ripple @click="fileInput?.click()"><Icon name="file" :size="22" />{{ $t('attach.file') }}</button>
        <button v-ripple @click="openApps"><Icon name="apps" :size="22" />{{ $t('apps.title') }}</button>
      </div>
    </Transition>

    <div class="box">
      <Transition name="bar">
        <div v-if="editing || replyTo" class="context">
          <Icon :name="editing ? 'edit' : 'reply'" :size="22" class="ctx-icon" />
          <div class="ctx-body">
            <b>{{ editing ? $t('chat.editing') : replyName }}</b>
            <span class="ellipsis">{{ snippet((editing ?? replyTo)!) }}</span>
          </div>
          <button class="icon-btn" @click="emit('cancel')"><Icon name="close" :size="20" /></button>
        </div>
      </Transition>

      <div v-if="rec.recording.value" class="recording">
        <span class="rec-dot" :style="{ transform: `scale(${1 + rec.level.value * 1.5})` }" />
        <span class="rec-time">{{ formatDuration(rec.elapsed.value) }}</span>
        <span class="muted rec-hint">{{ $t('chat.recording') }}</span>
        <button class="btn ghost" @click="rec.cancel()">{{ $t('common.cancel') }}</button>
      </div>
      <div v-else class="input-row">
        <button class="icon-btn" :class="{ accent: showEmoji }" @click="showEmoji = !showEmoji; showAttach = false">
          <Icon name="smile" />
        </button>
        <textarea
          ref="input" v-model="text" rows="1" class="input" :placeholder="$t('chat.placeholder')"
          enterkeyhint="send" @keydown="onKeydown" @paste="onPaste"
        />
        <button v-if="!editing" class="icon-btn" :class="{ accent: showAttach }" @click="showAttach = !showAttach; showEmoji = false">
          <Icon name="attach" />
        </button>
      </div>
    </div>

    <button
      v-ripple class="send"
      :class="{ recording: rec.recording.value }"
      :title="canSend ? $t('chat.send') : $t('chat.recordVoice')"
      @click="rec.recording.value ? finishRecording() : canSend || editing ? submit() : startRecording()"
    >
      <Transition name="swap" mode="out-in">
        <Icon v-if="editing" key="check" name="check" />
        <Icon v-else-if="canSend || rec.recording.value" key="send" name="send" />
        <Icon v-else key="mic" name="mic" />
      </Transition>
    </button>

    <input ref="photoInput" type="file" accept="image/*" multiple hidden @change="onPick($event, 'photo')" />
    <input ref="fileInput" type="file" multiple hidden @change="onPick($event, 'file')" />
  </div>
</template>

<style scoped>
.composer {
  position: relative; display: flex; align-items: flex-end; gap: 8px;
  width: 100%; max-width: 760px; margin: 0 auto; padding: 6px 8px calc(8px + var(--safe-bottom));
}
.box { flex: 1; min-width: 0; background: var(--surface); border-radius: 22px; box-shadow: var(--shadow); overflow: hidden; }
.input-row { display: flex; align-items: flex-end; padding: 2px 4px; }
.input {
  flex: 1; min-height: 44px; max-height: 180px; padding: 11px 4px; border: 0; outline: none; resize: none;
  background: transparent; line-height: 22px; font-size: 16px;
}
.input-row .icon-btn { margin: 2px 0; }
.send {
  width: 52px; height: 52px; border-radius: 50%; flex: none; display: grid; place-items: center;
  background: var(--accent); color: var(--on-accent); box-shadow: var(--shadow);
  transition: transform 0.15s var(--ease-out), background 0.2s;
}
.send:active { transform: scale(0.92); }
.send.recording { background: var(--danger); color: #fff; animation: pulse 1.4s infinite; }
@keyframes pulse { 50% { box-shadow: 0 0 0 10px color-mix(in srgb, var(--danger) 20%, transparent); } }

.context { display: flex; align-items: center; gap: 10px; padding: 6px 4px 0 12px; }
.ctx-icon { color: var(--accent); flex: none; }
.ctx-body { flex: 1; min-width: 0; display: grid; border-left: 2px solid var(--accent); padding-left: 8px; font-size: 14px; }
.ctx-body b { color: var(--accent); font-weight: 600; }

.recording { display: flex; align-items: center; gap: 12px; height: 48px; padding: 0 8px 0 16px; }
.rec-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--danger); transition: transform 0.08s; }
.rec-time { font-variant-numeric: tabular-nums; font-weight: 600; }
.rec-hint { flex: 1; font-size: 14px; }

.popover { position: absolute; bottom: calc(100% - 4px); z-index: 25; }
.emoji-pop { left: 8px; width: min(360px, calc(100% - 16px)); transform-origin: bottom left; }
.attach-pop {
  right: 68px; display: grid; padding: 6px; min-width: 190px; border-radius: 14px; background: var(--surface);
  box-shadow: var(--shadow-lg); transform-origin: bottom right;
}
.attach-pop button { display: flex; align-items: center; gap: 14px; padding: 10px 12px; border-radius: 8px; font-weight: 500; }
.attach-pop button:hover { background: var(--hover); }

.bar-enter-active, .bar-leave-active { transition: max-height 0.2s var(--ease-out), opacity 0.2s; max-height: 60px; overflow: hidden; }
.bar-enter-from, .bar-leave-to { max-height: 0; opacity: 0; }
.swap-enter-active, .swap-leave-active { transition: transform 0.15s var(--ease-out), opacity 0.15s; }
.swap-enter-from { transform: scale(0.4) rotate(-45deg); opacity: 0; }
.swap-leave-to { transform: scale(0.4) rotate(45deg); opacity: 0; }
</style>
