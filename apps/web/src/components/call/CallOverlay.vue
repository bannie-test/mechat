<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { colorFor, formatDuration, initials } from '@/lib/format'
import { canShareScreen } from '@/lib/call/media'
import { tones } from '@/lib/call/sound'
import { vibrate } from '@/lib/motion'
import { useAuth } from '@/stores/auth'
import { useCall } from '@/stores/call'
import { useChats } from '@/stores/chats'
import { useUi } from '@/stores/ui'
import Avatar from '@/components/Avatar.vue'
import Icon from '@/components/Icon.vue'
import CallTile from './CallTile.vue'
import CallVideo from './CallVideo.vue'

const { t } = useI18n()
const call = useCall()
const chats = useChats()
const auth = useAuth()
const ui = useUi()

const shown = computed(() => call.inCall || call.phase === 'ended')
const title = computed(() => chats.title(call.chat))
const chatAvatar = computed(() => chats.avatar(call.chat))
const canShare = canShareScreen()

// ---------------------------------------------------------------------------
// Tiles & layout
// ---------------------------------------------------------------------------
interface Tile {
  tid: string
  userId: string
  name: string
  avatarUrl: string | null
  stream: MediaStream | null
  videoOn: boolean
  screen: boolean
  mic: boolean
  speaking: boolean
  connecting: boolean
  label?: string
}

const tiles = computed<Tile[]>(() => {
  const out: Tile[] = []
  if (call.phase === 'ended') return out // show the avatar + "Call ended · 3:12", not frozen video
  for (const p of call.participants) {
    const prof = chats.people[p.userId]
    const name = prof?.display_name ?? '…'
    const base = { userId: p.userId, name, avatarUrl: prof?.avatar_url ?? null, mic: p.mic }
    if (p.screen && p.screenStream) {
      out.push({ ...base, tid: `${p.peerId}:screen`, stream: p.screenStream, videoOn: true, screen: true, speaking: false, connecting: false, label: t('call.screenOf', { name }) })
    }
    out.push({ ...base, tid: `${p.peerId}:cam`, stream: p.camStream, videoOn: p.cam && !!p.camStream, screen: false, speaking: p.speaking, connecting: !p.connected })
  }
  if (call.screen && call.localScreen) {
    const me = chats.people[auth.userId ?? '']
    out.push({
      tid: 'me:screen', userId: auth.userId ?? '', name: t('call.yourScreen'), avatarUrl: me?.avatar_url ?? null,
      stream: call.localScreen, videoOn: true, screen: true, mic: call.mic, speaking: false, connecting: false,
    })
  }
  return out
})

const pinned = ref<string | null>(null)
// A newly shared screen comes into focus; a pin goes away with its tile.
watch(
  () => tiles.value.filter((x) => x.screen && x.tid !== 'me:screen').map((x) => x.tid),
  (keys, before) => {
    const fresh = keys.find((k) => !(before ?? []).includes(k))
    if (fresh) pinned.value = fresh
  },
)
watch(tiles, (list) => {
  if (pinned.value && !list.some((x) => x.tid === pinned.value)) pinned.value = null
})

const remoteCams = computed(() => tiles.value.filter((x) => !x.screen))
const main = computed<Tile | null>(() => {
  const p = pinned.value && tiles.value.find((x) => x.tid === pinned.value)
  if (p) return p
  if (remoteCams.value.length === 1) return remoteCams.value[0]
  return null
})
const others = computed(() => (main.value ? tiles.value.filter((x) => x.tid !== main.value!.tid) : tiles.value))
const mode = computed<'empty' | 'solo' | 'focus' | 'grid'>(() => {
  if (!tiles.value.length) return 'empty'
  if (main.value) return others.value.length ? 'focus' : 'solo'
  return 'grid'
})
const gridCols = computed(() => {
  const n = others.value.length
  return n <= 1 ? 1 : n <= 4 ? 2 : 3
})

/** Voice-only 1:1 (or nobody here yet): big avatar with name and status instead of video. */
const hero = computed(() => {
  if (mode.value === 'empty') return { ...chatAvatar.value, talking: false }
  const m = main.value
  if (mode.value === 'solo' && m && !m.videoOn) return { id: m.userId, name: m.name, url: m.avatarUrl, talking: m.speaking }
  return null
})

function togglePin(key: string) {
  pinned.value = pinned.value === key ? null : key
}

// ---------------------------------------------------------------------------
// Status line
// ---------------------------------------------------------------------------
const status = computed(() => {
  switch (call.phase) {
    case 'outgoing': return t('call.ringing')
    case 'connecting': return call.call && !call.participants.length && !call.incoming ? t('call.waiting') : t('call.connecting')
    case 'live': return call.reconnecting ? t('call.reconnecting') : formatDuration(call.duration / 1000)
    case 'ended': {
      const reason = { ended: 'call.ended', noAnswer: 'call.noAnswer', declined: 'call.declined', full: 'call.full' }[call.endReason]
      return call.endedAfter ? `${t(reason)} · ${formatDuration(call.endedAfter / 1000)}` : t(reason)
    }
    default: return ''
  }
})

const bg = computed(() => {
  const c = colorFor(call.chatId ?? 'x')
  return { background: `radial-gradient(120% 90% at 50% 20%, color-mix(in srgb, ${c} 55%, #121a24), #0a0f15 70%)` }
})

// ---------------------------------------------------------------------------
// Self view (draggable picture-in-picture, snaps to a corner)
// ---------------------------------------------------------------------------
const corner = ref<'tr' | 'tl' | 'br' | 'bl'>('tr')
const drag = ref<{ x: number; y: number } | null>(null)
let start = { x: 0, y: 0 }
let moved = false
function pipDown(e: PointerEvent) {
  start = { x: e.clientX, y: e.clientY }
  moved = false
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function pipMove(e: PointerEvent) {
  if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
  const dx = e.clientX - start.x
  const dy = e.clientY - start.y
  if (Math.abs(dx) + Math.abs(dy) > 6) moved = true
  if (moved) drag.value = { x: dx, y: dy }
}
function pipUp(e: PointerEvent) {
  if (moved) {
    const right = e.clientX > window.innerWidth / 2
    const bottom = e.clientY > window.innerHeight / 2
    corner.value = `${bottom ? 'b' : 't'}${right ? 'r' : 'l'}` as typeof corner.value
  }
  drag.value = null
}

// ---------------------------------------------------------------------------
// Remote audio (kept mounted while minimized)
// ---------------------------------------------------------------------------
const needsTap = ref(false)
const audioEls = new Set<HTMLAudioElement>()
function bindAudio(el: HTMLAudioElement | null, stream: MediaStream | null) {
  if (!el) return
  audioEls.add(el)
  if (el.srcObject !== stream) {
    el.srcObject = stream
    if (stream) el.play().catch(() => (needsTap.value = true))
  }
}
function unlockAudio() {
  needsTap.value = false
  for (const el of audioEls) if (el.isConnected) void el.play().catch(() => (needsTap.value = true))
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------
const tileRefs = new Map<string, InstanceType<typeof CallTile>>()
function setTileRef(key: string, el: unknown) {
  if (el) tileRefs.set(key, el as InstanceType<typeof CallTile>)
  else tileRefs.delete(key)
}
const selfVideo = ref<InstanceType<typeof CallVideo> | null>(null)
const flash = ref(false)
const shot = ref<{ blob: Blob; url: string; width: number; height: number; name: string } | null>(null)

function drawVideo(g: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number, contain: boolean) {
  const vw = v.videoWidth
  const vh = v.videoHeight
  if (!vw || !vh) return false
  const s = contain ? Math.min(w / vw, h / vh) : Math.max(w / vw, h / vh)
  const dw = vw * s
  const dh = vh * s
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  g.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  g.restore()
  return true
}

function drawPerson(g: CanvasRenderingContext2D, userId: string, name: string, x: number, y: number, w: number, h: number) {
  const grad = g.createRadialGradient(x + w / 2, y + h * 0.35, 10, x + w / 2, y + h / 2, Math.max(w, h) * 0.7)
  grad.addColorStop(0, colorFor(userId))
  grad.addColorStop(1, '#0f1720')
  g.fillStyle = grad
  g.fillRect(x, y, w, h)
  const r = Math.min(w, h) * 0.18
  g.fillStyle = colorFor(userId)
  g.beginPath()
  g.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fff'
  g.font = `600 ${Math.round(r * 0.8)}px system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(initials(name), x + w / 2, y + h / 2 + 2)
}

function drawLabel(g: CanvasRenderingContext2D, text: string, x: number, y: number) {
  g.font = '600 22px system-ui, sans-serif'
  const w = g.measureText(text).width + 24
  g.fillStyle = 'rgba(0,0,0,0.45)'
  g.beginPath()
  g.roundRect(x, y - 34, w, 34, 12)
  g.fill()
  g.fillStyle = '#fff'
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.fillText(text, x + 12, y - 17)
}

function compose(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  const m = main.value
  const focusVideo = m ? tileRefs.get(m.tid)?.videoEl() : null
  const self = selfVideo.value?.ready ? selfVideo.value.el : null
  if (m && focusVideo) {
    // What's in focus (a shared screen or the other person's camera), at full resolution.
    const scale = Math.min(1, 1920 / Math.max(focusVideo.videoWidth, focusVideo.videoHeight))
    c.width = Math.round(focusVideo.videoWidth * scale)
    c.height = Math.round(focusVideo.videoHeight * scale)
    g.drawImage(focusVideo, 0, 0, c.width, c.height)
    if (!m.screen && self) {
      const w = Math.round(c.width * 0.26)
      const h = Math.round((w * self.videoHeight) / Math.max(1, self.videoWidth))
      g.save()
      g.beginPath()
      g.roundRect(c.width - w - 24, 24, w, h, 18)
      g.clip()
      drawVideo(g, self, c.width - w - 24, 24, w, h, false)
      g.restore()
    }
  } else {
    // Everyone in a grid (avatars for cameras that are off), you included.
    const people: { key: string; userId: string; name: string; video: HTMLVideoElement | null; screen: boolean }[] = tiles.value.map((x) => ({
      key: x.tid, userId: x.userId, name: x.label ?? x.name, video: tileRefs.get(x.tid)?.videoEl() ?? null, screen: x.screen,
    }))
    people.push({ key: 'me', userId: auth.userId ?? '', name: t('call.you'), video: call.cam ? self : null, screen: false })
    const cols = people.length <= 1 ? 1 : people.length <= 4 ? 2 : 3
    const rows = Math.ceil(people.length / cols)
    const cw = 640
    const ch = 480
    c.width = cols * cw
    c.height = rows * ch
    g.fillStyle = '#0a0f15'
    g.fillRect(0, 0, c.width, c.height)
    people.forEach((p, i) => {
      const x = (i % cols) * cw
      const y = Math.floor(i / cols) * ch
      if (!p.video || !drawVideo(g, p.video, x + 3, y + 3, cw - 6, ch - 6, p.screen)) drawPerson(g, p.userId, p.name, x + 3, y + 3, cw - 6, ch - 6)
      drawLabel(g, p.name, x + 16, y + ch - 16)
    })
  }
  // Small stamp in the corner.
  const stamp = `iemanchat · ${new Date().toLocaleString()}`
  g.font = '500 18px system-ui, sans-serif'
  g.textAlign = 'right'
  g.textBaseline = 'bottom'
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillText(stamp, c.width - 15, c.height - 13)
  g.fillStyle = 'rgba(255,255,255,0.8)'
  g.fillText(stamp, c.width - 16, c.height - 14)
  return c
}

async function snap() {
  flash.value = true
  setTimeout(() => (flash.value = false), 450)
  tones.shutter()
  vibrate(20)
  const canvas = compose()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9))
  if (!blob) return
  if (shot.value) URL.revokeObjectURL(shot.value.url)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
  shot.value = { blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, name: `iemanchat-call-${stamp}.jpg` }
  call.notifyScreenshot()
}

async function saveShot() {
  const s = shot.value
  if (!s) return
  const file = new File([s.blob], s.name, { type: 'image/jpeg' })
  const touch = matchMedia('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => {})
  } else {
    const a = document.createElement('a')
    a.href = s.url
    a.download = s.name
    a.click()
    ui.toast(t('call.saved'), undefined, 1500)
  }
}

function closeShot() {
  if (shot.value) URL.revokeObjectURL(shot.value.url)
  shot.value = null
}

watch(() => call.inCall, (v) => { if (!v) closeShot() })
onBeforeUnmount(closeShot)
</script>

<template>
  <Teleport to="body">
    <!-- remote audio: always mounted during a call, also when minimized -->
    <div v-if="call.inCall" class="audio-sink" aria-hidden="true">
      <audio v-for="p in call.participants" :key="p.peerId" :ref="(el) => bindAudio(el as HTMLAudioElement | null, p.audio)" autoplay />
    </div>

    <Transition name="call">
      <div v-if="shown && !call.minimized" class="call" :class="[mode, call.phase]" :style="bg" @click="needsTap && unlockAudio()">
        <!-- own camera fills the screen while waiting for others -->
        <CallVideo v-if="mode === 'empty' && call.localCam" ref="selfVideo" class="self-bg" :stream="call.localCam" :mirror="call.facing === 'user'" />

        <div class="stage">
          <div v-if="hero" class="hero">
            <span class="pulse" :class="{ ringing: call.phase === 'outgoing' || call.phase === 'connecting', talking: hero.talking }">
              <Avatar :id="hero.id" :name="hero.name" :url="hero.url" :size="132" />
            </span>
            <b class="hero-name ellipsis">{{ title }}</b>
            <small class="hero-status" :class="{ warn: call.reconnecting }">{{ status }}</small>
          </div>

          <div v-else-if="main" class="main" @dblclick="togglePin(main.tid)">
            <CallTile v-for="m in [main]" :key="m.tid" :ref="(el) => setTileRef(m.tid, el)" v-bind="m" :avatar-url="m.avatarUrl" big />
          </div>

          <div v-if="mode === 'grid'" class="grid" :style="{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }">
            <CallTile
              v-for="x in others" :key="x.tid" :ref="(el) => setTileRef(x.tid, el)" v-bind="x" :avatar-url="x.avatarUrl"
              @click="togglePin(x.tid)"
            />
          </div>
          <div v-else-if="mode === 'focus'" class="strip">
            <CallTile
              v-for="x in others" :key="x.tid" :ref="(el) => setTileRef(x.tid, el)" v-bind="x" :avatar-url="x.avatarUrl"
              class="mini-tile" @click="togglePin(x.tid)"
            />
          </div>
        </div>

        <header class="top">
          <button class="round ghost" :title="t('call.minimize')" @click.stop="call.minimized = true"><Icon name="down" /></button>
          <div class="title">
            <template v-if="!hero">
              <b class="ellipsis">{{ title }}</b>
              <small :class="{ warn: call.reconnecting }">{{ status }}</small>
            </template>
          </div>
          <span class="round-spacer" />
        </header>

        <!-- self view -->
        <Transition name="pop">
          <div
            v-if="mode !== 'empty' && call.localCam" class="pip" :class="[corner, { dragging: !!drag }]"
            :style="drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined"
            @pointerdown="pipDown" @pointermove="pipMove" @pointerup="pipUp" @pointercancel="pipUp"
          >
            <CallVideo ref="selfVideo" :stream="call.localCam" :mirror="call.facing === 'user'" />
            <button v-if="call.canFlip" class="flip" :title="t('call.flip')" @pointerdown.stop @click.stop="call.flip()"><Icon name="flip" :size="18" /></button>
            <span v-if="call.meSpeaking" class="pip-talk" />
          </div>
        </Transition>

        <Transition name="fade">
          <button v-if="needsTap" class="tap-sound" @click.stop="unlockAudio"><Icon name="mic" :size="18" />{{ t('call.tapForSound') }}</button>
        </Transition>

        <footer class="controls" :class="{ hide: call.phase === 'ended' }">
          <button class="ctl" :class="{ on: call.cam }" @click.stop="call.toggleCam()">
            <span><Icon :name="call.cam ? 'videocam' : 'videocamOff'" /></span><small>{{ t('call.camera') }}</small>
          </button>
          <button class="ctl" :class="{ on: !call.mic }" @click.stop="call.toggleMic()">
            <span><Icon :name="call.mic ? 'mic' : 'micOff'" /></span><small>{{ call.mic ? t('call.mute') : t('call.unmute') }}</small>
          </button>
          <button v-if="canShare" class="ctl" :class="{ on: call.screen }" @click.stop="call.toggleScreen()">
            <span><Icon :name="call.screen ? 'stopScreenShare' : 'screenShare'" /></span><small>{{ call.screen ? t('call.stopScreen') : t('call.screen') }}</small>
          </button>
          <button class="ctl" :disabled="call.phase !== 'live'" @click.stop="snap">
            <span><Icon name="screenshot" /></span><small>{{ t('call.screenshot') }}</small>
          </button>
          <button class="ctl end" @click.stop="call.hangUp()">
            <span><Icon name="callEnd" /></span><small>{{ t('call.end') }}</small>
          </button>
        </footer>

        <!-- screenshot -->
        <div v-if="flash" class="flash" />
        <Transition name="shot">
          <div v-if="shot" class="shot" @click.stop>
            <img :src="shot.url" alt="" />
            <div class="shot-actions">
              <button class="chip primary" @click="saveShot"><Icon name="download" :size="16" />{{ t('call.save') }}</button>
              <button class="chip icon" :title="t('common.close')" @click="closeShot"><Icon name="close" :size="16" /></button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- minimized: a pill to get back to the call -->
    <Transition name="pill">
      <button v-if="call.inCall && call.minimized" class="mini-call" @click="call.minimized = false">
        <span class="live-dot" />
        <Icon :name="call.cam ? 'videocam' : 'phone'" :size="16" />
        <b class="ellipsis">{{ title }}</b>
        <span>{{ status }}</span>
      </button>
    </Transition>
  </Teleport>
</template>

<style scoped>
.audio-sink { position: fixed; width: 0; height: 0; overflow: hidden; }
.call {
  position: fixed; inset: 0; z-index: 300; color: #fff; overflow: hidden; display: flex; flex-direction: column;
  user-select: none; -webkit-user-select: none; touch-action: manipulation;
}
.self-bg { position: absolute; inset: 0; }
.self-bg::after { content: ''; }
.empty .stage::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.45), transparent 35%, transparent 60%, rgba(0, 0, 0, 0.55));
}
.stage { position: absolute; inset: 0; display: flex; flex-direction: column; }
.hero {
  position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 0 24px 140px; text-align: center; pointer-events: none; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.45);
}
.hero-name { margin-top: 22px; font-size: 26px; font-weight: 700; max-width: 100%; }
.hero-status { font-size: 16px; opacity: 0.85; font-variant-numeric: tabular-nums; }
.hero-status.warn { color: #ffd166; }
.pulse { position: relative; display: grid; border-radius: 50%; }
.pulse::before, .pulse::after {
  content: ''; position: absolute; inset: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.18); z-index: -1;
}
.pulse.ringing::before, .pulse.talking::before { animation: halo 2s ease-out infinite; }
.pulse.ringing::after, .pulse.talking::after { animation: halo 2s ease-out 1s infinite; }
.pulse.talking::before, .pulse.talking::after { background: rgba(74, 222, 128, 0.35); }
@keyframes halo { from { transform: scale(1); opacity: 0.8; } to { transform: scale(1.9); opacity: 0; } }

.main { position: relative; flex: 1; display: grid; min-height: 0; }
.focus .main { flex: 1 1 auto; }
.main :deep(.tile) { width: 100%; height: 100%; }

.grid {
  flex: 1; display: grid; gap: 8px; padding: calc(76px + var(--safe-top)) 10px calc(120px + var(--safe-bottom));
  grid-auto-rows: 1fr; min-height: 0;
}
.grid :deep(.tile) { cursor: pointer; }
.strip {
  position: absolute; left: 0; right: 0; bottom: calc(112px + var(--safe-bottom)); display: flex; gap: 8px; padding: 0 10px;
  overflow-x: auto; scrollbar-width: none;
}
.mini-tile { flex: none; width: 112px; height: 84px; cursor: pointer; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4); }
.mini-tile :deep(.label) { font-size: 11px; padding: 2px 6px; left: 4px; bottom: 4px; }

.top {
  position: absolute; z-index: 5; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 8px;
  padding: calc(10px + var(--safe-top)) 12px 18px; background: linear-gradient(180deg, rgba(0, 0, 0, 0.45), transparent);
}
.title { flex: 1; min-width: 0; display: grid; justify-items: center; text-align: center; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45); }
.title b { font-size: 19px; max-width: 100%; }
.title small { font-size: 14px; opacity: 0.85; font-variant-numeric: tabular-nums; }
.title small.warn { color: #ffd166; }
.round { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; color: #fff; }
.round.ghost { background: rgba(255, 255, 255, 0.14); backdrop-filter: blur(8px); }
.round-spacer { width: 42px; }

.pip {
  position: absolute; z-index: 3; width: 112px; aspect-ratio: 3 / 4; border-radius: 16px; overflow: hidden;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45); background: #111; touch-action: none; cursor: grab;
  transition: top 0.3s var(--ease-out), bottom 0.3s var(--ease-out), left 0.3s var(--ease-out), right 0.3s var(--ease-out);
}
.pip.dragging { transition: none; cursor: grabbing; }
.pip.tr { top: calc(76px + var(--safe-top)); right: 12px; }
.pip.tl { top: calc(76px + var(--safe-top)); left: 12px; }
.pip.br { bottom: calc(124px + var(--safe-bottom)); right: 12px; }
.pip.bl { bottom: calc(124px + var(--safe-bottom)); left: 12px; }
.focus .pip.br, .focus .pip.bl { bottom: calc(210px + var(--safe-bottom)); }
.flip { position: absolute; right: 6px; bottom: 6px; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: rgba(0, 0, 0, 0.45); }
.pip-talk { position: absolute; inset: 0; border-radius: 16px; box-shadow: inset 0 0 0 3px #4ade80; pointer-events: none; }

.controls {
  position: absolute; z-index: 5; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: clamp(10px, 4vw, 26px);
  padding: 22px 12px calc(18px + var(--safe-bottom)); background: linear-gradient(0deg, rgba(0, 0, 0, 0.5), transparent);
  transition: transform 0.3s var(--ease-out), opacity 0.3s;
}
.controls.hide { transform: translateY(40px); opacity: 0; pointer-events: none; }
.ctl { display: grid; justify-items: center; gap: 6px; color: #fff; }
.ctl span {
  width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(10px); transition: background 0.2s, color 0.2s, transform 0.12s;
}
.ctl:active span { transform: scale(0.92); }
.ctl.on span { background: #fff; color: #10161d; }
.ctl.end span { background: #f04848; }
.ctl:disabled { opacity: 0.4; }
.ctl small { font-size: 12px; opacity: 0.9; white-space: nowrap; }

.tap-sound {
  position: absolute; z-index: 4; left: 50%; top: calc(84px + var(--safe-top)); transform: translateX(-50%); display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 18px; background: rgba(255, 255, 255, 0.92); color: #10161d; font-weight: 600; font-size: 14px;
}

.flash { position: absolute; inset: 0; z-index: 10; background: #fff; pointer-events: none; animation: flash 0.45s ease-out forwards; }
@keyframes flash { from { opacity: 0.9; } to { opacity: 0; } }
.shot {
  position: absolute; z-index: 6; left: 12px; top: calc(70px + var(--safe-top)); width: min(244px, 62vw); padding: 8px;
  border-radius: 18px; background: rgba(20, 26, 34, 0.86); backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  display: grid; gap: 8px;
}
.shot img { width: 100%; border-radius: 12px; display: block; max-height: 40vh; object-fit: contain; background: #000; }
.shot-actions { display: flex; gap: 6px; }
.chip { flex: 1; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 34px; border-radius: 17px; background: rgba(255, 255, 255, 0.14); color: #fff; font-size: 13px; font-weight: 600; }
.chip.primary { flex: 1.5; background: var(--accent); }
.chip.icon { flex: none; width: 34px; }

.mini-call {
  position: fixed; z-index: 300; top: calc(8px + var(--safe-top)); left: 50%; transform: translateX(-50%);
  max-width: min(420px, calc(100% - 24px)); display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 22px;
  background: #2fb36a; color: #fff; font-size: 14px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.mini-call span:last-child { font-variant-numeric: tabular-nums; opacity: 0.9; }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: blink 1.2s ease-in-out infinite; }
@keyframes blink { 50% { opacity: 0.3; } }

.call-enter-active, .call-leave-active { transition: transform 0.35s var(--ease-out), opacity 0.3s; }
.call-enter-from, .call-leave-to { transform: translateY(6%) scale(0.98); opacity: 0; }
.shot-enter-active, .shot-leave-active { transition: transform 0.35s var(--ease-out), opacity 0.25s; }
.shot-enter-from, .shot-leave-to { transform: translateY(-16px) scale(0.92); opacity: 0; }
.pill-enter-active, .pill-leave-active { transition: transform 0.3s var(--ease-out), opacity 0.25s; }
.pill-enter-from, .pill-leave-to { transform: translate(-50%, -20px); opacity: 0; }

@media (min-width: 900px) {
  .pip { width: 200px; aspect-ratio: 4 / 3; }
  .mini-tile { width: 160px; height: 110px; }
}
</style>
